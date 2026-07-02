# HTTP layer for the social feed.
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from src.core.dependencies import get_current_user, get_db
from src.core.limiter import limiter
from src.pydantic_schemas.feed import (
    CircleRatersResponse,
    FeedListResponse,
    FeedModulesResponse,
    ThisOrThatChoiceRequest,
    ThisOrThatChoiceResponse,
    ThisOrThatDismissRequest,
    ThisOrThatDismissResponse,
    ThisOrThatUndoRequest,
    ThisOrThatUndoResponse,
)
from src.services.feed import (
    choose_this_or_that,
    dismiss_this_or_that,
    get_feed_modules,
    list_my_feed,
    list_song_circle_raters,
    undo_this_or_that,
)
from src.sqlalchemy_tables.user import User

router = APIRouter(
    prefix="/feed",
    tags=["feed"],
)


@router.get(
    "",
    response_model=FeedListResponse,
)
@limiter.limit("300/minute")
def my_feed(
    request: Request,
    limit: int = Query(
        default=20,
        ge=1,
        le=50,
    ),
    cursor: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FeedListResponse:
    """Return rating activity from users the authenticated user follows."""
    return list_my_feed(
        db,
        user_id=current_user.id,
        limit=limit,
        cursor=cursor,
    )


@router.get(
    "/modules",
    response_model=FeedModulesResponse,
)
@limiter.limit("300/minute")
def feed_modules(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FeedModulesResponse:
    """Bundled Feed module aggregates behind the shared privacy layer (only Re-rate Radar is live)."""
    return get_feed_modules(
        db,
        user_id=current_user.id,
    )


@router.post(
    "/this-or-that/choice",
    response_model=ThisOrThatChoiceResponse,
)
@limiter.limit("60/minute")
def this_or_that_choice(
    request: Request,
    data: ThisOrThatChoiceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ThisOrThatChoiceResponse:
    """Record one inline personal ranking-refinement choice."""
    return choose_this_or_that(
        db,
        user_id=current_user.id,
        data=data,
    )


@router.post(
    "/this-or-that/undo",
    response_model=ThisOrThatUndoResponse,
)
@limiter.limit("60/minute")
def this_or_that_undo(
    request: Request,
    data: ThisOrThatUndoRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ThisOrThatUndoResponse:
    """Undo a still-recent This-or-That choice from the Feed result popup."""
    return undo_this_or_that(
        db,
        user_id=current_user.id,
        data=data,
    )


@router.post(
    "/this-or-that/dismiss",
    response_model=ThisOrThatDismissResponse,
)
@limiter.limit("60/minute")
def this_or_that_dismiss(
    request: Request,
    data: ThisOrThatDismissRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ThisOrThatDismissResponse:
    """Dismiss the current personal ranking-refinement prompt."""
    return dismiss_this_or_that(
        db,
        user_id=current_user.id,
        data=data,
    )


@router.get(
    "/songs/{song_id}/circle-raters",
    response_model=CircleRatersResponse,
)
@limiter.limit("120/minute")
def song_circle_raters(
    request: Request,
    song_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CircleRatersResponse:
    """Circle members who currently rate this song — Recent Verdict hero social proof."""
    return list_song_circle_raters(
        db,
        viewer_id=current_user.id,
        song_id=song_id,
    )
