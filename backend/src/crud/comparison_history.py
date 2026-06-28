"""Database access for current-user Versus History."""
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session, aliased

from src.sqlalchemy_tables.comparison import Comparison
from src.sqlalchemy_tables.ranking import Ranking
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
    only_rated: bool = True,
) -> list[ComparisonHistoryRow]:
    """Return the current user's finalized comparison receipts newest first.

    When ``only_rated`` is True (the user-facing default) a comparison is
    returned only if BOTH of its songs are still rated by the user — i.e. a
    ``rankings`` row exists for each. Removing a rating deletes the ranking but
    intentionally keeps the comparison row for analytics, so this filter hides
    stale receipts from the UI without discarding data. Pass ``only_rated=False``
    to read the complete raw history (e.g. analytics / future features).
    """
    song_a = aliased(Song)
    song_b = aliased(Song)
    stmt = (
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
    )
    if only_rated:
        # INNER join the user's current rankings for both songs; the join (and
        # therefore the both-songs-rated filter) is applied before LIMIT, so the
        # limit is taken over the already-filtered set.
        ranking_a = aliased(Ranking)
        ranking_b = aliased(Ranking)
        stmt = stmt.join(
            ranking_a,
            (ranking_a.song_id == Comparison.song_a_id)
            & (ranking_a.user_id == user_id),
        ).join(
            ranking_b,
            (ranking_b.song_id == Comparison.song_b_id)
            & (ranking_b.user_id == user_id),
        )
    stmt = (
        stmt
        .where(Comparison.user_id == user_id)
        .where(Comparison.finalized_at.is_not(None))
        .order_by(
            Comparison.finalized_at.desc(),
            Comparison.created_at.desc(),
            Comparison.id.desc(),
        )
        .limit(limit)
    )
    rows = db.execute(stmt).all()
    return [
        ComparisonHistoryRow(
            comparison=row[0],
            song_a=row[1],
            song_b=row[2],
        )
        for row in rows
    ]
