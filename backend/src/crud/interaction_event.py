"""Database access for interaction_events."""
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.interaction_event import InteractionEvent


def create_interaction_event(
    db: Session,
    user_id: int,
    event_type: str,
    song_id: int | None = None,
    subject_user_id: int | None = None,
    source: str | None = None,
    context: dict[str, Any] | None = None,
) -> InteractionEvent:
    """Append one interaction event without committing. Caller commits."""
    event = InteractionEvent(
        user_id=user_id,
        event_type=event_type,
        song_id=song_id,
        subject_user_id=subject_user_id,
        source=source,
        context=context,
    )
    db.add(event)
    db.flush()
    return event


def latest_interaction_event(
    db: Session,
    user_id: int,
    event_types: tuple[str, ...],
) -> InteractionEvent | None:
    """Return the newest matching interaction event row for one user, or None."""
    return db.execute(
        select(InteractionEvent)
        .where(InteractionEvent.user_id == user_id)
        .where(InteractionEvent.event_type.in_(event_types))
        .order_by(InteractionEvent.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()


def get_interaction_event_by_session_uuid(
    db: Session,
    user_id: int,
    event_type: str,
    session_uuid: str,
) -> InteractionEvent | None:
    """Return one user's event of this type tagged with a comparison_session_uuid in context."""
    return db.execute(
        select(InteractionEvent)
        .where(InteractionEvent.user_id == user_id)
        .where(InteractionEvent.event_type == event_type)
        .where(InteractionEvent.context["comparison_session_uuid"].astext == session_uuid)
    ).scalar_one_or_none()


def delete_interaction_event(
    db: Session,
    event: InteractionEvent,
) -> None:
    """Remove one interaction event without committing. Caller commits."""
    db.delete(event)
