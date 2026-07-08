"""Business logic for circle-aggregate discovery modules (Most-rated, Trending).

These surfaces show what the viewer's circle is rating. Unlike Co-Sign (a "rate this"
recommendation that hides already-rated songs), they INCLUDE songs the viewer has rated
and surface the viewer's own rating separately, never folding it into the circle count
or average.
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from src.crud.circle_aggregates import (
    CircleContributorRow,
    aggregate_circle_most_rated,
    aggregate_circle_trending,
    count_circle_members,
    get_songs_by_ids,
    get_viewer_rankings,
    list_circle_contributors,
)
from src.crud.song_provider_ref import list_apple_provider_refs_for_songs
from src.pydantic_schemas.circle import (
    CircleContributor,
    CircleMostRatedItem,
    CircleMostRatedResponse,
    CircleTrendingItem,
    CircleTrendingResponse,
    ViewerRating,
)
from src.services.song import build_song_response_from_provider_ref
from src.sqlalchemy_tables.ranking import Ranking

# A circle aggregate is only shown once at least this many visible circle members qualify.
# Below this, the song is omitted entirely so no "2 people in your circle" hint can leak.
CIRCLE_MIN_CONTRIBUTORS = 3
CIRCLE_MODULE_LIMIT = 20
CIRCLE_CONTRIBUTOR_LIMIT = 3
TRENDING_WINDOW_DAYS = 7


def list_circle_most_rated(
    db: Session,
    user_id: int,
) -> CircleMostRatedResponse:
    """Return songs the most visible circle members currently rate, count first."""
    rows = aggregate_circle_most_rated(
        db,
        user_id,
        minimum_contributors=CIRCLE_MIN_CONTRIBUTORS,
        limit=CIRCLE_MODULE_LIMIT,
    )
    song_ids = [row.song_id for row in rows]
    songs = get_songs_by_ids(
        db,
        song_ids,
    )
    contributors = list_circle_contributors(
        db,
        user_id,
        song_ids,
        per_song_limit=CIRCLE_CONTRIBUTOR_LIMIT,
    )
    viewer_rankings = get_viewer_rankings(
        db,
        user_id,
        song_ids,
    )
    apple_refs = list_apple_provider_refs_for_songs(
        db,
        song_ids,
    )
    return CircleMostRatedResponse(
        items=[
            CircleMostRatedItem(
                song=build_song_response_from_provider_ref(
                    songs[row.song_id],
                    apple_refs.get(row.song_id),
                ),
                circle_rating_count=row.contributor_count,
                average_circle_score=round(row.average_score, 2),
                contributors=_contributors(contributors.get(row.song_id, [])),
                viewer_rating=_viewer_rating(viewer_rankings.get(row.song_id)),
                latest_circle_rating_at=row.latest_at,
            )
            for row in rows
        ],
        circle_size=count_circle_members(db, user_id),
    )


def list_circle_trending(
    db: Session,
    user_id: int,
) -> CircleTrendingResponse:
    """Return songs the most visible circle members rated within the recent window."""
    window_start = datetime.now(timezone.utc) - timedelta(days=TRENDING_WINDOW_DAYS)
    rows = aggregate_circle_trending(
        db,
        user_id,
        window_start=window_start,
        minimum_contributors=CIRCLE_MIN_CONTRIBUTORS,
        limit=CIRCLE_MODULE_LIMIT,
    )
    song_ids = [row.song_id for row in rows]
    songs = get_songs_by_ids(
        db,
        song_ids,
    )
    contributors = list_circle_contributors(
        db,
        user_id,
        song_ids,
        per_song_limit=CIRCLE_CONTRIBUTOR_LIMIT,
        window_start=window_start,
    )
    viewer_rankings = get_viewer_rankings(
        db,
        user_id,
        song_ids,
    )
    apple_refs = list_apple_provider_refs_for_songs(
        db,
        song_ids,
    )
    return CircleTrendingResponse(
        items=[
            CircleTrendingItem(
                song=build_song_response_from_provider_ref(
                    songs[row.song_id],
                    apple_refs.get(row.song_id),
                ),
                recent_circle_rating_count=row.contributor_count,
                average_circle_score=round(row.average_score, 2),
                contributors=_contributors(contributors.get(row.song_id, [])),
                viewer_rating=_viewer_rating(viewer_rankings.get(row.song_id)),
                latest_circle_rating_at=row.latest_at,
            )
            for row in rows
        ],
        window_days=TRENDING_WINDOW_DAYS,
        circle_size=count_circle_members(db, user_id),
    )


def _contributors(
    rows: list[CircleContributorRow],
) -> list[CircleContributor]:
    """Map visible circle contributor rows to their response shape."""
    return [
        CircleContributor(
            user_id=row.profile.user_id,
            username=row.profile.username,
            display_name=row.profile.display_name,
            score=row.score,
            bucket=row.bucket,
        )
        for row in rows
    ]


def _viewer_rating(
    ranking: Ranking | None,
) -> ViewerRating | None:
    """Expose the viewer's own rating separately; None when they have not rated."""
    if ranking is None:
        return None
    return ViewerRating(
        score=ranking.score,
        bucket=ranking.bucket,
    )
