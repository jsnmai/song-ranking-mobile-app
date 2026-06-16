"""add auxstrology_snapshots

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-06-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'auxstrology_snapshots',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column(
            'user_id',
            sa.Integer(),
            sa.ForeignKey('users.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('algorithm_version', sa.String(length=20), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('sign_key', sa.String(length=60), nullable=True),
        sa.Column('payload', JSONB(), nullable=False),
        sa.Column(
            'computed_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
    )
    op.create_index(
        'ix_auxstrology_snapshots_user_version_computed',
        'auxstrology_snapshots',
        ['user_id', 'algorithm_version', 'computed_at'],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        'ix_auxstrology_snapshots_user_version_computed',
        table_name='auxstrology_snapshots',
    )
    op.drop_table('auxstrology_snapshots')
