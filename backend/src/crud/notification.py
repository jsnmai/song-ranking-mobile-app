"""Database access for in-app notifications."""
from datetime import datetime

from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.notification import Notification


def get_notification(
    db: Session,
    recipient_id: int,
    actor_id: int,
    type: str,
    rating_event_id: int | None,
) -> Notification | None:
    """Return the existing notification row for this (recipient, actor, type, target), or None."""
    query = (
        select(Notification)
        .where(Notification.recipient_id == recipient_id)
        .where(Notification.actor_id == actor_id)
        .where(Notification.type == type)
    )
    if rating_event_id is None:
        query = query.where(Notification.rating_event_id.is_(None))
    else:
        query = query.where(Notification.rating_event_id == rating_event_id)
    return db.execute(query).scalar_one_or_none()


def create_notification(
    db: Session,
    recipient_id: int,
    actor_id: int,
    type: str,
    rating_event_id: int | None,
    now: datetime,
) -> Notification:
    """Stage a new (unread) notification row and return the flushed instance."""
    notification = Notification(
        recipient_id=recipient_id,
        actor_id=actor_id,
        type=type,
        rating_event_id=rating_event_id,
        created_at=now,
        read_at=None,
    )
    db.add(notification)
    db.flush()
    return notification


def resurface_notification(
    db: Session,
    notification: Notification,
    now: datetime,
) -> None:
    """Bump an existing row back to the top as unread (a genuine re-trigger past the cooldown)."""
    notification.created_at = now
    notification.read_at = None
    db.flush()


def list_notifications(
    db: Session,
    recipient_id: int,
    limit: int,
    cursor_created_at: datetime | None,
    cursor_id: int | None,
) -> list[Notification]:
    """Return a recipient's notifications, newest first, after the (created_at, id) cursor."""
    query = (
        select(Notification)
        .where(Notification.recipient_id == recipient_id)
    )
    if cursor_created_at is not None and cursor_id is not None:
        query = query.where(
            or_(
                Notification.created_at < cursor_created_at,
                (Notification.created_at == cursor_created_at) & (Notification.id < cursor_id),
            )
        )
    query = query.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(limit)
    return list(db.execute(query).scalars())


def count_unread(
    db: Session,
    recipient_id: int,
) -> int:
    """Return how many unread notifications the recipient has."""
    return db.execute(
        select(func.count())
        .select_from(Notification)
        .where(Notification.recipient_id == recipient_id)
        .where(Notification.read_at.is_(None))
    ).scalar_one()


def mark_all_read(
    db: Session,
    recipient_id: int,
    now: datetime,
) -> None:
    """Mark every unread notification for the recipient as read."""
    db.execute(
        update(Notification)
        .where(Notification.recipient_id == recipient_id)
        .where(Notification.read_at.is_(None))
        .values(read_at=now)
    )


def delete_notifications_for_user(
    db: Session,
    user_id: int,
) -> None:
    """Remove every notification this user received or caused (used by account deletion)."""
    db.execute(
        delete(Notification)
        .where(
            or_(
                Notification.recipient_id == user_id,
                Notification.actor_id == user_id,
            )
        )
    )
