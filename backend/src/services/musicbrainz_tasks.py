"""Background task wrapper for MusicBrainz enrichment."""
import asyncio
import logging

from src.core.config import settings
from src.crud.song import list_enrichment_retry_candidates
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


def run_enrichment_sweep() -> int:
    """
    Re-attempt enrichment for songs stuck in "pending"/"failed_temporary", capped per pass.

    Candidate ids are read in a short-lived session that closes before any MusicBrainz
    call, so slow provider responses never hold a transaction open. Each song then runs
    through the standard task wrapper (own session, errors logged and swallowed). Returns
    how many songs were attempted.
    """
    db = SessionLocal()
    try:
        candidates = list_enrichment_retry_candidates(
            db,
            limit=settings.enrichment_sweep_batch_size,
            max_attempts=settings.enrichment_max_attempts,
        )
        song_ids = [song.id for song in candidates]
    finally:
        db.close()

    for song_id in song_ids:
        enrich_song_metadata_task(song_id)
    return len(song_ids)


async def enrichment_sweep_loop() -> None:
    """
    Periodic retry sweep, started from the app lifespan.

    Sleeps BEFORE the first pass so short-lived processes (tests, one-off TestClient
    lifespans) exit without ever touching MusicBrainz. The sweep body runs in a worker
    thread because enrichment is synchronous and throttled with time.sleep.
    """
    while True:
        await asyncio.sleep(settings.enrichment_sweep_interval_seconds)
        try:
            attempted = await asyncio.to_thread(run_enrichment_sweep)
            if attempted:
                logger.info(
                    "MusicBrainz retry sweep attempted %d songs",
                    attempted,
                )
        except Exception:
            logger.exception("MusicBrainz retry sweep failed")
