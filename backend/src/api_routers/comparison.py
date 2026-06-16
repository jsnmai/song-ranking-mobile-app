"""HTTP layer for comparison-session endpoints."""
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from sqlalchemy.orm import Session

from src.core.dependencies import get_current_user, get_db
from src.core.limiter import limiter
from src.pydantic_schemas.comparison import (
    ComparisonChoiceRequest,
    ComparisonSessionCancelResponse,
    ComparisonSessionFinalizeResponse,
    ComparisonSessionResponse,
    ComparisonSessionStartRequest,
    ComparisonUndoRequest,
)
from src.services.comparison import (
    cancel_comparison_session,
    finalize_comparison_session,
    record_comparison_choice,
    start_comparison_session,
    undo_comparison_choice,
)
from src.services.musicbrainz_tasks import enrich_song_metadata_task
from src.services.similarity_tasks import refresh_similarity_for_user_task
from src.sqlalchemy_tables.user import User

router = APIRouter(
    prefix="/comparison-sessions",
    tags=["comparison-sessions"],
)


@router.post(
    "",
    response_model=ComparisonSessionResponse,
    status_code=201,
)
@limiter.limit("30/minute")
def start_session(
    request: Request,
    data: ComparisonSessionStartRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ComparisonSessionResponse:
    """Start one binary-insertion comparison session."""
    return start_comparison_session(
        db,
        user_id=current_user.id,
        data=data,
    )


@router.post(
    "/{session_uuid}/choices",
    response_model=ComparisonSessionResponse,
)
@limiter.limit("120/minute")
def choose_winner(
    request: Request,
    session_uuid: UUID,
    data: ComparisonChoiceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ComparisonSessionResponse:
    """Record one comparison choice and return the next comparison state."""
    return record_comparison_choice(
        db,
        user_id=current_user.id,
        session_uuid=session_uuid,
        data=data,
    )


@router.post(
    "/{session_uuid}/undo",
    response_model=ComparisonSessionResponse,
)
@limiter.limit("120/minute")
def undo_choice(
    request: Request,
    session_uuid: UUID,
    data: ComparisonUndoRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ComparisonSessionResponse:
    """Undo the latest comparison choice in an active session and return prior state."""
    return undo_comparison_choice(
        db,
        user_id=current_user.id,
        session_uuid=session_uuid,
        expected_comparison_count=data.expected_comparison_count,
    )


@router.post(
    "/{session_uuid}/finalize",
    response_model=ComparisonSessionFinalizeResponse,
)
@limiter.limit("30/minute")
def finalize_session(
    request: Request,
    session_uuid: UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ComparisonSessionFinalizeResponse:
    """Finalize a completed comparison session."""
    response = finalize_comparison_session(
        db,
        user_id=current_user.id,
        session_uuid=session_uuid,
    )
    background_tasks.add_task(
        enrich_song_metadata_task,
        response.result.ranking.song_id,
    )
    background_tasks.add_task(
        refresh_similarity_for_user_task,
        current_user.id,
    )
    return response


@router.delete(
    "/{session_uuid}",
    response_model=ComparisonSessionCancelResponse,
)
@limiter.limit("60/minute")
def cancel_session(
    request: Request,
    session_uuid: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ComparisonSessionCancelResponse:
    """Cancel a comparison session and delete temporary state."""
    return cancel_comparison_session(
        db,
        user_id=current_user.id,
        session_uuid=session_uuid,
    )
