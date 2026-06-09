"""rename_saved_songs_to_bookmarks

Revision ID: e536cd197b13
Revises: e6f7a8b9c0d1
Create Date: 2026-06-09 10:59:31.533555

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'e536cd197b13'
down_revision: Union[str, Sequence[str], None] = 'e6f7a8b9c0d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Rename saved_songs table and its constraints/indexes to bookmarks."""
    op.rename_table("saved_songs", "bookmarks")
    op.execute("ALTER INDEX ix_saved_songs_user_created_at RENAME TO ix_bookmarks_user_created_at")
    op.execute("ALTER TABLE bookmarks RENAME CONSTRAINT uq_saved_songs_user_song TO uq_bookmarks_user_song")


def downgrade() -> None:
    """Revert bookmarks table and its constraints/indexes back to saved_songs."""
    op.rename_table("bookmarks", "saved_songs")
    op.execute("ALTER INDEX ix_bookmarks_user_created_at RENAME TO ix_saved_songs_user_created_at")
    op.execute("ALTER TABLE saved_songs RENAME CONSTRAINT uq_bookmarks_user_song TO uq_saved_songs_user_song")
