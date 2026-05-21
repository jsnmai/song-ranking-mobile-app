"""add global rating sum to songs

Revision ID: a5b6c7d8e9f0
Revises: f4a5b6c7d8e9
Create Date: 2026-05-21 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "a5b6c7d8e9f0"
down_revision = "f4a5b6c7d8e9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "songs",
        sa.Column(
            "global_rating_sum",
            sa.Float(),
            nullable=True,
        ),
    )
    op.execute(
        """
        UPDATE songs
        SET
            global_rating_sum = aggregates.rating_sum,
            global_rating_count = aggregates.rating_count,
            global_avg_score = aggregates.rating_sum / aggregates.rating_count
        FROM (
            SELECT
                rankings.song_id AS song_id,
                COUNT(rankings.id)::integer AS rating_count,
                SUM(rankings.score)::float AS rating_sum
            FROM rankings
            GROUP BY rankings.song_id
        ) AS aggregates
        WHERE songs.id = aggregates.song_id
        """
    )
    op.execute(
        """
        UPDATE songs
        SET
            global_rating_sum = NULL,
            global_rating_count = 0,
            global_avg_score = NULL
        WHERE NOT EXISTS (
            SELECT 1
            FROM rankings
            WHERE rankings.song_id = songs.id
        )
        """
    )


def downgrade() -> None:
    op.drop_column("songs", "global_rating_sum")
