"""Business logic for current-user Versus History."""
from sqlalchemy.orm import Session

from src.crud.comparison_history import ComparisonHistoryRow, list_user_comparison_history
from src.pydantic_schemas.comparison_history import (
    ComparisonHistoryListResponse,
    ComparisonHistoryReceiptResponse,
)

VERSUS_HISTORY_LIMIT = 50


def list_my_comparison_history(
    db: Session,
    user_id: int,
) -> ComparisonHistoryListResponse:
    """Return the authenticated user's recent finalized comparison receipts.

    Uses the ``only_rated`` default so receipts whose songs the user has since
    un-rated are hidden from the UI. The underlying comparison rows are retained;
    call ``list_user_comparison_history(..., only_rated=False)`` for the full
    history (analytics / future features).
    """
    rows = list_user_comparison_history(
        db,
        user_id=user_id,
        limit=VERSUS_HISTORY_LIMIT,
    )
    return ComparisonHistoryListResponse(
        receipts=[
            _receipt_response(row)
            for row in rows
        ],
    )


def _receipt_response(
    row: ComparisonHistoryRow,
) -> ComparisonHistoryReceiptResponse:
    """Build a Versus History receipt with an explicit winner and loser."""
    if row.comparison.winner_id == row.song_a.id:
        winner = row.song_a
        loser = row.song_b
    else:
        winner = row.song_b
        loser = row.song_a

    return ComparisonHistoryReceiptResponse(
        id=row.comparison.id,
        winner_song_id=winner.id,
        winner_title=winner.title,
        winner_artist=winner.artist,
        winner_cover_url=winner.cover_url,
        loser_song_id=loser.id,
        loser_title=loser.title,
        loser_artist=loser.artist,
        loser_cover_url=loser.cover_url,
        bucket=row.comparison.bucket,
        decision_duration_ms=row.comparison.decision_duration_ms,
        comparison_session_uuid=row.comparison.session_uuid,
        comparison_index_in_session=row.comparison.comparison_index_in_session,
        finalized_at=row.comparison.finalized_at,
    )
