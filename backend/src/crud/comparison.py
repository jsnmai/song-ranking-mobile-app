"""Database access layer for comparison sessions and comparisons."""
from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.comparison import Comparison
from src.sqlalchemy_tables.comparison_session import ComparisonSession


def create_comparison_session(
    db: Session,
    user_id: int,
    song_payload: dict,
    bucket: str,
    note: str | None,
    low_index: int,
    high_index: int,
    candidate_index: int,
    candidate_song_id: int,
) -> ComparisonSession:
    """Create active comparison-session state without committing."""
    session = ComparisonSession(
        user_id=user_id,
        song_payload=song_payload,
        bucket=bucket,
        note=note,
        low_index=low_index,
        high_index=high_index,
        candidate_index=candidate_index,
        candidate_song_id=candidate_song_id,
        final_position=None,
        decisions=[],
    )
    db.add(session)
    db.flush()
    return session


def get_user_comparison_session(
    db: Session,
    user_id: int,
    session_uuid: UUID,
) -> ComparisonSession | None:
    """Return one active session scoped to the current user, or None."""
    return db.execute(
        select(ComparisonSession)
        .where(ComparisonSession.user_id == user_id)
        .where(ComparisonSession.session_uuid == session_uuid)
    ).scalar_one_or_none()


def update_session_progress(
    session: ComparisonSession,
    low_index: int,
    high_index: int,
    candidate_index: int | None,
    candidate_song_id: int | None,
    final_position: int | None,
    decisions: list[dict],
) -> None:
    """Apply binary-search progress to an active session."""
    session.low_index = low_index
    session.high_index = high_index
    session.candidate_index = candidate_index
    session.candidate_song_id = candidate_song_id
    session.final_position = final_position
    session.decisions = decisions


def delete_comparison_session(
    db: Session,
    session: ComparisonSession,
) -> None:
    """Delete active session state without committing."""
    db.delete(session)
    db.flush()


def create_comparison(
    db: Session,
    session_uuid: UUID,
    user_id: int,
    song_a_id: int,
    song_b_id: int,
    winner_id: int,
    created_at: datetime,
    finalized_at: datetime,
) -> Comparison:
    """Create one append-only comparison row without committing."""
    comparison = Comparison(
        session_uuid=session_uuid,
        user_id=user_id,
        song_a_id=song_a_id,
        song_b_id=song_b_id,
        winner_id=winner_id,
        created_at=created_at,
        finalized_at=finalized_at,
    )
    db.add(comparison)
    db.flush()
    return comparison


def commit_changes(
    db: Session,
) -> None:
    """Commit pending comparison-session changes."""
    db.commit()


def refresh_comparison_session(
    db: Session,
    session: ComparisonSession,
) -> None:
    """Refresh active session state after commit."""
    db.refresh(session)
