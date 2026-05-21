"""SQLAlchemy model for append-only head-to-head comparisons."""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base


class Comparison(Base):
    """
    Permanent pairwise preference history.

    Rows are written only when a comparison session finalizes. Canceled sessions
    do not create comparison rows.
    """

    __tablename__ = "comparisons"
    __table_args__ = (
        Index(
            "ix_comparisons_user_created_at",
            "user_id",
            "created_at",
        ),
        Index(
            "ix_comparisons_session_uuid",
            "session_uuid",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    session_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
    )
    song_a_id: Mapped[int] = mapped_column(
        ForeignKey("songs.id"),
        nullable=False,
    )
    song_b_id: Mapped[int] = mapped_column(
        ForeignKey("songs.id"),
        nullable=False,
    )
    winner_id: Mapped[int] = mapped_column(
        ForeignKey("songs.id"),
        nullable=False,
    )
    decision_duration_ms: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    finalized_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
