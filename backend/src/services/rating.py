"""Business logic for ratings, rankings, and rating events."""
from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from src.crud.rating import (
    RankingRow,
    apply_ranking_state,
    create_ranking,
    create_rating_event,
    delete_ranking,
    get_user_ranking_by_song,
    list_all_user_rankings_with_songs,
    list_user_bucket_rankings,
    list_user_rankings_with_songs,
    refresh_ranking_event_pair,
    refresh_rating_event,
    refresh_rating_events,
)
from src.crud.song import upsert_from_deezer
from src.pydantic_schemas.rating import (
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

    return build_rating_finalize_response(finalized_rating)


def persist_finalized_rating(
    db: Session,
    user_id: int,
    data: RatingFinalizeRequest,
) -> FinalizedRatingState:
    """
    Write ranking and rating_event rows without committing.

    Comparison-session finalization reuses this so rankings, events,
    comparisons, and session deletion can commit atomically.
    """
    song = upsert_from_deezer(
        db,
        data.song,
        commit=False,
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
    ranking = _place_ranking(
        db,
        user_id=user_id,
        song_id=song.id,
        bucket=data.bucket,
        position=new_position,
        current_ranking=existing_ranking,
    )
    # Phase 10: update songs.global_avg_score and songs.global_rating_count here.
    rating_event = create_rating_event(
        db,
        user_id=user_id,
        song_id=song.id,
        event_type="rerated" if existing_ranking else "rated",
        previous_bucket=previous_bucket,
        new_bucket=ranking.bucket,
        previous_position=previous_position,
        new_position=ranking.position,
        previous_score=previous_score,
        new_score=ranking.score,
        note=data.note,
    )
    return FinalizedRatingState(
        ranking=ranking,
        rating_event=rating_event,
        song=song,
    )


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
        _recalculate_bucket(
            list_user_bucket_rankings(
                db,
                user_id,
                previous_bucket,
            ),
            previous_bucket,
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
) -> Ranking:
    """Insert or move a ranking, then compact every affected bucket."""
    old_bucket = current_ranking.bucket if current_ranking else None
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

    buckets_to_recalculate = [bucket]
    if old_bucket is not None and old_bucket != bucket:
        buckets_to_recalculate.append(old_bucket)

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

    return current_ranking


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
