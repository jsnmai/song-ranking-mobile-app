# HTTP layer for song search endpoints.
# Routers stay thin: validate request params, call the service, return the result.
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from src.core.dependencies import get_current_user, get_db
from src.core.limiter import limiter
from src.pydantic_schemas.search import SongSearchResponse
from src.services.search import search_deezer_songs
from src.sqlalchemy_tables.user import User

router = APIRouter(
    prefix="/search",
    tags=["search"],
)


@router.get(
    "/songs",
    response_model=SongSearchResponse,
)
@limiter.limit("30/minute")
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
