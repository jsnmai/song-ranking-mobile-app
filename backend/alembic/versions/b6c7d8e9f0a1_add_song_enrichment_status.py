"""add song enrichment status and attempt count

Revision ID: b6c7d8e9f0a1
Revises: a5b6c7d8e9f0
Create Date: 2026-05-21 00:00:00.000000

"""
import sqlalchemy as sa
from alembic import op


revision = "b6c7d8e9f0a1"
down_revision = "a5b6c7d8e9f0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "songs",
        sa.Column(
            "enrichment_status",
            sa.String(length=32),
            nullable=True,
            server_default="pending",
        ),
    )
    op.add_column(
        "songs",
        sa.Column(
            "enrichment_attempt_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )


def downgrade() -> None:
    op.drop_column("songs", "enrichment_attempt_count")
    op.drop_column("songs", "enrichment_status")
