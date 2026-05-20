"""Business logic for binary insertion comparison sessions."""
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from src.crud.comparison import (
    commit_changes,
    create_comparison,
    create_comparison_session,
    delete_comparison_session,
    delete_expired_comparison_sessions,
    get_user_comparison_session,
    refresh_comparison_session,
    update_session_progress,
)
from src.crud.rating import get_user_ranking_by_song, list_user_bucket_rankings
from src.crud.song import get_by_deezer_id, get_by_id
from src.pydantic_schemas.comparison import (
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
    refresh_finalized_rating,
    write_finalized_rating,
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
        bucket_rankings = _target_bucket_rankings(
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
        commit_changes(db)
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
        commit_changes(db)
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
        finalized_rating = write_finalized_rating(
            db,
            user_id=user_id,
            data=RatingFinalizeRequest(
                song=SongCreate.model_validate(session.song_payload),
                bucket=session.bucket,
                position=session.final_position,
                note=session.note,
            ),
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
        commit_changes(db)
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
    """Cancel a comparison session and delete all temporary state."""
    session = _get_session_or_404(
        db,
        user_id,
        session_uuid,
    )
    try:
        delete_comparison_session(
            db,
            session,
        )
        commit_changes(db)
    except Exception:
        db.rollback()
        raise

    return ComparisonSessionCancelResponse(
        session_uuid=session_uuid,
        canceled=True,
    )


def _target_bucket_rankings(
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
        created_at=session.created_at,
    )


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
            commit_changes(db)
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
    delete_expired_comparison_sessions(
        db,
        _session_expiry_cutoff(),
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
    for decision in session.decisions or []:
        candidate_song_id = int(decision["candidate_song_id"])
        winner_id = target_song_id if decision["winner"] == "target" else candidate_song_id
        create_comparison(
            db,
            session_uuid=session.session_uuid,
            user_id=session.user_id,
            song_a_id=candidate_song_id,
            song_b_id=target_song_id,
            winner_id=winner_id,
            created_at=datetime.fromisoformat(decision["created_at"]),
            finalized_at=finalized_at,
        )


def _midpoint_index(
    low_index: int,
    high_index: int,
) -> int:
    """Return the next binary-insertion candidate index."""
    return (low_index + high_index) // 2
