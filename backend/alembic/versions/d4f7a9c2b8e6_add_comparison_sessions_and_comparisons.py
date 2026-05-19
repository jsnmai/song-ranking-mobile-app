"""add comparison sessions and comparisons

Revision ID: d4f7a9c2b8e6
Revises: b6d8f3a7c9e1
Create Date: 2026-05-18 18:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "d4f7a9c2b8e6"
down_revision: Union[str, Sequence[str], None] = "b6d8f3a7c9e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "comparison_sessions",
        sa.Column("session_uuid", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("song_payload", postgresql.JSONB(), nullable=False),
        sa.Column("bucket", sa.String(length=20), nullable=False),
        sa.Column("note", sa.String(length=280), nullable=True),
        sa.Column("low_index", sa.Integer(), nullable=False),
        sa.Column("high_index", sa.Integer(), nullable=False),
        sa.Column("candidate_index", sa.Integer(), nullable=True),
        sa.Column("candidate_song_id", sa.Integer(), nullable=True),
        sa.Column("final_position", sa.Integer(), nullable=True),
        sa.Column("decisions", postgresql.JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["candidate_song_id"], ["songs.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("session_uuid"),
    )
    op.create_index(
        "ix_comparison_sessions_user_created_at",
        "comparison_sessions",
        ["user_id", "created_at"],
        unique=False,
    )

    op.create_table(
        "comparisons",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("session_uuid", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("song_a_id", sa.Integer(), nullable=False),
        sa.Column("song_b_id", sa.Integer(), nullable=False),
        sa.Column("winner_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("finalized_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["song_a_id"], ["songs.id"]),
        sa.ForeignKeyConstraint(["song_b_id"], ["songs.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["winner_id"], ["songs.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_comparisons_session_uuid",
        "comparisons",
        ["session_uuid"],
        unique=False,
    )
    op.create_index(
        "ix_comparisons_user_created_at",
        "comparisons",
        ["user_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_comparisons_user_created_at", table_name="comparisons")
    op.drop_index("ix_comparisons_session_uuid", table_name="comparisons")
    op.drop_table("comparisons")
    op.drop_index("ix_comparison_sessions_user_created_at", table_name="comparison_sessions")
    op.drop_table("comparison_sessions")
