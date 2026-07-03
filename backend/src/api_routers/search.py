# HTTP layer for song search endpoints.
# Routers stay thin: validate request params, call the service, return the result.
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from src.core.dependencies import get_current_user, get_db
from src.core.limiter import limiter, user_or_ip_key
from src.pydantic_schemas.search import (
    AppleSearchAnnotationRequest,
    AppleSearchAnnotationResponse,
    SongSearchResponse,
)
from src.services.search import search_deezer_songs
from src.services.search_annotations import annotate_apple_search_results
from src.sqlalchemy_tables.user import User

router = APIRouter(
    prefix="/search",
    tags=["search"],
)


@router.get(
    "/songs",
    response_model=SongSearchResponse,
)
@limiter.limit("30/minute", key_func=user_or_ip_key)
def search_songs(
    request: Request,
    q: str = Query(
        min_length=2,
        max_length=100,
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SongSearchResponse:
    """Return normalized Deezer song results annotated with the viewer's ratings."""
    return search_deezer_songs(
        db,
        current_user.id,
        q,
    )


@router.post(
    "/apple/annotations",
    response_model=AppleSearchAnnotationResponse,
)
@limiter.limit("120/minute", key_func=user_or_ip_key)
def annotate_apple_search(
    request: Request,
    data: AppleSearchAnnotationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AppleSearchAnnotationResponse:
    """Annotate client-direct Apple search results using only LISTn-owned data."""
    return annotate_apple_search_results(
        db,
        user_id=current_user.id,
        data=data,
    )
