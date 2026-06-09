"""Database queries for similarity snapshot computation."""
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from src.crud.social_access import visible_taste_owner_predicate
from src.sqlalchemy_tables.profile import Profile
from src.sqlalchemy_tables.ranking import Ranking
from src.sqlalchemy_tables.song import Song
from src.sqlalchemy_tables.user_similarity_snapshot import UserSimilaritySnapshot

MOST_COMPATIBLE_MIN_SHARED = 5
MOST_COMPATIBLE_LIMIT = 20
_MOST_COMPATIBLE_ALGORITHM = "v1_cosine"


@dataclass
class MostCompatibleRow:
    """One row returned by get_most_compatible_users."""

    other_user_id: int
    username: str
    display_name: str
    similarity_score: float
    shared_song_count: int
    shared_genres: list[str]
    shared_top_artists: list[str]
    computed_at: datetime


@dataclass
class SimilarityRow:
    """Flat projection of one ranked song used for similarity computation."""

    song_id: int
    score: float
    genres_mb: list[str] | None
    genre_deezer: str | None
    artist: str


def get_similarity_rows(
    db: Session,
    user_id: int,
) -> list[SimilarityRow]:
    """Return all ranked songs for a user with the metadata needed for similarity computation."""
    results = db.execute(
        select(
            Ranking.song_id,
            Ranking.score,
            Song.genres_mb,
            Song.genre_deezer,
            Song.artist,
        )
        .join(Song, Song.id == Ranking.song_id)
        .where(Ranking.user_id == user_id)
    ).all()
    return [
        SimilarityRow(
            song_id=row.song_id,
            score=row.score,
            genres_mb=row.genres_mb,
            genre_deezer=row.genre_deezer,
            artist=row.artist,
        )
        for row in results
    ]


def find_candidate_user_ids(
    db: Session,
    user_id: int,
    min_shared: int = 5,
) -> list[int]:
    """
    Return IDs of users who share at least min_shared rated songs with user_id.

    Filters out user_id itself. The UNIQUE constraint on rankings guarantees at
    most one row per (user_id, song_id), so a row count == a shared-song count.
    """
    user_song_ids = select(Ranking.song_id).where(Ranking.user_id == user_id)
    results = db.execute(
        select(Ranking.user_id)
        .where(Ranking.song_id.in_(user_song_ids))
        .where(Ranking.user_id != user_id)
        .group_by(Ranking.user_id)
        .having(func.count() >= min_shared)
    ).scalars().all()
    return list(results)


def get_snapshot(
    db: Session,
    user_a_id: int,
    user_b_id: int,
    algorithm_version: str,
) -> UserSimilaritySnapshot | None:
    """Return an existing snapshot for the canonical user pair, or None."""
    return db.execute(
        select(UserSimilaritySnapshot)
        .where(UserSimilaritySnapshot.user_a_id == user_a_id)
        .where(UserSimilaritySnapshot.user_b_id == user_b_id)
        .where(UserSimilaritySnapshot.algorithm_version == algorithm_version)
    ).scalar_one_or_none()


def get_snapshot_for_pair(
    db: Session,
    user_id_1: int,
    user_id_2: int,
    algorithm_version: str,
) -> UserSimilaritySnapshot | None:
    """Look up a snapshot for any pair order, enforcing canonical ordering internally."""
    return get_snapshot(
        db,
        min(user_id_1, user_id_2),
        max(user_id_1, user_id_2),
        algorithm_version,
    )


def upsert_snapshot(
    db: Session,
    user_a_id: int,
    user_b_id: int,
    algorithm_version: str,
    similarity_score: float,
    shared_song_count: int,
    score_distance_avg: float | None,
    shared_genres: list[str],
    shared_top_artists: list[str],
) -> None:
    """
    Create or update the similarity snapshot for a canonical pair.

    Caller is responsible for db.commit(). user_a_id must be less than user_b_id
    to satisfy the check constraint — enforce canonical ordering before calling.
    """
    snapshot = get_snapshot(
        db,
        user_a_id,
        user_b_id,
        algorithm_version,
    )
    if snapshot is None:
        snapshot = UserSimilaritySnapshot(
            user_a_id=user_a_id,
            user_b_id=user_b_id,
            algorithm_version=algorithm_version,
            similarity_score=similarity_score,
            shared_song_count=shared_song_count,
            score_distance_avg=score_distance_avg,
            shared_genres=shared_genres,
            shared_top_artists=shared_top_artists,
        )
        db.add(snapshot)
    else:
        snapshot.similarity_score = similarity_score
        snapshot.shared_song_count = shared_song_count
        snapshot.score_distance_avg = score_distance_avg
        snapshot.shared_genres = shared_genres
        snapshot.shared_top_artists = shared_top_artists
        snapshot.computed_at = datetime.now(timezone.utc)
    db.flush()


def get_most_compatible_users(
    db: Session,
    viewer_id: int,
) -> list[MostCompatibleRow]:
    """
    Return users most taste-compatible with viewer_id, sorted by score descending.

    Applies visibility and block rules via visible_taste_owner_predicate so callers
    never see private, blocked, or deleted users in the result.
    """
    # Snapshots use canonical ordering (user_a_id < user_b_id), so the "other"
    # user is on either side depending on which ID is smaller.
    other_id = case(
        (UserSimilaritySnapshot.user_a_id == viewer_id, UserSimilaritySnapshot.user_b_id),
        else_=UserSimilaritySnapshot.user_a_id,
    )
    rows = db.execute(
        select(
            other_id.label("other_user_id"),
            UserSimilaritySnapshot.similarity_score,
            UserSimilaritySnapshot.shared_song_count,
            UserSimilaritySnapshot.shared_genres,
            UserSimilaritySnapshot.shared_top_artists,
            UserSimilaritySnapshot.computed_at,
            Profile.username,
            Profile.display_name,
        )
        .join(Profile, Profile.user_id == other_id)
        .where(
            or_(
                UserSimilaritySnapshot.user_a_id == viewer_id,
                UserSimilaritySnapshot.user_b_id == viewer_id,
            )
        )
        .where(UserSimilaritySnapshot.shared_song_count >= MOST_COMPATIBLE_MIN_SHARED)
        .where(UserSimilaritySnapshot.algorithm_version == _MOST_COMPATIBLE_ALGORITHM)
        .where(visible_taste_owner_predicate(viewer_id, other_id, include_self=False))
        .order_by(UserSimilaritySnapshot.similarity_score.desc())
        .limit(MOST_COMPATIBLE_LIMIT)
    ).all()
    return [
        MostCompatibleRow(
            other_user_id=row.other_user_id,
            username=row.username,
            display_name=row.display_name,
            similarity_score=row.similarity_score,
            shared_song_count=row.shared_song_count,
            shared_genres=row.shared_genres or [],
            shared_top_artists=row.shared_top_artists or [],
            computed_at=row.computed_at,
        )
        for row in rows
    ]
