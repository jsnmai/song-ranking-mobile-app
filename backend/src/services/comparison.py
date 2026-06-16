"""Business logic for binary insertion comparison sessions."""
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from src.crud.comparison import (
    create_comparison,
    create_comparison_session,
    delete_comparison_session,
    delete_expired_comparison_sessions,
    get_expired_comparison_sessions,
    get_user_comparison_session,
    refresh_comparison_session,
    update_session_progress,
)
from src.crud.interaction_event import create_interaction_event
from src.crud.rating import get_user_ranking_by_song, list_user_bucket_rankings
from src.crud.song import get_by_deezer_id, get_by_id
from src.pydantic_schemas.comparison import (
    ComparisonBucketRankingItem,
    ComparisonChoiceRequest,
    ComparisonSessionCancelResponse,
    ComparisonSessionFinalizeResponse,
    ComparisonSessionResponse,
    ComparisonSessionStartRequest,
)
from src.pydantic_schemas.rating import RatingFinalizeRequest
from src.pydantic_schemas.song import SongCreate
from src.services.rating import (
    build_ranking_response,
    build_rating_finalize_response,
    persist_finalized_rating,
    refresh_finalized_rating,
)
from src.sqlalchemy_tables.comparison_session import ComparisonSession
from src.sqlalchemy_tables.ranking import Ranking

COMPARISON_SESSION_TTL = timedelta(hours=24)


def start_comparison_session(
    db: Session,
    user_id: int,
    data: ComparisonSessionStartRequest,
) -> ComparisonSessionResponse:
    """Start one comparison session for one target song in one non-empty bucket."""
    try:
        _delete_expired_sessions(db)
        bucket_rankings = _rankings_in_session_bucket(
            db,
            user_id=user_id,
            data=data,
        )
        if not bucket_rankings:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Comparison session is not required for an empty bucket.",
            )

        low_index = 0
        high_index = len(bucket_rankings)
        candidate_index = _midpoint_index(
            low_index,
            high_index,
        )
        session = create_comparison_session(
            db,
            user_id=user_id,
            song_payload=data.song.model_dump(),
            bucket=data.bucket,
            note=data.note,
            low_index=low_index,
            high_index=high_index,
            candidate_index=candidate_index,
            candidate_song_id=bucket_rankings[candidate_index].song_id,
        )
        db.commit()
        refresh_comparison_session(
            db,
            session,
        )
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise

    return _session_response(
        db,
        user_id,
        session,
    )


def record_comparison_choice(
    db: Session,
    user_id: int,
    session_uuid: UUID,
    data: ComparisonChoiceRequest,
) -> ComparisonSessionResponse:
    """Record one comparison choice and advance binary insertion state."""
    session = _get_session_or_404(
        db,
        user_id,
        session_uuid,
    )
    if session.final_position is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Comparison session is already ready to finalize.",
        )
    if session.candidate_index is None or session.candidate_song_id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Comparison session has no active comparison.",
        )

    bucket_rankings = _session_bucket_rankings(
        db,
        user_id,
        session,
    )
    if session.candidate_index >= len(bucket_rankings):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Comparison session is stale.",
        )

    now = datetime.now(timezone.utc)
    decisions = list(session.decisions or [])
    decisions.append(
        {
            "candidate_song_id": session.candidate_song_id,
            "winner": data.winner,
            "decision_duration_ms": data.decision_duration_ms,
            "created_at": now.isoformat(),
        }
    )

    low_index = session.low_index
    high_index = session.high_index
    if data.winner == "target":
        high_index = session.candidate_index
    else:
        low_index = session.candidate_index + 1

    if low_index == high_index:
        update_session_progress(
            session,
            low_index=low_index,
            high_index=high_index,
            candidate_index=None,
            candidate_song_id=None,
            final_position=low_index + 1,
            decisions=decisions,
        )
    else:
        candidate_index = _midpoint_index(
            low_index,
            high_index,
        )
        update_session_progress(
            session,
            low_index=low_index,
            high_index=high_index,
            candidate_index=candidate_index,
            candidate_song_id=bucket_rankings[candidate_index].song_id,
            final_position=None,
            decisions=decisions,
        )

    try:
        db.commit()
        refresh_comparison_session(
            db,
            session,
        )
    except Exception:
        db.rollback()
        raise

    return _session_response(
        db,
        user_id,
        session,
    )


def finalize_comparison_session(
    db: Session,
    user_id: int,
    session_uuid: UUID,
) -> ComparisonSessionFinalizeResponse:
    """Finalize a completed comparison session into rankings, events, and comparisons."""
    session = _get_session_or_404(
        db,
        user_id,
        session_uuid,
    )
    if session.final_position is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Comparison session is not ready to finalize.",
        )

    try:
        finalized_rating = persist_finalized_rating(
            db,
            user_id=user_id,
            data=RatingFinalizeRequest(
                song=SongCreate.model_validate(session.song_payload),
                bucket=session.bucket,
                position=session.final_position,
                note=session.note,
            ),
            source="comparison",
            comparison_session_uuid=session.session_uuid,
        )
        finalized_at = datetime.now(timezone.utc)
        _write_comparisons(
            db,
            session,
            target_song_id=finalized_rating.song.id,
            finalized_at=finalized_at,
        )
        delete_comparison_session(
            db,
            session,
        )
        db.commit()
        refresh_finalized_rating(
            db,
            finalized_rating,
        )
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise

    return ComparisonSessionFinalizeResponse(
        result=build_rating_finalize_response(finalized_rating),
    )


def cancel_comparison_session(
    db: Session,
    user_id: int,
    session_uuid: UUID,
) -> ComparisonSessionCancelResponse:
    """Cancel a comparison session, tombstoning it before deleting temporary state."""
    session = _get_session_or_404(
        db,
        user_id,
        session_uuid,
    )
    try:
        # Hesitation signal: a started-then-abandoned verdict is un-backfillable
        # behavioral data (AUXSTROLOGY.md §14) — record it before the delete.
        _tombstone_session(
            db,
            session,
            event_type="comparison_canceled",
        )
        delete_comparison_session(
            db,
            session,
        )
        db.commit()
    except Exception:
        db.rollback()
        raise

    return ComparisonSessionCancelResponse(
        session_uuid=session_uuid,
        canceled=True,
    )


def _rankings_in_session_bucket(
    db: Session,
    user_id: int,
    data: ComparisonSessionStartRequest,
) -> list[Ranking]:
    """Return candidate rankings, excluding the target's current ranking on rerate."""
    existing_song = get_by_deezer_id(
        db,
        data.song.deezer_id,
    )
    existing_ranking = None
    if existing_song is not None:
        existing_ranking = get_user_ranking_by_song(
            db,
            user_id,
            existing_song.id,
        )

    return [
        ranking
        for ranking in list_user_bucket_rankings(
            db,
            user_id,
            data.bucket,
        )
        if existing_ranking is None or ranking.id != existing_ranking.id
    ]


def _session_bucket_rankings(
    db: Session,
    user_id: int,
    session: ComparisonSession,
) -> list[Ranking]:
    """Return current candidates for an existing session."""
    song_payload = SongCreate.model_validate(session.song_payload)
    existing_song = get_by_deezer_id(
        db,
        song_payload.deezer_id,
    )
    existing_ranking = None
    if existing_song is not None:
        existing_ranking = get_user_ranking_by_song(
            db,
            user_id,
            existing_song.id,
        )

    return [
        ranking
        for ranking in list_user_bucket_rankings(
            db,
            user_id,
            session.bucket,
        )
        if existing_ranking is None or ranking.id != existing_ranking.id
    ]


def _session_response(
    db: Session,
    user_id: int,
    session: ComparisonSession,
) -> ComparisonSessionResponse:
    """Build a response for the current comparison-session state."""
    bucket_rankings = _session_bucket_rankings(
        db,
        user_id,
        session,
    )
    candidate = None
    if session.candidate_song_id is not None:
        candidate_ranking = get_user_ranking_by_song(
            db,
            user_id,
            session.candidate_song_id,
        )
        candidate_song = get_by_id(
            db,
            session.candidate_song_id,
        )
        if candidate_ranking is None or candidate_song is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Comparison session is stale.",
            )
        candidate = build_ranking_response(
            candidate_ranking,
            candidate_song,
        )

    return ComparisonSessionResponse(
        session_uuid=session.session_uuid,
        bucket=session.bucket,
        status="ready_to_finalize" if session.final_position is not None else "active",
        target_song=SongCreate.model_validate(session.song_payload),
        candidate=candidate,
        final_position=session.final_position,
        comparison_count=len(session.decisions or []),
        low_index=session.low_index,
        high_index=session.high_index,
        candidate_index=session.candidate_index,
        total_in_bucket=len(bucket_rankings),
        current_bucket_rankings=_bucket_ranking_items(
            db,
            bucket_rankings,
        ),
        created_at=session.created_at,
    )


def _bucket_ranking_items(
    db: Session,
    bucket_rankings: list[Ranking],
) -> list[ComparisonBucketRankingItem]:
    """Return the current ordered bucket ladder for comparison UI previews."""
    items = []
    for ranking in bucket_rankings:
        song = get_by_id(
            db,
            ranking.song_id,
        )
        if song is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Comparison session is stale.",
            )
        items.append(
            ComparisonBucketRankingItem(
                song_id=ranking.song_id,
                title=song.title,
                artist=song.artist,
                cover_url=song.cover_url,
            )
        )
    return items


def _get_session_or_404(
    db: Session,
    user_id: int,
    session_uuid: UUID,
) -> ComparisonSession:
    """Return a user-scoped active session, or 404."""
    session = get_user_comparison_session(
        db,
        user_id,
        session_uuid,
    )
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comparison session not found.",
        )
    if _is_session_expired(session):
        try:
            delete_comparison_session(
                db,
                session,
            )
            db.commit()
        except Exception:
            db.rollback()
            raise

        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Comparison session expired.",
        )
    return session


def _delete_expired_sessions(
    db: Session,
) -> None:
    """Remove abandoned active sessions opportunistically before creating a new one."""
    cutoff = _session_expiry_cutoff()
    for session in get_expired_comparison_sessions(
        db,
        cutoff,
    ):
        _tombstone_session(
            db,
            session,
            event_type="comparison_abandoned",
        )
    delete_expired_comparison_sessions(
        db,
        cutoff,
    )


def _tombstone_session(
    db: Session,
    session: ComparisonSession,
    event_type: str,
) -> None:
    """
    Write an interaction event capturing a session that ended without a verdict.

    Context follows the collection charter: ids, counts, and durations only.
    The target song may not have a songs row yet (songs persist only on action),
    so the payload's deezer_id is kept in context instead of a song_id FK.
    """
    payload = session.song_payload or {}
    elapsed_ms = int(
        (session.updated_at - session.created_at).total_seconds() * 1000
    )
    create_interaction_event(
        db,
        user_id=session.user_id,
        event_type=event_type,
        song_id=session.candidate_song_id,
        context={
            "bucket": session.bucket,
            "decisions_count": len(session.decisions or []),
            "elapsed_ms": max(elapsed_ms, 0),
            "deezer_id": payload.get("deezer_id"),
        },
    )


def _is_session_expired(
    session: ComparisonSession,
) -> bool:
    """Return true when an active session has been abandoned past the TTL."""
    return session.updated_at < _session_expiry_cutoff()


def _session_expiry_cutoff() -> datetime:
    """Return the updated_at cutoff for active comparison-session expiry."""
    return datetime.now(timezone.utc) - COMPARISON_SESSION_TTL


def _write_comparisons(
    db: Session,
    session: ComparisonSession,
    target_song_id: int,
    finalized_at: datetime,
) -> None:
    """Persist all temporary decisions as append-only comparison rows."""
    for index, decision in enumerate(session.decisions or [], start=1):
        candidate_song_id = int(decision["candidate_song_id"])
        winner_id = target_song_id if decision["winner"] == "target" else candidate_song_id
        create_comparison(
            db,
            session_uuid=session.session_uuid,
            user_id=session.user_id,
            song_a_id=candidate_song_id,
            song_b_id=target_song_id,
            winner_id=winner_id,
            bucket=session.bucket,
            comparison_index_in_session=index,
            decision_duration_ms=decision.get("decision_duration_ms"),
            created_at=datetime.fromisoformat(decision["created_at"]),
            finalized_at=finalized_at,
        )


def _midpoint_index(
    low_index: int,
    high_index: int,
) -> int:
    """Return the next binary-insertion candidate index."""
    return (low_index + high_index) // 2
