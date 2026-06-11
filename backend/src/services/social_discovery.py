"""Business logic for Co-Sign discovery."""
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from src.crud.social_discovery import SocialHighScoreRow, list_visible_followed_high_scores
from src.pydantic_schemas.social_discovery import (
    CoSignItem,
    CoSignsResponse,
    SocialDiscoveryContributor,
)
from src.pydantic_schemas.song import SongResponse
from src.sqlalchemy_tables.song import Song

HIGH_SCORE_THRESHOLD = 9.0
SOCIAL_DISCOVERY_LIMIT = 20
CONTRIBUTOR_LIMIT = 3


@dataclass(frozen=True)
class SocialDiscoveryGroup:
    """Grouped visible high scores for one song."""

    song: Song
    rows: list[SocialHighScoreRow]
    average_score: float
    latest_at: datetime
    is_bookmarked: bool


def list_co_signs(
    db: Session,
    user_id: int,
) -> CoSignsResponse:
    """Return songs Co-Signed by at least two visible followed users."""
    groups = _list_groups(
        db,
        user_id=user_id,
        minimum_count=2,
    )
    return CoSignsResponse(
        items=[
            CoSignItem(
                song=SongResponse.model_validate(group.song),
                co_sign_count=len(group.rows),
                average_visible_friend_score=group.average_score,
                latest_visible_rating_at=group.latest_at,
                contributors=_contributors(group),
                is_bookmarked=group.is_bookmarked,
            )
            for group in groups
        ],
    )


def _list_groups(
    db: Session,
    user_id: int,
    minimum_count: int,
) -> list[SocialDiscoveryGroup]:
    """Group and rank only the contributor rows admitted by shared access SQL."""
    rows_by_song: dict[int, list[SocialHighScoreRow]] = {}
    for row in list_visible_followed_high_scores(
        db,
        viewer_id=user_id,
        threshold=HIGH_SCORE_THRESHOLD,
    ):
        rows_by_song.setdefault(row.song.id, []).append(row)

    groups = [
        SocialDiscoveryGroup(
            song=rows[0].song,
            rows=rows,
            average_score=round(
                sum(row.ranking.score for row in rows) / len(rows),
                2,
            ),
            latest_at=max(row.ranking.updated_at for row in rows),
            is_bookmarked=rows[0].is_bookmarked,
        )
        for rows in rows_by_song.values()
        if len(rows) >= minimum_count
    ]
    groups.sort(
        key=lambda group: (
            len(group.rows),
            group.average_score,
            group.latest_at,
        ),
        reverse=True,
    )
    return groups[:SOCIAL_DISCOVERY_LIMIT]


def _contributors(
    group: SocialDiscoveryGroup,
) -> list[SocialDiscoveryContributor]:
    """Return the strongest visible contributors without exposing hidden users."""
    sorted_rows = sorted(
        group.rows,
        key=lambda row: (
            row.ranking.score,
            row.ranking.updated_at,
        ),
        reverse=True,
    )
    return [
        SocialDiscoveryContributor(
            user_id=row.contributor_profile.user_id,
            username=row.contributor_profile.username,
            display_name=row.contributor_profile.display_name,
            score=row.ranking.score,
        )
        for row in sorted_rows[:CONTRIBUTOR_LIMIT]
    ]
