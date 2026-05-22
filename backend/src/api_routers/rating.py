# HTTP layer for rating and ranking endpoints.
# Routers stay thin: parse auth/input, call services, return typed responses.
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from src.core.dependencies import get_current_user, get_db
from src.core.limiter import limiter
from src.pydantic_schemas.rating import (
    RankingListResponse,
    RankingReorderRequest,
    RankingReorderResponse,
    RankingResponse,
    RatingFinalizeRequest,
    RatingFinalizeResponse,
    RatingRemoveResponse,
)
from src.services.musicbrainz_tasks import enrich_song_metadata_task
from src.services.rating import (
    finalize_rating,
    get_my_ranking_by_deezer_id,
    list_my_rankings,
    remove_rating,
    reorder_rankings,
)
from src.services.similarity_tasks import refresh_similarity_for_user_task
from src.sqlalchemy_tables.user import User

router = APIRouter(
    tags=["ratings"],
)


@router.post(
    "/ratings/finalize",
    response_model=RatingFinalizeResponse,
    status_code=201,
)
@limiter.limit("30/minute")
def finalize_rating_endpoint(
    request: Request,
    data: RatingFinalizeRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RatingFinalizeResponse:
    """Finalize a rating into the authenticated user's current rankings."""
    if data.position is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Positioned rating finalization requires a completed comparison session.",
        )

    response = finalize_rating(
        db,
        user_id=current_user.id,
        data=data,
    )
    background_tasks.add_task(
        enrich_song_metadata_task,
        response.ranking.song_id,
    )
    background_tasks.add_task(
        refresh_similarity_for_user_task,
        current_user.id,
    )
    return response


@router.delete(
    "/ratings/{song_id}",
    response_model=RatingRemoveResponse,
)
@limiter.limit("30/minute")
def remove_rating_endpoint(
    request: Request,
    song_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RatingRemoveResponse:
    """Remove the authenticated user's current rating for one song."""
    return remove_rating(
        db,
        user_id=current_user.id,
        song_id=song_id,
    )


@router.get(
    "/rankings/me",
    response_model=RankingListResponse,
)
@limiter.limit("300/minute")
def my_rankings(
    request: Request,
    limit: int = Query(
        default=20,
        ge=1,
        le=50,
    ),
    cursor: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RankingListResponse:
    """Return the authenticated user's current rankings."""
    return list_my_rankings(
        db,
        user_id=current_user.id,
        limit=limit,
        cursor=cursor,
    )


@router.get(
    "/rankings/me/by-deezer/{deezer_id}",
    response_model=RankingResponse,
)
@limiter.limit("300/minute")
def my_ranking_by_deezer_id(
    request: Request,
    deezer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RankingResponse:
    """Return the authenticated user's ranking for a Deezer song."""
    return get_my_ranking_by_deezer_id(
        db,
        user_id=current_user.id,
        deezer_id=deezer_id,
    )


@router.put(
    "/rankings/reorder",
    response_model=RankingReorderResponse,
)
@limiter.limit("30/minute")
def reorder_rankings_endpoint(
    request: Request,
    data: RankingReorderRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RankingReorderResponse:
    """Save a full-list reorder for the authenticated user's rankings."""
    return reorder_rankings(
        db,
        user_id=current_user.id,
        data=data,
    )
