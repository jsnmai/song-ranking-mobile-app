"""add login_attempts table

Revision ID: c5e8a2d9f4b1
Revises: b4d9f1e6a7c2
Create Date: 2026-07-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c5e8a2d9f4b1'
down_revision: Union[str, Sequence[str], None] = 'b4d9f1e6a7c2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'login_attempts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email_hash', sa.String(length=64), nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_login_attempts_email_hash',
        'login_attempts',
        ['email_hash'],
    )
    op.create_index(
        'ix_login_attempts_created_at',
        'login_attempts',
        ['created_at'],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_login_attempts_created_at', table_name='login_attempts')
    op.drop_index('ix_login_attempts_email_hash', table_name='login_attempts')
    op.drop_table('login_attempts')
