"""add global aggregate scores to songs

Revision ID: e3f4a5b6c7d8
Revises: d1e2f3a4b5c6
Create Date: 2026-05-20 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "e3f4a5b6c7d8"
down_revision = "d1e2f3a4b5c6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "songs",
        sa.Column(
            "global_avg_score",
            sa.Float(),
            nullable=True,
        ),
    )
    op.add_column(
        "songs",
        sa.Column(
            "global_rating_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )


def downgrade() -> None:
    op.drop_column("songs", "global_rating_count")
    op.drop_column("songs", "global_avg_score")
