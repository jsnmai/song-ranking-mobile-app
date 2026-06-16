"""add profile timezone

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-06-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'profiles',
        sa.Column('timezone', sa.String(length=50), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('profiles', 'timezone')
