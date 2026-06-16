# SQLAlchemy model for the `auxstrology_snapshots` table.
# Append-only read model for Auxstrology charts (see AUXSTROLOGY.md §13).
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base


class AuxstrologySnapshot(Base):
    """
    One computed Auxstrology reading for one user.

    Rows are appended, never updated — history is the point: Transit, retrograde,
    and "your chart over time" all read past rows. The latest row per
    (user_id, algorithm_version) is the serving read model; it is fresh while no
    newer rating event exists for the user.
    """

    __tablename__ = "auxstrology_snapshots"
    __table_args__ = (
        Index(
            "ix_auxstrology_snapshots_user_version_computed",
            "user_id",
            "algorithm_version",
            "computed_at",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    algorithm_version: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )
    # "locked" | "first_contact" | "active" — plain string, no ENUM, so new
    # ladder stages need no ALTER TYPE migration (same trick as songs.enrichment_status).
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )
    sign_key: Mapped[str | None] = mapped_column(
        String(60),
        nullable=True,
    )
    # Full serialized AuxstrologyResponse. Reads parse this directly — O(1), no joins.
    payload: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
    )
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
