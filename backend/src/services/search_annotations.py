"""LISTn-owned annotations for client-direct provider search results."""
from sqlalchemy.orm import Session

from src.crud.song_provider_ref import list_provider_rating_annotations
from src.pydantic_schemas.search import (
    AppleSearchAnnotationRequest,
    AppleSearchAnnotationResponse,
    AppleSearchAnnotationResult,
)


def annotate_apple_search_results(
    db: Session,
    user_id: int,
    data: AppleSearchAnnotationRequest,
) -> AppleSearchAnnotationResponse:
    """
    Annotate Apple search results using only LISTn database state.

    This endpoint intentionally does not call Apple. It only resolves known
    provider refs and the current user's rating state.
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
    annotations: list[AppleSearchAnnotationResult] = []
    for item in data.results:
        storefront = item.storefront or "US"
        row = by_identity.get(
            (
                item.apple_track_id,
                storefront,
            )
        )
        ranking = row.ranking if row is not None else None
        annotations.append(
            AppleSearchAnnotationResult(
                apple_track_id=item.apple_track_id,
                storefront=storefront,
                song_id=row.provider_ref.song_id if row is not None else None,
                my_bucket=ranking.bucket if ranking is not None else None,
                my_score=ranking.score if ranking is not None else None,
                already_rated=ranking is not None,
            )
        )
    return AppleSearchAnnotationResponse(results=annotations)
