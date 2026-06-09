from fastapi import HTTPException
from sqlalchemy.orm import Session

from src.crud import profile as crud_profile
from src.crud import profile_modules as crud
from src.pydantic_schemas.profile_modules import RecentVerdictItem, RecentVerdictsResponse
from src.pydantic_schemas.rating import RankingListResponse, RankingResponse
from src.pydantic_schemas.song import SongResponse

RANKING_PAGE_LIMIT = 30
MAX_RANKING_PAGE_LIMIT = 100


def get_my_recent_verdicts(
    db: Session,
    user_id: int,
) -> RecentVerdictsResponse:
    rows = crud.list_profile_recent_verdicts(db, viewer_id=user_id, owner_id=user_id)
    return _verdicts_response(rows)


def get_profile_recent_verdicts(
    db: Session,
    viewer_id: int,
    username: str,
) -> RecentVerdictsResponse:
    profile = crud_profile.get_by_username(db, username)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found.")
    rows = crud.list_profile_recent_verdicts(db, viewer_id=viewer_id, owner_id=profile.user_id)
    return _verdicts_response(rows)


def get_profile_rankings_by_username(
    db: Session,
    viewer_id: int,
    username: str,
    limit: int = RANKING_PAGE_LIMIT,
    cursor: str | None = None,
) -> RankingListResponse:
    profile = crud_profile.get_by_username(db, username)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found.")
    safe_limit = min(limit, MAX_RANKING_PAGE_LIMIT)
    cursor_score, cursor_id = _parse_cursor(cursor)
    rows = crud.list_profile_rankings(
        db,
        viewer_id=viewer_id,
        owner_id=profile.user_id,
        limit=safe_limit + 1,
        cursor_score=cursor_score,
        cursor_id=cursor_id,
    )
    has_next = len(rows) > safe_limit
    page = rows[:safe_limit]
    next_cursor: str | None = None
    if has_next and page:
        last = page[-1]
        next_cursor = f"{last.ranking.score}:{last.ranking.id}"
    return RankingListResponse(
        rankings=[
            RankingResponse(
                id=row.ranking.id,
                song_id=row.ranking.song_id,
                bucket=row.ranking.bucket,
                position=row.ranking.position,
                score=row.ranking.score,
                created_at=row.ranking.created_at,
                updated_at=row.ranking.updated_at,
                song=SongResponse.model_validate(row.song),
            )
            for row in page
        ],
        next_cursor=next_cursor,
    )


def _verdicts_response(rows) -> RecentVerdictsResponse:
    return RecentVerdictsResponse(
        items=[
            RecentVerdictItem(
                rating_event_id=row.event.id,
                song=SongResponse.model_validate(row.song),
                bucket=row.event.new_bucket,
                score=row.event.new_score,
                note=row.event.note,
                created_at=row.event.created_at,
            )
            for row in rows
        ]
    )


def _parse_cursor(cursor: str | None) -> tuple[float | None, int | None]:
    if cursor is None:
        return None, None
    parts = cursor.split(":")
    if len(parts) != 2:
        raise HTTPException(status_code=400, detail="Invalid cursor.")
    try:
        return float(parts[0]), int(parts[1])
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid cursor.")
