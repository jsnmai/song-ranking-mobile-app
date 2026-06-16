"""
Business logic for client-reported interaction events.

These are capture-now signals (AUXSTROLOGY.md §14): logged before any feature
reads them, because behavioral history cannot be backfilled. The endpoint is
deliberately forgiving — an unknown song resolves to a null song_id rather than
an error, so analytics writes never break a user-facing flow.
"""
from sqlalchemy.orm import Session

from src.crud.interaction_event import create_interaction_event
from src.crud.song import get_by_deezer_id
from src.pydantic_schemas.events import InteractionEventCreate, InteractionEventResponse


def record_client_event(
    db: Session,
    user_id: int,
    data: InteractionEventCreate,
) -> InteractionEventResponse:
    """Record one whitelisted client event."""
    song_id = None
    if data.deezer_id is not None:
        song = get_by_deezer_id(
            db,
            data.deezer_id,
        )
        song_id = song.id if song else None

    context = {}
    if data.deezer_id is not None:
        context["deezer_id"] = data.deezer_id
    if data.listened_ms is not None:
        context["listened_ms"] = data.listened_ms

    try:
        create_interaction_event(
            db,
            user_id=user_id,
            event_type=data.event_type,
            song_id=song_id,
            source=data.source,
            context=context or None,
        )
        db.commit()
    except Exception:
        db.rollback()
        raise

    return InteractionEventResponse(recorded=True)
