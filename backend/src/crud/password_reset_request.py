"""Database access layer for the per-email password-reset throttle log."""
from datetime import datetime

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.password_reset_request import PasswordResetRequest


def record_request(
    db: Session,
    email_hash: str,
) -> PasswordResetRequest:
    """Append one throttle-log row for this email hash without committing."""
    row = PasswordResetRequest(email_hash=email_hash)
    db.add(row)
    db.flush()
    return row


def most_recent_request(
    db: Session,
    email_hash: str,
) -> PasswordResetRequest | None:
    """Return the latest request row for this email hash, or None."""
    return db.execute(
        select(PasswordResetRequest)
        .where(PasswordResetRequest.email_hash == email_hash)
        .order_by(PasswordResetRequest.created_at.desc())
    ).scalars().first()


def count_requests_since(
    db: Session,
    email_hash: str,
    since: datetime,
) -> int:
    """Count requests for this email hash at or after the given time."""
    return db.execute(
        select(func.count())
        .select_from(PasswordResetRequest)
        .where(PasswordResetRequest.email_hash == email_hash)
        .where(PasswordResetRequest.created_at >= since)
    ).scalar_one()


def delete_requests_before(
    db: Session,
    cutoff: datetime,
) -> int:
    """Opportunistically prune throttle-log rows older than the cutoff."""
    result = db.execute(
        delete(PasswordResetRequest)
        .where(PasswordResetRequest.created_at < cutoff)
    )
    db.flush()
    return result.rowcount or 0
