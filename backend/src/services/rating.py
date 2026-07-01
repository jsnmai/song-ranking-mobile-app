"""Business logic for ratings, rankings, and rating events."""
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from src.crud.rating import (
    RankingRow,
    apply_ranking_state,
    create_ranking,
    create_rating_event,
    delete_ranking,
    get_user_ranking_by_deezer_id,
    get_user_ranking_by_song,
    list_all_user_rankings_with_songs,
    list_user_bucket_rankings,
    list_user_bucket_rankings_with_songs,
    list_user_rankings_with_songs,
    refresh_ranking_event_pair,
    refresh_rating_event,
    refresh_rating_events,
)
from src.crud.report import create_report, get_rating_event_for_report
from src.crud.song import (
    adjust_song_aggregate,
    decrement_song_aggregate,
    get_by_id,
    increment_song_aggregate,
    upsert_from_deezer,
)
from src.crud.song_provider_ref import ensure_deezer_legacy_ref
from src.pydantic_schemas.profile import ProfileReportResponse, RatingEventReportCreate
from src.pydantic_schemas.rating import (
    RankingAnchorsResponse,
    RankingListResponse,
    RankingReorderRequest,
    RankingReorderResponse,
    RankingResponse,
    RatingEventResponse,
    RatingFinalizeRequest,
    RatingFinalizeResponse,
    RatingRemoveResponse,
)
from src.pydantic_schemas.song import SongResponse
from src.services.access import can_view_profile, can_view_taste
from src.services.provider_catalog import resolve_song_for_finalize
from src.services.streak import record_rating_activity
from src.sqlalchemy_tables.ranking import Ranking
from src.sqlalchemy_tables.rating_event import RatingEvent
from src.sqlalchemy_tables.song import Song

BUCKET_SCORE_RANGES = {
    "like": {
        "min": 7.5,
        "max": 10.0,
        "midpoint": 8.75,
    },
    "alright": {
        "min": 5.0,
        "max": 7.4,
        "midpoint": 6.2,
    },
    "dislike": {
        "min": 0.0,
        "max": 4.0,
        "midpoint": 2.0,
    },
}
DEFAULT_RANKING_LIMIT = 20
MAX_RANKING_LIMIT = 50
BUCKET_ORDER = ("like", "alright", "dislike")


@dataclass(frozen=True)
class FinalizedRatingState:
    """Uncommitted finalized rating objects used by rating and comparison flows."""

    ranking: Ranking
    rating_event: RatingEvent
    song: Song


@dataclass(frozen=True)
class RankingPlacementState:
    """Ranking placement plus before/after score snapshots for aggregate deltas."""

    ranking: Ranking
    created_ranking: bool
    old_scores_by_song_id: dict[int, float]
    new_scores_by_song_id: dict[int, float]


def finalize_rating(
    db: Session,
    user_id: int,
    data: RatingFinalizeRequest,
) -> RatingFinalizeResponse:
    """
    Persist a finalized rating and write one event for the intentionally changed song.

    1. Upsert the user-touched song without committing early.
    2. Insert or move that user's ranking into a contiguous bucket position.
    3. Recalculate affected bucket scores server-side.
    4. Write one append-only `rating_events` row.
    5. Commit the whole rating write atomically.

    MusicBrainz enrichment is NOT triggered here — the router schedules it as a
    BackgroundTask after this function returns, so the request thread is never held.
    """
    try:
        finalized_rating = persist_finalized_rating(
            db,
            user_id=user_id,
            data=data,
        )
        db.commit()
        refresh_ranking_event_pair(
            db,
            finalized_rating.ranking,
            finalized_rating.rating_event,
        )
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise

    response = build_rating_finalize_response(finalized_rating)
    # Best-effort, post-commit: this counts the rating toward the weekly streak.
    # It is fully guarded internally and must never affect the committed rating.
    record_rating_activity(
        db,
        user_id,
    )
    return response


def persist_finalized_rating(
    db: Session,
    user_id: int,
    data: RatingFinalizeRequest,
    source: str = "direct",
    comparison_session_uuid: UUID | None = None,
) -> FinalizedRatingState:
    """
    Write ranking and rating_event rows without committing.

    Comparison-session finalization reuses this so rankings, events,
    comparisons, and session deletion can commit atomically.
    """
    if data.song.provider == "listn" and data.song.id is not None:
        song = get_by_id(
            db,
            data.song.id,
        )
        if song is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Song not found.",
            )
    elif data.song.provider == "apple":
        song = resolve_song_for_finalize(
            db,
            data.song,
        )
    else:
        song = upsert_from_deezer(
            db,
            data.song,
        )
        ensure_deezer_legacy_ref(
            db,
            song,
        )
    existing_ranking = get_user_ranking_by_song(
        db,
        user_id,
        song.id,
    )
    previous_bucket = existing_ranking.bucket if existing_ranking else None
    previous_position = existing_ranking.position if existing_ranking else None
    previous_score = existing_ranking.score if existing_ranking else None
    new_position = _determine_insertion_position(
        db,
        user_id=user_id,
        bucket=data.bucket,
        current_ranking=existing_ranking,
        requested_position=data.position,
    )
    placement = _place_ranking(
        db,
        user_id=user_id,
        song_id=song.id,
        bucket=data.bucket,
        position=new_position,
        current_ranking=existing_ranking,
    )
    _apply_placement_aggregate_deltas(
        db,
        placement,
    )
    rating_event = create_rating_event(
        db,
        user_id=user_id,
        song_id=song.id,
        event_type="rerated" if existing_ranking else "rated",
        previous_bucket=previous_bucket,
        new_bucket=placement.ranking.bucket,
        previous_position=previous_position,
        new_position=placement.ranking.position,
        previous_score=previous_score,
        new_score=placement.ranking.score,
        note=data.note,
        source=source,
        comparison_session_uuid=comparison_session_uuid,
        event_metadata=_decision_context_metadata(data),
    )
    return FinalizedRatingState(
        ranking=placement.ranking,
        rating_event=rating_event,
        song=song,
    )


def _decision_context_metadata(
    data: RatingFinalizeRequest,
) -> dict[str, Any] | None:
    """
    Build capture-now decision context for rating_events.event_metadata.

    getattr-based because comparison finalization reuses persist_finalized_rating
    with request shapes that may not carry these fields. deliberation_ms is
    computed server-side so a skewed client clock can only distort, not break,
    the value (clamped to 0..24h).
    """
    metadata: dict[str, Any] = {}
    discovery_source = getattr(data, "discovery_source", None)
    if discovery_source is not None:
        metadata["discovery_source"] = discovery_source
    rating_started_at = getattr(data, "rating_started_at", None)
    if rating_started_at is not None and rating_started_at.tzinfo is not None:
        elapsed_ms = int(
            (datetime.now(timezone.utc) - rating_started_at).total_seconds() * 1000
        )
        metadata["deliberation_ms"] = min(
            max(elapsed_ms, 0),
            24 * 60 * 60 * 1000,
        )
    return metadata or None


def build_rating_finalize_response(
    finalized_rating: FinalizedRatingState,
) -> RatingFinalizeResponse:
    """Build the public finalized-rating response shape."""
    return RatingFinalizeResponse(
        ranking=_ranking_response(
            finalized_rating.ranking,
            finalized_rating.song,
        ),
        rating_event=_rating_event_response(finalized_rating.rating_event),
    )


def refresh_finalized_rating(
    db: Session,
    finalized_rating: FinalizedRatingState,
) -> None:
    """Refresh finalized rating rows after an outer service commits them."""
    refresh_ranking_event_pair(
        db,
        finalized_rating.ranking,
        finalized_rating.rating_event,
    )


def build_ranking_response(
    ranking: Ranking,
    song: Song,
) -> RankingResponse:
    """Build a public ranking response from a ranking row and song row."""
    return _ranking_response(
        ranking,
        song,
    )


def remove_rating(
    db: Session,
    user_id: int,
    song_id: int,
) -> RatingRemoveResponse:
    """
    Remove one current ranking and compact the remaining bucket positions.

    The song row is retained because it remains part of LISTn's durable graph,
    and the removal itself is recorded as append-only product history.
    """
    ranking = get_user_ranking_by_song(
        db,
        user_id,
        song_id,
    )
    if ranking is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rating not found.",
        )

    previous_bucket = ranking.bucket
    previous_position = ranking.position
    previous_score = ranking.score

    try:
        delete_ranking(
            db,
            ranking,
        )
        remaining_bucket_rankings = list_user_bucket_rankings(
            db,
            user_id,
            previous_bucket,
        )
        old_scores_by_song_id = _score_snapshot(remaining_bucket_rankings)
        _recalculate_bucket(
            remaining_bucket_rankings,
            previous_bucket,
        )
        new_scores_by_song_id = _score_snapshot(remaining_bucket_rankings)
        decrement_song_aggregate(
            db,
            song_id,
            previous_score,
        )
        _apply_score_adjustments(
            db,
            old_scores_by_song_id,
            new_scores_by_song_id,
        )
        rating_event = create_rating_event(
            db,
            user_id=user_id,
            song_id=song_id,
            event_type="removed",
            previous_bucket=previous_bucket,
            new_bucket=None,
            previous_position=previous_position,
            new_position=None,
            previous_score=previous_score,
            new_score=None,
            note=None,
            source="remove",
        )
        db.commit()
        refresh_rating_event(
            db,
            rating_event,
        )
    except Exception:
        db.rollback()
        raise

    return RatingRemoveResponse(
        rating_event=_rating_event_response(rating_event),
    )


def get_my_ranking_by_deezer_id(
    db: Session,
    user_id: int,
    deezer_id: int,
) -> RankingResponse:
    """Return one current ranking by provider ID for search-result navigation."""
    row = get_user_ranking_by_deezer_id(
        db,
        user_id,
        deezer_id,
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rating not found.",
        )
    return _ranking_with_song_response(row)


def get_my_ranking_by_song_id(
    db: Session,
    user_id: int,
    song_id: int,
) -> RankingResponse:
    """Return one current ranking by durable LISTn song ID."""
    ranking = get_user_ranking_by_song(
        db,
        user_id,
        song_id,
    )
    if ranking is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rating not found.",
        )
    song = db.get(Song, song_id)
    if song is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rating not found.",
        )
    return _ranking_response(
        ranking,
        song,
    )


def reorder_rankings(
    db: Session,
    user_id: int,
    data: RankingReorderRequest,
) -> RankingReorderResponse:
    """
    Save a full-list reorder without creating comparison rows.

    Reorder can update positions and buckets. Only bucket-crossing songs receive
    `rating_events` rows because position-only drag edits are current-state changes.
    """
    current_rows = list_all_user_rankings_with_songs(
        db,
        user_id,
    )
    current_by_song_id = {
        row.ranking.song_id: row
        for row in current_rows
    }
    _validate_reorder_song_ids(
        current_song_ids=set(current_by_song_id),
        submitted_song_ids=[
            item.song_id
            for item in data.rankings
        ],
    )

    previous_state = {
        row.ranking.song_id: {
            "bucket": row.ranking.bucket,
            "position": row.ranking.position,
            "score": row.ranking.score,
        }
        for row in current_rows
    }
    bucket_rankings = {
        bucket: []
        for bucket in BUCKET_ORDER
    }
    for item in data.rankings:
        bucket_rankings[item.bucket].append(current_by_song_id[item.song_id].ranking)

    affected_song_ids = [
        item.song_id
        for item in data.rankings
        if previous_state[item.song_id]["bucket"] != item.bucket
    ]
    event_metadata = {
        "session_type": "reorder",
        "songs_affected": len(affected_song_ids),
        "affected_song_ids": affected_song_ids,
    }
    rating_events = []

    try:
        for bucket, rankings in bucket_rankings.items():
            _recalculate_bucket(
                rankings,
                bucket,
            )

        new_scores_by_song_id = {
            song_id: row.ranking.score
            for song_id, row in current_by_song_id.items()
        }
        _apply_score_adjustments(
            db,
            {
                song_id: previous["score"]
                for song_id, previous in previous_state.items()
            },
            new_scores_by_song_id,
        )

        for song_id in affected_song_ids:
            ranking = current_by_song_id[song_id].ranking
            previous = previous_state[song_id]
            rating_events.append(
                create_rating_event(
                    db,
                    user_id=user_id,
                    song_id=song_id,
                    event_type="reordered",
                    previous_bucket=previous["bucket"],
                    new_bucket=ranking.bucket,
                    previous_position=previous["position"],
                    new_position=ranking.position,
                    previous_score=previous["score"],
                    new_score=ranking.score,
                    note=None,
                    source="reorder",
                    event_metadata=event_metadata,
                )
            )

        db.commit()
        refresh_rating_events(
            db,
            rating_events,
        )
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise

    refreshed_rows = list_all_user_rankings_with_songs(
        db,
        user_id,
    )
    return RankingReorderResponse(
        rankings=[
            _ranking_with_song_response(row)
            for row in refreshed_rows
        ],
        rating_events=[
            _rating_event_response(event)
            for event in rating_events
        ],
    )


def list_my_rankings(
    db: Session,
    user_id: int,
    limit: int = DEFAULT_RANKING_LIMIT,
    cursor: str | None = None,
) -> RankingListResponse:
    """Return the authenticated user's current rankings sorted by score."""
    safe_limit = min(
        limit,
        MAX_RANKING_LIMIT,
    )
    cursor_score, cursor_id = _parse_cursor(cursor)
    rows = list_user_rankings_with_songs(
        db,
        user_id=user_id,
        limit=safe_limit + 1,
        cursor_score=cursor_score,
        cursor_id=cursor_id,
    )
    has_next_page = len(rows) > safe_limit
    page_rows = rows[:safe_limit]
    next_cursor = _build_cursor(page_rows[-1].ranking) if has_next_page and page_rows else None

    return RankingListResponse(
        rankings=[
            _ranking_with_song_response(row)
            for row in page_rows
        ],
        next_cursor=next_cursor,
    )


def list_my_bucket_rankings(
    db: Session,
    user_id: int,
    bucket: str,
) -> RankingListResponse:
    """Return all rankings for one user in a specific bucket, ordered by position."""
    rows = list_user_bucket_rankings_with_songs(db, user_id=user_id, bucket=bucket)
    return RankingListResponse(
        rankings=[_ranking_with_song_response(row) for row in rows],
        next_cursor=None,
    )


def get_my_ranking_anchors(
    db: Session,
    user_id: int,
) -> RankingAnchorsResponse:
    """Return derived current-user calibration points from existing Rankings rows."""
    like_rows = list_user_bucket_rankings_with_songs(
        db,
        user_id,
        "like",
    )
    okay_rows = list_user_bucket_rankings_with_songs(
        db,
        user_id,
        "alright",
    )
    dislike_rows = list_user_bucket_rankings_with_songs(
        db,
        user_id,
        "dislike",
    )

    return RankingAnchorsResponse(
        top_like=_ranking_with_song_response(like_rows[0]) if like_rows else None,
        median_okay=_ranking_with_song_response(okay_rows[(len(okay_rows) - 1) // 2]) if okay_rows else None,
        lowest_dislike=_ranking_with_song_response(dislike_rows[-1]) if dislike_rows else None,
    )


def report_rating_event(
    db: Session,
    current_user_id: int,
    rating_event_id: int,
    data: RatingEventReportCreate,
) -> ProfileReportResponse:
    """Create a private safety report for a visible rating event or note."""
    row = get_rating_event_for_report(
        db,
        rating_event_id,
    )
    if (
        row is None
        or row.event.event_type in {"removed", "reordered"}
        or row.event.new_bucket is None
        or row.event.new_score is None
        or not can_view_profile(
            db,
            current_user_id,
            row.owner_profile.user_id,
        )
        or not can_view_taste(
            db,
            current_user_id,
            row.owner_profile,
        )
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rating event not found.",
        )

    if row.event.user_id == current_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot report your own rating.",
        )

    if data.target_type == "rating_note" and row.event.note is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rating note not found.",
        )

    try:
        report = create_report(
            db,
            reporter_user_id=current_user_id,
            reported_user_id=row.event.user_id,
            target_type=data.target_type,
            target_id=row.event.id,
            reason=data.reason,
            details=data.details,
        )
        db.commit()
        db.refresh(report)
    except Exception:
        db.rollback()
        raise

    return ProfileReportResponse.model_validate(report)


def _validate_reorder_song_ids(
    current_song_ids: set[int],
    submitted_song_ids: list[int],
) -> None:
    """Ensure reorder payload contains each current ranking exactly once."""
    if len(submitted_song_ids) != len(set(submitted_song_ids)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reorder payload contains duplicate songs.",
        )

    submitted_set = set(submitted_song_ids)
    unknown_song_ids = submitted_set - current_song_ids
    if unknown_song_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ranking not found.",
        )

    if submitted_set != current_song_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reorder payload must include every current ranking.",
        )


def _determine_insertion_position(
    db: Session,
    user_id: int,
    bucket: str,
    current_ranking: Ranking | None,
    requested_position: int | None,
) -> int:
    """Choose the insertion position, requiring comparison once a bucket is non-empty."""
    bucket_rankings = [
        ranking
        for ranking in list_user_bucket_rankings(
            db,
            user_id,
            bucket,
        )
        if current_ranking is None or ranking.id != current_ranking.id
    ]
    max_position = len(bucket_rankings) + 1
    if requested_position is not None:
        if requested_position > max_position:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Position is outside this bucket.",
            )
        return requested_position

    if not bucket_rankings:
        return 1

    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Comparison session required for this bucket.",
    )


def _place_ranking(
    db: Session,
    user_id: int,
    song_id: int,
    bucket: str,
    position: int,
    current_ranking: Ranking | None,
) -> RankingPlacementState:
    """Insert or move a ranking, then compact every affected bucket."""
    old_bucket = current_ranking.bucket if current_ranking else None
    buckets_to_recalculate = [bucket]
    if old_bucket is not None and old_bucket != bucket:
        buckets_to_recalculate.append(old_bucket)

    old_scores_by_song_id = _bucket_score_snapshot(
        db,
        user_id,
        buckets_to_recalculate,
    )
    created_ranking = current_ranking is None

    if current_ranking is None:
        current_ranking = create_ranking(
            db,
            user_id=user_id,
            song_id=song_id,
            bucket=bucket,
            position=position,
            score=BUCKET_SCORE_RANGES[bucket]["midpoint"],
        )
    else:
        apply_ranking_state(
            current_ranking,
            bucket=bucket,
            position=position,
            score=current_ranking.score,
        )

    new_scores_by_song_id = {}
    for bucket_name in buckets_to_recalculate:
        bucket_rankings = list_user_bucket_rankings(
            db,
            user_id,
            bucket_name,
        )
        if bucket_name == bucket:
            bucket_rankings = _ordered_with_inserted_position(
                bucket_rankings,
                current_ranking,
                position,
            )
        elif old_bucket is not None and bucket_name == old_bucket:
            bucket_rankings = [
                ranking
                for ranking in bucket_rankings
                if ranking.id != current_ranking.id
            ]
        _recalculate_bucket(
            bucket_rankings,
            bucket_name,
        )
        new_scores_by_song_id.update(_score_snapshot(bucket_rankings))

    return RankingPlacementState(
        ranking=current_ranking,
        created_ranking=created_ranking,
        old_scores_by_song_id=old_scores_by_song_id,
        new_scores_by_song_id=new_scores_by_song_id,
    )


def _apply_placement_aggregate_deltas(
    db: Session,
    placement: RankingPlacementState,
) -> None:
    """Apply aggregate deltas from one finalized rating placement."""
    excluded_song_ids: set[int] = set()
    if placement.created_ranking:
        increment_song_aggregate(
            db,
            placement.ranking.song_id,
            placement.ranking.score,
        )
        excluded_song_ids.add(placement.ranking.song_id)

    _apply_score_adjustments(
        db,
        placement.old_scores_by_song_id,
        placement.new_scores_by_song_id,
        excluded_song_ids=excluded_song_ids,
    )


def _apply_score_adjustments(
    db: Session,
    old_scores_by_song_id: dict[int, float],
    new_scores_by_song_id: dict[int, float],
    excluded_song_ids: set[int] | None = None,
) -> None:
    """Adjust aggregates for rankings that persisted but received new scores."""
    excluded = excluded_song_ids or set()
    changed_song_ids = (
        set(old_scores_by_song_id)
        & set(new_scores_by_song_id)
        - excluded
    )
    for song_id in sorted(changed_song_ids):
        old_score = old_scores_by_song_id[song_id]
        new_score = new_scores_by_song_id[song_id]
        if old_score != new_score:
            adjust_song_aggregate(
                db,
                song_id,
                old_score,
                new_score,
            )


def _bucket_score_snapshot(
    db: Session,
    user_id: int,
    buckets: list[str],
) -> dict[int, float]:
    """Return current scores for all rankings in the requested buckets."""
    scores_by_song_id = {}
    for bucket in buckets:
        scores_by_song_id.update(
            _score_snapshot(
                list_user_bucket_rankings(
                    db,
                    user_id,
                    bucket,
                )
            )
        )
    return scores_by_song_id


def _score_snapshot(
    rankings: list[Ranking],
) -> dict[int, float]:
    """Return a song_id -> score snapshot for aggregate delta calculation."""
    return {
        ranking.song_id: ranking.score
        for ranking in rankings
    }


def _ordered_with_inserted_position(
    bucket_rankings: list[Ranking],
    changed_ranking: Ranking,
    requested_position: int,
) -> list[Ranking]:
    """Return a clean ordered list with the changed ranking inserted once."""
    other_rankings = [
        ranking
        for ranking in bucket_rankings
        if ranking.id != changed_ranking.id
    ]
    insert_index = requested_position - 1
    return other_rankings[:insert_index] + [changed_ranking] + other_rankings[insert_index:]


def _recalculate_bucket(
    bucket_rankings: list[Ranking],
    bucket: str,
) -> None:
    """Write contiguous positions and server-calculated scores for one bucket."""
    total = len(bucket_rankings)
    for index, ranking in enumerate(
        bucket_rankings,
        start=1,
    ):
        apply_ranking_state(
            ranking,
            bucket=bucket,
            position=index,
            score=_calculate_score(
                bucket,
                position=index,
                total=total,
            ),
        )


def _calculate_score(
    bucket: str,
    position: int,
    total: int,
) -> float:
    """Calculate the server-owned score for a bucket-relative position."""
    score_range = BUCKET_SCORE_RANGES[bucket]
    if total <= 1:
        return score_range["midpoint"]

    t_value = (position - 1) / max(
        total - 1,
        1,
    )
    score = score_range["max"] - (score_range["max"] - score_range["min"]) * t_value
    return round(
        max(
            score,
            score_range["min"],
        ),
        4,
    )


def _ranking_response(
    ranking: Ranking,
    song: Song,
) -> RankingResponse:
    """Build a ranking response with nested song metadata."""
    return RankingResponse(
        id=ranking.id,
        song_id=ranking.song_id,
        bucket=ranking.bucket,
        position=ranking.position,
        score=ranking.score,
        created_at=ranking.created_at,
        updated_at=ranking.updated_at,
        song=SongResponse.model_validate(song),
    )


def _ranking_with_song_response(
    row: RankingRow,
) -> RankingResponse:
    """Build a ranking response from a repository row pair."""
    return _ranking_response(
        row.ranking,
        row.song,
    )


def _rating_event_response(
    event: RatingEvent,
) -> RatingEventResponse:
    """Build a rating event response."""
    return RatingEventResponse.model_validate(event)


def _parse_cursor(
    cursor: str | None,
) -> tuple[float | None, int | None]:
    """Parse a score/id cursor for descending score pagination."""
    if cursor is None:
        return None, None

    parts = cursor.split(":")
    if len(parts) != 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid cursor.",
        )

    try:
        return float(parts[0]), int(parts[1])
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid cursor.",
        )


def _build_cursor(
    ranking: Ranking,
) -> str:
    """Build a cursor from the last row in the current page."""
    return f"{ranking.score}:{ranking.id}"
