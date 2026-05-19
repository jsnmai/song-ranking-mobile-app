"""HTTP layer for comparison-session endpoints."""
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.core.dependencies import get_current_user, get_db
from src.pydantic_schemas.comparison import (
    ComparisonChoiceRequest,
    ComparisonSessionCancelResponse,
    ComparisonSessionFinalizeResponse,
    ComparisonSessionResponse,
    ComparisonSessionStartRequest,
)
from src.services.comparison import (
    cancel_comparison_session,
    finalize_comparison_session,
    record_comparison_choice,
    start_comparison_session,
)
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
def start_session(
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
def choose_winner(
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
    "/{session_uuid}/finalize",
    response_model=ComparisonSessionFinalizeResponse,
)
def finalize_session(
    session_uuid: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ComparisonSessionFinalizeResponse:
    """Finalize a completed comparison session."""
    return finalize_comparison_session(
        db,
        user_id=current_user.id,
        session_uuid=session_uuid,
    )


@router.delete(
    "/{session_uuid}",
    response_model=ComparisonSessionCancelResponse,
)
def cancel_session(
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
