"""SQLAlchemy model for active comparison sessions."""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base


class ComparisonSession(Base):
    """
    Temporary binary-insertion state for one song in one bucket.

    Cancel and finalize both delete this row. Durable history is stored in
    `comparisons` only after the session finalizes.
    """

    __tablename__ = "comparison_sessions"
    __table_args__ = (
        Index(
            "ix_comparison_sessions_user_created_at",
            "user_id",
            "created_at",
        ),
        Index(
            "ix_comparison_sessions_updated_at",
            "updated_at",
        ),
    )

    session_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
    )
    song_payload: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
    )
    bucket: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )
    note: Mapped[str | None] = mapped_column(
        String(280),
        nullable=True,
    )
    low_index: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    high_index: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    candidate_index: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )
    candidate_song_id: Mapped[int | None] = mapped_column(
        ForeignKey("songs.id"),
        nullable=True,
    )
    final_position: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )
    decisions: Mapped[list[dict]] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
