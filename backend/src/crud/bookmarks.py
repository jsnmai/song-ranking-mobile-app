"""Database access for per-user Bookmarks."""
from dataclasses import dataclass

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.bookmark import Bookmark
from src.sqlalchemy_tables.ranking import Ranking
from src.sqlalchemy_tables.song import Song


@dataclass(frozen=True)
class BookmarkRow:
    """One bookmark paired with song metadata and optional current Ranking."""

    bookmark: Bookmark
    song: Song
    ranking: Ranking | None


def create_or_get_bookmark(
    db: Session,
    user_id: int,
    song_id: int,
    source: str | None,
) -> Bookmark:
    """Create an idempotent bookmark or return the existing row without committing."""
    statement = (
        insert(Bookmark)
        .values(
            user_id=user_id,
            song_id=song_id,
            source=source,
        )
        .on_conflict_do_nothing(
            constraint="uq_bookmarks_user_song",
        )
        .returning(Bookmark.id)
    )
    bookmark_id = db.execute(statement).scalar_one_or_none()
    if bookmark_id is not None:
        bookmark = db.get(Bookmark, bookmark_id)
        if bookmark is not None:
            return bookmark

    existing = db.execute(
        select(Bookmark)
        .where(Bookmark.user_id == user_id)
        .where(Bookmark.song_id == song_id)
    ).scalar_one_or_none()
    if existing is None:
        raise RuntimeError("Bookmark upsert failed without returning or finding a row.")
    return existing


def get_user_bookmark_by_song_id(
    db: Session,
    user_id: int,
    song_id: int,
) -> BookmarkRow | None:
    """Return one bookmark scoped to the current user and LISTn song ID."""
    row = db.execute(
        _bookmark_row_statement(user_id)
        .where(Bookmark.song_id == song_id)
    ).one_or_none()
    return _to_bookmark_row(row)


def get_user_bookmark_by_deezer_id(
    db: Session,
    user_id: int,
    deezer_id: int,
) -> BookmarkRow | None:
    """Return one bookmark scoped to the current user and provider song ID."""
    row = db.execute(
        _bookmark_row_statement(user_id)
        .where(Song.deezer_id == deezer_id)
    ).one_or_none()
    return _to_bookmark_row(row)


def list_user_bookmarks(
    db: Session,
    user_id: int,
    limit: int,
) -> list[BookmarkRow]:
    """Return the current user's bookmarks, newest first."""
    rows = db.execute(
        _bookmark_row_statement(user_id)
        .order_by(
            Bookmark.created_at.desc(),
            Bookmark.id.desc(),
        )
        .limit(limit)
    ).all()
    return [
        BookmarkRow(
            bookmark=row[0],
            song=row[1],
            ranking=row[2],
        )
        for row in rows
    ]


def count_user_bookmarks(
    db: Session,
    user_id: int,
) -> int:
    """Return the total number of bookmarks for a user."""
    return db.execute(
        select(func.count()).select_from(Bookmark).where(Bookmark.user_id == user_id)
    ).scalar_one()


def delete_user_bookmark(
    db: Session,
    user_id: int,
    song_id: int,
) -> bool:
    """Delete one user bookmark without deleting song metadata."""
    result = db.execute(
        delete(Bookmark)
        .where(Bookmark.user_id == user_id)
        .where(Bookmark.song_id == song_id)
    )
    db.flush()
    return (result.rowcount or 0) > 0


def delete_user_bookmarks(
    db: Session,
    user_id: int,
) -> None:
    """Delete all bookmarks for a user during account deletion."""
    db.execute(
        delete(Bookmark)
        .where(Bookmark.user_id == user_id)
    )


def _bookmark_row_statement(user_id: int):
    """Build the owner-scoped bookmark/song/ranking join."""
    return (
        select(
            Bookmark,
            Song,
            Ranking,
        )
        .join(
            Song,
            Song.id == Bookmark.song_id,
        )
        .outerjoin(
            Ranking,
            (Ranking.user_id == user_id)
            & (Ranking.song_id == Bookmark.song_id),
        )
        .where(Bookmark.user_id == user_id)
    )


def _to_bookmark_row(row) -> BookmarkRow | None:
    """Convert one optional SQLAlchemy row into the bookmark boundary type."""
    if row is None:
        return None
    return BookmarkRow(
        bookmark=row[0],
        song=row[1],
        ranking=row[2],
    )
