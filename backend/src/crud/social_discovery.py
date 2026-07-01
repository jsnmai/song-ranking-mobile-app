"""Database access for privacy-safe social discovery recommendations."""
from dataclasses import dataclass

from sqlalchemy import exists, select
from sqlalchemy.orm import Session, aliased

from src.crud.social_access import followed_visible_taste_owner_predicate
from src.sqlalchemy_tables.bookmark import Bookmark
from src.sqlalchemy_tables.profile import Profile
from src.sqlalchemy_tables.ranking import Ranking
from src.sqlalchemy_tables.song import Song


@dataclass(frozen=True)
class SocialHighScoreRow:
    """One visible followed user's high score paired with its song."""

    ranking: Ranking
    contributor_profile: Profile
    song: Song
    is_bookmarked: bool


def list_visible_followed_high_scores(
    db: Session,
    viewer_id: int,
    threshold: float,
) -> list[SocialHighScoreRow]:
    """Return visible followed-user scores while excluding viewer-rated songs."""
    viewer_ranking = aliased(Ranking)
    viewer_has_rated = exists(
        select(viewer_ranking.id)
        .where(viewer_ranking.user_id == viewer_id)
        .where(viewer_ranking.song_id == Ranking.song_id)
    )
    viewer_has_bookmarked = exists(
        select(Bookmark.id)
        .where(Bookmark.user_id == viewer_id)
        .where(Bookmark.song_id == Ranking.song_id)
    )
    rows = db.execute(
        select(
            Ranking,
            Profile,
            Song,
            viewer_has_bookmarked.label("is_bookmarked"),
        )
        .join(
            Profile,
            Profile.user_id == Ranking.user_id,
        )
        .join(
            Song,
            Song.id == Ranking.song_id,
        )
        .where(Ranking.score >= threshold)
        .where(~viewer_has_rated)
        .where(
            followed_visible_taste_owner_predicate(
                viewer_id,
                Ranking.user_id,
            )
        )
    ).all()
    return [
        SocialHighScoreRow(
            ranking=row[0],
            contributor_profile=row[1],
            song=row[2],
            is_bookmarked=bool(row[3]),
        )
        for row in rows
    ]
