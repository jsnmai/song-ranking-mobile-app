"""add user_streaks table

Revision ID: a3d9f1e7c2b8
Revises: f7b3d1a9c5e2
Create Date: 2026-06-16 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a3d9f1e7c2b8'
down_revision: Union[str, Sequence[str], None] = 'f7b3d1a9c5e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'user_streaks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('current_streak', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('longest_streak', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('anchor_date', sa.Date(), nullable=True),
        sa.Column('last_active_date', sa.Date(), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', name='uq_user_streaks_user'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('user_streaks')
