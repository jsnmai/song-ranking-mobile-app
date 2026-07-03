"""Database access layer for the per-email failed-login throttle log."""
from datetime import datetime

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.login_attempt import LoginAttempt


def record_failed_login(
    db: Session,
    email_hash: str,
) -> LoginAttempt:
    """Append one failed-attempt row for this email hash without committing."""
    row = LoginAttempt(email_hash=email_hash)
    db.add(row)
    db.flush()
    return row


def count_failed_logins_since(
    db: Session,
    email_hash: str,
    since: datetime,
) -> int:
    """Count failed attempts for this email hash at or after the given time."""
    return db.execute(
        select(func.count())
        .select_from(LoginAttempt)
        .where(LoginAttempt.email_hash == email_hash)
        .where(LoginAttempt.created_at >= since)
    ).scalar_one()


def clear_failed_logins(
    db: Session,
    email_hash: str,
) -> int:
    """Erase an email's failure history after a successful login, without committing."""
    result = db.execute(
        delete(LoginAttempt)
        .where(LoginAttempt.email_hash == email_hash)
    )
    db.flush()
    return result.rowcount or 0


def delete_failed_logins_before(
    db: Session,
    cutoff: datetime,
) -> int:
    """Opportunistically prune failure rows older than the cutoff."""
    result = db.execute(
        delete(LoginAttempt)
        .where(LoginAttempt.created_at < cutoff)
    )
    db.flush()
    return result.rowcount or 0
