"""Database access layer for password-reset tokens."""
from datetime import datetime

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.password_reset_token import PasswordResetToken


def create_token(
    db: Session,
    user_id: int,
    hashed_code: str,
    expires_at: datetime,
) -> PasswordResetToken:
    """Stage a new reset token without committing."""
    token = PasswordResetToken(
        user_id=user_id,
        hashed_code=hashed_code,
        expires_at=expires_at,
    )
    db.add(token)
    db.flush()
    return token


def get_active_token_for_user(
    db: Session,
    user_id: int,
    now: datetime,
) -> PasswordResetToken | None:
    """
    Return the user's newest usable reset token, or None.

    Usable = not consumed and not expired. invalidate_user_tokens marks prior
    tokens consumed on each new request, so at most one is active; ordering
    newest-first is defensive.
    """
    return db.execute(
        select(PasswordResetToken)
        .where(PasswordResetToken.user_id == user_id)
        .where(PasswordResetToken.consumed_at.is_(None))
        .where(PasswordResetToken.expires_at > now)
        .order_by(PasswordResetToken.created_at.desc())
    ).scalars().first()


def increment_attempts(
    db: Session,
    token: PasswordResetToken,
) -> None:
    """Record one failed verification attempt without committing."""
    token.attempts += 1
    db.flush()


def mark_consumed(
    db: Session,
    token: PasswordResetToken,
    consumed_at: datetime,
) -> None:
    """Mark a token single-use-consumed without committing."""
    token.consumed_at = consumed_at
    db.flush()


def invalidate_user_tokens(
    db: Session,
    user_id: int,
    consumed_at: datetime,
) -> None:
    """Consume all of a user's still-active tokens so only the newest can work."""
    db.execute(
        update(PasswordResetToken)
        .where(PasswordResetToken.user_id == user_id)
        .where(PasswordResetToken.consumed_at.is_(None))
        .values(consumed_at=consumed_at)
    )
    db.flush()


def delete_expired(
    db: Session,
    expires_before: datetime,
) -> int:
    """Opportunistically delete tokens that expired before the cutoff."""
    result = db.execute(
        delete(PasswordResetToken)
        .where(PasswordResetToken.expires_at < expires_before)
    )
    db.flush()
    return result.rowcount or 0
