"""SQLAlchemy model for the per-email failed-login throttle log."""
from datetime import datetime

from sqlalchemy import DateTime, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base


class LoginAttempt(Base):
    """
    One row per FAILED login attempt, keyed by a hash of the email.

    Backs the per-account login throttle: per-IP limits alone are evadable by an
    attacker rotating (or forging) source addresses, so brute-forcing one account
    is bounded here by the account itself. The throttle check runs BEFORE the user
    lookup and rows are recorded for known and unknown emails alike, so the 429
    behaves identically for both and never becomes an enumeration oracle. Only the
    keyed HMAC-SHA256 hash of the normalized email is stored — never the plaintext
    address. Successful logins clear the email's rows.
    """

    __tablename__ = "login_attempts"
    __table_args__ = (
        Index(
            "ix_login_attempts_email_hash",
            "email_hash",
        ),
        Index(
            "ix_login_attempts_created_at",
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
