# Business logic for the social feed.
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from src.crud.circle_aggregates import list_circle_contributors
from src.crud.feed import FeedEventRow, list_feed_events
from src.pydantic_schemas.feed import CircleRatersResponse, FeedEventResponse, FeedListResponse
from src.pydantic_schemas.profile import ProfileResponse
from src.pydantic_schemas.song import SongResponse
from src.services.like import like_states_for_events
from src.sqlalchemy_tables.rating_event import RatingEvent

DEFAULT_FEED_LIMIT = 20
MAX_FEED_LIMIT = 50
# How many circle-member avatars the Recent Verdict hero asks for.
RECENT_VERDICT_RATER_LIMIT = 8


def list_song_circle_raters(
    db: Session,
    viewer_id: int,
    song_id: int,
) -> CircleRatersResponse:
    """Circle members (mutual + visible) who currently rate the song, for the Recent Verdict hero.

    Reuses the shared circle predicate via `list_circle_contributors`, so visibility, blocks,
    only_me, deleted users, and the viewer's own exclusion all behave like every other circle
    surface. A missing song simply yields no raters (catalog ids are not sensitive).
    """
    by_song = list_circle_contributors(
        db,
        viewer_id,
        [song_id],
        per_song_limit=RECENT_VERDICT_RATER_LIMIT,
    )
    return CircleRatersResponse(
        raters=[
            ProfileResponse.model_validate(contributor.profile)
            for contributor in by_song.get(song_id, [])
        ],
    )


def list_my_feed(
    db: Session,
    user_id: int,
    limit: int = DEFAULT_FEED_LIMIT,
    cursor: str | None = None,
) -> FeedListResponse:
    """Return the current user's social feed using fan-out-on-read."""
    safe_limit = min(
        limit,
        MAX_FEED_LIMIT,
    )
    cursor_created_at, cursor_id = _parse_cursor(cursor)
    rows = list_feed_events(
        db,
        user_id=user_id,
        limit=safe_limit + 1,
        cursor_created_at=cursor_created_at,
        cursor_id=cursor_id,
    )
    has_next_page = len(rows) > safe_limit
    page_rows = rows[:safe_limit]
    next_cursor = _build_cursor(page_rows[-1].event) if has_next_page and page_rows else None

    like_states = like_states_for_events(
        db,
        user_id,
        [
            (row.event.id, row.actor_profile.user_id, row.actor_profile.hide_like_counts)
            for row in page_rows
        ],
    )

    return FeedListResponse(
        events=[
            _feed_event_response(row, like_states[row.event.id])
            for row in page_rows
        ],
        next_cursor=next_cursor,
    )


def _feed_event_response(
    row: FeedEventRow,
    like_state: tuple[int | None, bool],
) -> FeedEventResponse:
    """Build the public feed event response from joined rows."""
    like_count, liked_by_viewer = like_state
    return FeedEventResponse(
        id=row.event.id,
        event_type=row.event.event_type,
        new_bucket=row.event.new_bucket,
        new_score=row.event.new_score,
        note=row.event.note,
        created_at=row.event.created_at,
        actor_profile=ProfileResponse.model_validate(row.actor_profile),
        song=SongResponse.model_validate(row.song),
        like_count=like_count,
        liked_by_viewer=liked_by_viewer,
    )


def _parse_cursor(
    cursor: str | None,
) -> tuple[datetime | None, int | None]:
    """Parse a created_at/id cursor for descending feed pagination."""
    if cursor is None:
        return None, None

    parts = cursor.split("|")
    if len(parts) != 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid cursor.",
        )

    try:
        return datetime.fromisoformat(parts[0]), int(parts[1])
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid cursor.",
        )


def _build_cursor(
    event: RatingEvent,
) -> str:
    """Build a cursor from the last event in the current page."""
    return f"{event.created_at.isoformat()}|{event.id}"
