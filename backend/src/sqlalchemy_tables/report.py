# SQLAlchemy model for private safety reports.
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base


class Report(Base):
    """
    Private safety record for user/profile reports.

    Reports are not user-facing content. User references are nullable so account
    deletion can remove identity while preserving the safety/audit record.
    """

    __tablename__ = "reports"
    __table_args__ = (
        CheckConstraint(
            "target_type IN ('user', 'profile', 'rating_event', 'rating_note')",
            name="ck_reports_target_type",
        ),
        CheckConstraint(
            "reason IN ("
            "'harassment', "
            "'hate_or_abuse', "
            "'impersonation', "
            "'inappropriate_content', "
            "'spam', "
            "'under_13', "
            "'other'"
            ")",
            name="ck_reports_reason",
        ),
        CheckConstraint(
            "status IN ('open', 'reviewed', 'actioned', 'dismissed')",
            name="ck_reports_status",
        ),
        Index(
            "ix_reports_status_created_at",
            "status",
            "created_at",
        ),
        Index(
            "ix_reports_reported_user_created_at",
            "reported_user_id",
            "created_at",
        ),
        Index(
            "ix_reports_target_type_target_id",
            "target_type",
            "target_id",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    reporter_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    reported_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    target_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )
    target_id: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )
    reason: Mapped[str] = mapped_column(
        String(40),
        nullable=False,
    )
    details: Mapped[str | None] = mapped_column(
        String(1000),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="open",
        server_default="open",
    )
    resolution: Mapped[str | None] = mapped_column(
        String(1000),
        nullable=True,
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    reviewed_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
