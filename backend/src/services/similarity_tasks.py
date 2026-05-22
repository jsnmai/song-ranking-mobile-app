"""Background task wrapper for similarity snapshot refresh."""
import logging

from src.crud.similarity import (
    find_candidate_user_ids,
    get_similarity_rows,
    upsert_snapshot,
)
from src.db.session import SessionLocal
from src.services.similarity import get_algorithm

logger = logging.getLogger(__name__)

_ALGORITHM_VERSION = "v1_cosine"


def _resolve_genre(
    genres_mb: list[str] | None,
    genre_deezer: str | None,
) -> str:
    """Prefer MusicBrainz genre, fall back to Deezer genre, then Unknown."""
    if genres_mb:
        return genres_mb[0]
    if genre_deezer:
        return genre_deezer
    return "Unknown"


def refresh_similarity_for_user_task(user_id: int) -> None:
    """
    Background entrypoint for similarity snapshot refresh after a rating finalizes.

    Opens its own DB session so this task is fully decoupled from the request
    lifecycle. Never accepts a request-scoped session — that would couple the
    task to the request's transaction state and prevent future migration to a
    queue worker without signature changes.

    Finds all users who share >= 5 rated songs with user_id and recomputes only
    those snapshots. Does NOT fan out to all pairs among everyone who rated the
    same songs — that explodes at scale.

    Per-candidate errors are caught, rolled back, and logged individually so a
    single bad pair does not abort the remaining candidates. All exceptions are
    swallowed; this task must never surface as a rating failure.
    """
    db = SessionLocal()
    try:
        user_rows = get_similarity_rows(db, user_id)
        candidate_ids = find_candidate_user_ids(db, user_id)

        if not candidate_ids:
            return

        algorithm = get_algorithm(_ALGORITHM_VERSION)

        scores_a = {r.song_id: r.score for r in user_rows}
        genres = {r.song_id: _resolve_genre(r.genres_mb, r.genre_deezer) for r in user_rows}
        artists = {r.song_id: r.artist for r in user_rows}

        for candidate_id in candidate_ids:
            try:
                candidate_rows = get_similarity_rows(db, candidate_id)
                scores_b = {r.song_id: r.score for r in candidate_rows}

                result = algorithm.compute(
                    scores_a,
                    scores_b,
                    genres,
                    artists,
                )
                if result is None:
                    continue

                user_a_id = min(user_id, candidate_id)
                user_b_id = max(user_id, candidate_id)

                upsert_snapshot(
                    db,
                    user_a_id=user_a_id,
                    user_b_id=user_b_id,
                    algorithm_version=_ALGORITHM_VERSION,
                    similarity_score=result.similarity_score,
                    shared_song_count=result.shared_song_count,
                    score_distance_avg=result.score_distance_avg,
                    shared_genres=result.shared_genres,
                    shared_top_artists=result.shared_top_artists,
                )
                db.commit()
            except Exception:
                db.rollback()
                logger.exception(
                    "Similarity compute failed for pair (user_id=%d, candidate_id=%d)",
                    user_id,
                    candidate_id,
                )
    except Exception:
        logger.exception(
            "Similarity refresh failed for user_id=%d",
            user_id,
        )
    finally:
        db.close()
