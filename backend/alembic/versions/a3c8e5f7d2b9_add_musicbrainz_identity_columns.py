"""add musicbrainz identity columns

Revision ID: a3c8e5f7d2b9
Revises: 9a1b2c3d4e5f
Create Date: 2026-07-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a3c8e5f7d2b9'
down_revision: Union[str, Sequence[str], None] = '9a1b2c3d4e5f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'songs',
        sa.Column(
            'artist_mbid',
            sa.String(length=36),
            nullable=True,
        ),
    )
    op.add_column(
        'songs',
        sa.Column(
            'release_group_mbid',
            sa.String(length=36),
            nullable=True,
        ),
    )
    op.add_column(
        'songs',
        sa.Column(
            'track_position',
            sa.Integer(),
            nullable=True,
        ),
    )
    op.add_column(
        'songs',
        sa.Column(
            'track_count',
            sa.Integer(),
            nullable=True,
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('songs', 'track_count')
    op.drop_column('songs', 'track_position')
    op.drop_column('songs', 'release_group_mbid')
    op.drop_column('songs', 'artist_mbid')
