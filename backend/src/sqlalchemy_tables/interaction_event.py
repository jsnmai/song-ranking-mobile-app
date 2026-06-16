# SQLAlchemy model for the `interaction_events` table.
# Append-only spine for explicit non-rating user actions (AUXSTROLOGY.md §19).
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base


class InteractionEvent(Base):
    """
    One explicit user action that is not a rating.

    Collection charter (AUXSTROLOGY.md §18a): explicit in-app actions only;
    payloads are ids, enums, timestamps, and durations — never free text the
    user didn't write, never device/sensor data. `event_type` is a plain string
    (no ENUM) so new types need no migration. Consumers: auxstrology axes,
    Wrapped, Transit, recommendations.
    """

    __tablename__ = "interaction_events"
    __table_args__ = (
        Index(
            "ix_interaction_events_user_created_at",
            "user_id",
            "created_at",
        ),
        Index(
            "ix_interaction_events_user_type_created_at",
            "user_id",
            "event_type",
            "created_at",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # e.g. "preview_started" | "preview_completed" | "comparison_canceled" |
    # "comparison_abandoned" — server-written types and the client whitelist
    # both live in src/services/events.py.
    event_type: Mapped[str] = mapped_column(
        String(40),
        nullable=False,
    )
    song_id: Mapped[int | None] = mapped_column(
        ForeignKey("songs.id"),
        nullable=True,
    )
    # Co-sign source, profile-viewed-from, etc. (unused in v1, reserved by spec).
    subject_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Same vocabulary as rating discovery_source: search|discover|cosign|profile|bookmark|feed.
    source: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )
    context: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB,
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
