"""add profile avatar_color

Revision ID: a1b2c3d4e5f6
Revises: e536cd197b13
Create Date: 2026-06-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'e536cd197b13'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'profiles',
        sa.Column('avatar_color', sa.String(length=20), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('profiles', 'avatar_color')
