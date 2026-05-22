"""Background task wrapper for MusicBrainz enrichment."""
import logging

from src.db.session import SessionLocal
from src.services.musicbrainz import enrich_song_metadata

logger = logging.getLogger(__name__)


def enrich_song_metadata_task(song_id: int) -> None:
    """
    Background entrypoint for MusicBrainz enrichment after a rating or comparison commits.

    Opens its own DB session so this task is fully decoupled from the request lifecycle.
    Never accepts a request-scoped session — that would couple the task to the request's
    transaction state and prevent future migration to a queue worker without signature changes.
    Errors are logged and swallowed; enrichment is best-effort and must never surface as a
    rating failure.
    """
    db = SessionLocal()
    try:
        enrich_song_metadata(
            db,
            song_id,
        )
    except Exception:
        logger.exception(
            "MusicBrainz enrichment failed for song_id=%d",
            song_id,
        )
    finally:
        db.close()
