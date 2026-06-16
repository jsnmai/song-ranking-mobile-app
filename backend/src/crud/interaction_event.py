"""Database writes for interaction_events."""
from typing import Any

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
