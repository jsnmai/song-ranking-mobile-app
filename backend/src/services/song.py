# Business logic for durable song persistence.
from sqlalchemy.orm import Session

from src.crud.song import upsert_from_deezer
from src.pydantic_schemas.song import SongCreate, SongResponse


def persist_user_touched_song(
    db: Session,
    data: SongCreate,
) -> SongResponse:
    """
    Persist a song only after meaningful user action.

    Search results stay transient. Rating/bookmark flows call this service when
    a song enters LISTn's durable product graph.
    """
    try:
        song = upsert_from_deezer(
            db,
            data,
        )
        db.commit()
        db.refresh(song)
    except Exception:
        db.rollback()
        raise

    return SongResponse.model_validate(song)
