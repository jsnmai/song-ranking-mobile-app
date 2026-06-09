"""Database access for private current-user Saved Songs."""
from dataclasses import dataclass

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.ranking import Ranking
from src.sqlalchemy_tables.saved_song import SavedSong
from src.sqlalchemy_tables.song import Song


@dataclass(frozen=True)
class SavedSongRow:
    """One save paired with song metadata and optional current Ranking."""

    save: SavedSong
    song: Song
    ranking: Ranking | None


def create_or_get_saved_song(
    db: Session,
    user_id: int,
    song_id: int,
    source: str | None,
) -> SavedSong:
    """Create an idempotent save or return the existing row without committing."""
    statement = (
        insert(SavedSong)
        .values(
            user_id=user_id,
            song_id=song_id,
            source=source,
        )
        .on_conflict_do_nothing(
            constraint="uq_saved_songs_user_song",
        )
        .returning(SavedSong.id)
    )
    save_id = db.execute(statement).scalar_one_or_none()
    if save_id is not None:
        save = db.get(SavedSong, save_id)
        if save is not None:
            return save

    existing = db.execute(
        select(SavedSong)
        .where(SavedSong.user_id == user_id)
        .where(SavedSong.song_id == song_id)
    ).scalar_one_or_none()
    if existing is None:
        raise RuntimeError("Saved song upsert failed without returning or finding a row.")
    return existing


def get_user_saved_song_by_song_id(
    db: Session,
    user_id: int,
    song_id: int,
) -> SavedSongRow | None:
    """Return one save scoped to the current user and LISTn song ID."""
    row = db.execute(
        _save_row_statement(user_id)
        .where(SavedSong.song_id == song_id)
    ).one_or_none()
    return _to_save_row(row)


def get_user_saved_song_by_deezer_id(
    db: Session,
    user_id: int,
    deezer_id: int,
) -> SavedSongRow | None:
    """Return one save scoped to the current user and provider song ID."""
    row = db.execute(
        _save_row_statement(user_id)
        .where(Song.deezer_id == deezer_id)
    ).one_or_none()
    return _to_save_row(row)


def list_user_saved_songs(
    db: Session,
    user_id: int,
    limit: int,
) -> list[SavedSongRow]:
    """Return the current user's newest saves."""
    rows = db.execute(
        _save_row_statement(user_id)
        .order_by(
            SavedSong.created_at.desc(),
            SavedSong.id.desc(),
        )
        .limit(limit)
    ).all()
    return [
        SavedSongRow(
            save=row[0],
            song=row[1],
            ranking=row[2],
        )
        for row in rows
    ]


def count_user_saved_songs(
    db: Session,
    user_id: int,
) -> int:
    """Return the total number of saved songs for a user."""
    return db.execute(
        select(func.count()).select_from(SavedSong).where(SavedSong.user_id == user_id)
    ).scalar_one()


def delete_user_saved_song(
    db: Session,
    user_id: int,
    song_id: int,
) -> bool:
    """Delete one current-user save without deleting song metadata."""
    result = db.execute(
        delete(SavedSong)
        .where(SavedSong.user_id == user_id)
        .where(SavedSong.song_id == song_id)
    )
    db.flush()
    return (result.rowcount or 0) > 0


def delete_user_saved_songs(
    db: Session,
    user_id: int,
) -> None:
    """Delete all current-user saves during account deletion."""
    db.execute(
        delete(SavedSong)
        .where(SavedSong.user_id == user_id)
    )


def _save_row_statement(user_id: int):
    """Build the owner-scoped save/song/ranking join."""
    return (
        select(
            SavedSong,
            Song,
            Ranking,
        )
        .join(
            Song,
            Song.id == SavedSong.song_id,
        )
        .outerjoin(
            Ranking,
            (Ranking.user_id == user_id)
            & (Ranking.song_id == SavedSong.song_id),
        )
        .where(SavedSong.user_id == user_id)
    )


def _to_save_row(row) -> SavedSongRow | None:
    """Convert one optional SQLAlchemy row into the save boundary type."""
    if row is None:
        return None
    return SavedSongRow(
        save=row[0],
        song=row[1],
        ranking=row[2],
    )
