"""SQLAlchemy model for the per-email password-reset throttle log."""
from datetime import datetime

from sqlalchemy import DateTime, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base


class PasswordResetRequest(Base):
    """
    One row per password-reset request, keyed by a hash of the email.

    Backs the per-account abuse throttle (cooldown + hourly cap). A row is
    recorded for every request, even when no user matches the email, so an
    attacker cannot flood a specific inbox. Only the keyed HMAC-SHA256 hash of
    the normalized email is stored — never the plaintext address — so the table
    is useless to anyone who lacks the server-side pepper.
    """

    __tablename__ = "password_reset_requests"
    __table_args__ = (
        Index(
            "ix_password_reset_requests_email_hash",
            "email_hash",
        ),
        Index(
            "ix_password_reset_requests_created_at",
            "created_at",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    email_hash: Mapped[str] = mapped_column(
        String(64),
        nullable=False,  # HMAC-SHA256 hex digest is always 64 chars
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
