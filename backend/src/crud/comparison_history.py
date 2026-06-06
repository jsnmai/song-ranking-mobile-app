"""Database access for current-user Versus History."""
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session, aliased

from src.sqlalchemy_tables.comparison import Comparison
from src.sqlalchemy_tables.song import Song


@dataclass(frozen=True)
class ComparisonHistoryRow:
    """One finalized comparison paired with both songs."""

    comparison: Comparison
    song_a: Song
    song_b: Song


def list_user_comparison_history(
    db: Session,
    user_id: int,
    limit: int,
) -> list[ComparisonHistoryRow]:
    """Return the current user's finalized comparison receipts newest first."""
    song_a = aliased(Song)
    song_b = aliased(Song)
    rows = db.execute(
        select(
            Comparison,
            song_a,
            song_b,
        )
        .join(
            song_a,
            song_a.id == Comparison.song_a_id,
        )
        .join(
            song_b,
            song_b.id == Comparison.song_b_id,
        )
        .where(Comparison.user_id == user_id)
        .where(Comparison.finalized_at.is_not(None))
        .order_by(
            Comparison.finalized_at.desc(),
            Comparison.created_at.desc(),
            Comparison.id.desc(),
        )
        .limit(limit)
    ).all()
    return [
        ComparisonHistoryRow(
            comparison=row[0],
            song_a=row[1],
            song_b=row[2],
        )
        for row in rows
    ]
