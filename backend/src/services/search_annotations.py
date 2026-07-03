"""LISTn-owned annotations for client-direct provider search results."""
from sqlalchemy.orm import Session

from src.crud.rating import list_all_user_rankings_with_songs
from src.crud.song_provider_ref import ensure_apple_ref, list_provider_rating_annotations
from src.pydantic_schemas.search import (
    AppleSearchAnnotationItem,
    AppleSearchAnnotationRequest,
    AppleSearchAnnotationResponse,
    AppleSearchAnnotationResult,
)
from src.services.song_matching import build_match_candidates, match_candidate
from src.sqlalchemy_tables.song import Song


def annotate_apple_search_results(
    db: Session,
    user_id: int,
    data: AppleSearchAnnotationRequest,
) -> AppleSearchAnnotationResponse:
    """
    Annotate Apple search results using only LISTn database state.

    This endpoint intentionally does not call Apple. It only resolves known
    provider refs and the current user's rating state. When a direct provider-ref
    match doesn't already resolve to this user's own rating (either no ref exists
    yet, or one exists but points at a song this user hasn't rated), it falls back
    to matching the result against songs this user has already rated by normalized
    title/artist/album — this recovers "already rated" state for songs rated before
    the app's Deezer->Apple migration, which never got an Apple provider ref.
    """
    requested = [
        (
            item.apple_track_id,
            item.storefront or "US",
        )
        for item in data.results
    ]
    rows = list_provider_rating_annotations(
        db,
        user_id=user_id,
        provider="apple",
        provider_tracks=requested,
    )
    by_identity = {
        (
            row.provider_ref.provider_track_id,
            row.provider_ref.storefront,
        ): row
        for row in rows
    }

    def _is_direct_hit(item: AppleSearchAnnotationItem) -> bool:
        direct = by_identity.get((item.apple_track_id, item.storefront or "US"))
        return direct is not None and direct.ranking is not None

    needs_fallback = any(not _is_direct_hit(item) for item in data.results)
    candidates = (
        build_match_candidates(list_all_user_rankings_with_songs(db, user_id))
        if needs_fallback
        else []
    )

    annotations: list[AppleSearchAnnotationResult] = []
    self_heal_writes: list[tuple[Song, str, str]] = []
    for item in data.results:
        storefront = item.storefront or "US"
        direct = by_identity.get((item.apple_track_id, storefront))

        if direct is not None and direct.ranking is not None:
            annotations.append(
                AppleSearchAnnotationResult(
                    apple_track_id=item.apple_track_id,
                    storefront=storefront,
                    song_id=direct.provider_ref.song_id,
                    my_bucket=direct.ranking.bucket,
                    my_score=direct.ranking.score,
                    already_rated=True,
                )
            )
            continue

        fallback = None
        if item.title and item.artist:
            fallback = match_candidate(candidates, item.title, item.artist, item.album)

        if fallback is None:
            annotations.append(
                AppleSearchAnnotationResult(
                    apple_track_id=item.apple_track_id,
                    storefront=storefront,
                    song_id=direct.provider_ref.song_id if direct is not None else None,
                    my_bucket=None,
                    my_score=None,
                    already_rated=False,
                )
            )
            continue

        if direct is None:
            self_heal_writes.append((fallback.song, item.apple_track_id, storefront))

        annotations.append(
            AppleSearchAnnotationResult(
                apple_track_id=item.apple_track_id,
                storefront=storefront,
                song_id=fallback.song.id,
                my_bucket=fallback.ranking.bucket,
                my_score=fallback.ranking.score,
                already_rated=True,
            )
        )

    if self_heal_writes:
        try:
            for song, apple_track_id, storefront in self_heal_writes:
                ensure_apple_ref(
                    db,
                    song=song,
                    apple_track_id=apple_track_id,
                    storefront=storefront,
                    provider_artist_id=None,
                    provider_album_id=None,
                    url=None,
                    artwork_url=None,
                    preview_available=None,
                    confidence="apple_legacy_fallback_match",
                )
            db.commit()
        except Exception:
            db.rollback()
            raise

    return AppleSearchAnnotationResponse(results=annotations)
