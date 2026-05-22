"""add user_similarity_snapshots table

Revision ID: c2d3e4f5a6b7
Revises: b6c7d8e9f0a1
Create Date: 2026-05-21 00:00:00.000000

"""
import sqlalchemy as sa
from alembic import op


revision = "c2d3e4f5a6b7"
down_revision = "b6c7d8e9f0a1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_similarity_snapshots",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_a_id", sa.Integer(), nullable=False),
        sa.Column("user_b_id", sa.Integer(), nullable=False),
        sa.Column("similarity_score", sa.Float(), nullable=False),
        sa.Column("shared_song_count", sa.Integer(), nullable=False),
        sa.Column("score_distance_avg", sa.Float(), nullable=True),
        sa.Column("shared_genres", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("shared_top_artists", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("algorithm_version", sa.String(length=64), nullable=False, server_default="v1_cosine"),
        sa.Column(
            "computed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint("user_a_id < user_b_id", name="ck_user_similarity_a_lt_b"),
        sa.ForeignKeyConstraint(["user_a_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["user_b_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_a_id",
            "user_b_id",
            "algorithm_version",
            name="uq_user_similarity_user_a_b_algo",
        ),
    )
    op.create_index("ix_user_similarity_user_a", "user_similarity_snapshots", ["user_a_id"])
    op.create_index("ix_user_similarity_user_b", "user_similarity_snapshots", ["user_b_id"])


def downgrade() -> None:
    op.drop_index("ix_user_similarity_user_b", table_name="user_similarity_snapshots")
    op.drop_index("ix_user_similarity_user_a", table_name="user_similarity_snapshots")
    op.drop_table("user_similarity_snapshots")
