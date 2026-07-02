"""add new_releases table

Revision ID: b4d9f1e6a7c2
Revises: a3c8e5f7d2b9
Create Date: 2026-07-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b4d9f1e6a7c2'
down_revision: Union[str, Sequence[str], None] = 'a3c8e5f7d2b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'new_releases',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('song_id', sa.Integer(), nullable=False),
        sa.Column('released_at', sa.Date(), nullable=False),
        sa.Column('release_group_mbid', sa.String(length=36), nullable=True),
        sa.Column('batch_date', sa.Date(), nullable=False),
        sa.Column('rank', sa.Integer(), nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ['song_id'],
            ['songs.id'],
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('batch_date', 'rank', name='uq_new_releases_batch_rank'),
    )
    op.create_index(
        'ix_new_releases_release_group_mbid',
        'new_releases',
        ['release_group_mbid'],
        unique=True,
    )
    op.create_index(
        'ix_new_releases_batch_date',
        'new_releases',
        ['batch_date'],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_new_releases_batch_date', table_name='new_releases')
    op.drop_index('ix_new_releases_release_group_mbid', table_name='new_releases')
    op.drop_table('new_releases')
