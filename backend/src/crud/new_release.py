"""Database access layer for the New Release feed cache."""
from dataclasses import dataclass
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.new_release import NewRelease
from src.sqlalchemy_tables.song import Song


@dataclass(frozen=True)
class NewReleaseRow:
    """One featured release joined with its durable song."""

    new_release: NewRelease
    song: Song


def latest_batch_date(db: Session) -> date | None:
    """Return the most recent batch date, or None before the first batch runs."""
    return db.execute(
        select(func.max(NewRelease.batch_date))
    ).scalar()


def list_batch_rows(
    db: Session,
    batch_date: date,
) -> list[NewReleaseRow]:
    """Return one batch's featured releases with songs, in rank order."""
    rows = db.execute(
        select(NewRelease, Song)
        .join(Song, Song.id == NewRelease.song_id)
        .where(NewRelease.batch_date == batch_date)
        .order_by(NewRelease.rank.asc())
    ).all()
    return [
        NewReleaseRow(
            new_release=row[0],
            song=row[1],
        )
        for row in rows
    ]


def list_featured_release_group_mbids(db: Session) -> set[str]:
    """Return every release group ever featured, so batches never repeat an album."""
    rows = db.execute(
        select(NewRelease.release_group_mbid)
        .where(NewRelease.release_group_mbid.is_not(None))
    ).scalars()
    return set(rows)


def create_new_release(
    db: Session,
    song_id: int,
    released_at: date,
    release_group_mbid: str | None,
    batch_date: date,
    rank: int,
) -> NewRelease:
    """Stage one featured release row without committing."""
    row = NewRelease(
        song_id=song_id,
        released_at=released_at,
        release_group_mbid=release_group_mbid,
        batch_date=batch_date,
        rank=rank,
    )
    db.add(row)
    db.flush()
    return row
