"""SQLAlchemy model for password-reset codes."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base


class PasswordResetToken(Base):
    """
    A single-use password-reset code for one user.

    Only the bcrypt hash of the 6-digit code is stored — the plaintext lives
    only in memory and the email. A new reset request invalidates all of a
    user's prior unconsumed tokens, so at most one is active at a time.
    """

    __tablename__ = "password_reset_tokens"
    __table_args__ = (
        Index(
            "ix_password_reset_tokens_user_id",
            "user_id",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
    )
    hashed_code: Mapped[str] = mapped_column(
        String(60),
        nullable=False,  # bcrypt output is always exactly 60 chars
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    attempts: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )
    consumed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
