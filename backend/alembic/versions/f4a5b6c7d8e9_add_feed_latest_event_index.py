"""add feed latest event index

Revision ID: f4a5b6c7d8e9
Revises: e3f4a5b6c7d8
Create Date: 2026-05-21 00:00:00.000000

"""
from alembic import op


revision = "f4a5b6c7d8e9"
down_revision = "e3f4a5b6c7d8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_rating_events_user_song_created_at_id",
        "rating_events",
        [
            "user_id",
            "song_id",
            "created_at",
            "id",
        ],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_rating_events_user_song_created_at_id",
        table_name="rating_events",
    )
