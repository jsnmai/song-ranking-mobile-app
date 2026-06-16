"""add interaction_events

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-06-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'interaction_events',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column(
            'user_id',
            sa.Integer(),
            sa.ForeignKey('users.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('event_type', sa.String(length=40), nullable=False),
        sa.Column(
            'song_id',
            sa.Integer(),
            sa.ForeignKey('songs.id'),
            nullable=True,
        ),
        sa.Column(
            'subject_user_id',
            sa.Integer(),
            sa.ForeignKey('users.id', ondelete='SET NULL'),
            nullable=True,
        ),
        sa.Column('source', sa.String(length=30), nullable=True),
        sa.Column('context', JSONB(), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
    )
    op.create_index(
        'ix_interaction_events_user_created_at',
        'interaction_events',
        ['user_id', 'created_at'],
    )
    op.create_index(
        'ix_interaction_events_user_type_created_at',
        'interaction_events',
        ['user_id', 'event_type', 'created_at'],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        'ix_interaction_events_user_type_created_at',
        table_name='interaction_events',
    )
    op.drop_index(
        'ix_interaction_events_user_created_at',
        table_name='interaction_events',
    )
    op.drop_table('interaction_events')
