"""Business logic for the global "Popular on LISTn" discovery module.

Shows what the whole user base is rating, anonymously. The module adapts to a sparse catalog:
when fewer than `POPULAR_MIN_ITEMS` songs clear the weekly bar it backfills with the all-time
most-rated songs and reports `window="all_time"`, so the client can relabel honestly instead of
showing an empty or near-empty row. See `crud.popular` for the queries.
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from src.crud.circle_aggregates import get_songs_by_ids
from src.crud.popular import aggregate_popular_this_week, all_time_most_rated
from src.pydantic_schemas.popular import PopularItem, PopularResponse
from src.pydantic_schemas.song import SongResponse

# A song needs at least this many distinct raters in the window to count as "popular this week".
POPULAR_MIN_RATERS_WEEK = 2
# Below this many qualifying weekly songs the week is too thin, so we backfill with all-time.
POPULAR_MIN_ITEMS = 4
# How many songs the module shows (the Discover row renders exactly these). Coupled to
# POPULAR_MIN_ITEMS: weekly mode only engages when it can fill every tile with a real weekly song.
POPULAR_LIMIT = 4
POPULAR_WINDOW_DAYS = 7


def list_popular(
    db: Session,
) -> PopularResponse:
    """Return the global Popular module: weekly when it has signal, else all-time backfill."""
    window_start = datetime.now(timezone.utc) - timedelta(days=POPULAR_WINDOW_DAYS)
    weekly = aggregate_popular_this_week(
        db,
        window_start=window_start,
        minimum_raters=POPULAR_MIN_RATERS_WEEK,
        limit=POPULAR_LIMIT,
    )
    if len(weekly) >= POPULAR_MIN_ITEMS:
        songs = get_songs_by_ids(
            db,
            [row.song_id for row in weekly],
        )
        return PopularResponse(
            items=[
                PopularItem(
                    song=SongResponse.model_validate(songs[row.song_id]),
                    rating_count=row.rating_count,
                )
                for row in weekly
            ],
            window="week",
            window_days=POPULAR_WINDOW_DAYS,
        )
    backfill = all_time_most_rated(
        db,
        minimum_ratings=1,
        limit=POPULAR_LIMIT,
    )
    return PopularResponse(
        items=[
            PopularItem(
                song=SongResponse.model_validate(song),
                rating_count=song.global_rating_count,
            )
            for song in backfill
        ],
        window="all_time",
        window_days=POPULAR_WINDOW_DAYS,
    )
