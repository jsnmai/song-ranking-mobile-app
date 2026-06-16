"""add profile hide_like_counts

Revision ID: f7b3d1a9c5e2
Revises: e7a1c9f2b4d6
Create Date: 2026-06-16 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f7b3d1a9c5e2'
down_revision: Union[str, Sequence[str], None] = 'e7a1c9f2b4d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'profiles',
        sa.Column(
            'hide_like_counts',
            sa.Boolean(),
            server_default=sa.text('false'),
            nullable=False,
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('profiles', 'hide_like_counts')
