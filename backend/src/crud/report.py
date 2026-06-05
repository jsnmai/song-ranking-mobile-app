# Database access layer for private safety reports.
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.profile import Profile
from src.sqlalchemy_tables.rating_event import RatingEvent
from src.sqlalchemy_tables.report import Report


@dataclass(frozen=True)
class RatingEventReportRow:
    """A rating event paired with the owner's profile for access checks."""

    event: RatingEvent
    owner_profile: Profile


def create_report(
    db: Session,
    reporter_user_id: int,
    reported_user_id: int,
    target_type: str,
    target_id: int | None,
    reason: str,
    details: str | None,
) -> Report:
    """Stage a private safety report for manual review."""
    report = Report(
        reporter_user_id=reporter_user_id,
        reported_user_id=reported_user_id,
        target_type=target_type,
        target_id=target_id,
        reason=reason,
        details=details,
    )
    db.add(report)
    db.flush()
    return report


def get_rating_event_for_report(
    db: Session,
    rating_event_id: int,
) -> RatingEventReportRow | None:
    """Return a rating event and owner profile for report access checks."""
    row = db.execute(
        select(
            RatingEvent,
            Profile,
        )
        .join(Profile, Profile.user_id == RatingEvent.user_id)
        .where(RatingEvent.id == rating_event_id)
    ).one_or_none()
    if row is None:
        return None
    return RatingEventReportRow(
        event=row[0],
        owner_profile=row[1],
    )
