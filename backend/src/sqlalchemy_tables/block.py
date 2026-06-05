# SQLAlchemy model for the `blocks` table.
# Blocking is access-control state, so reads go through the access service.
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base


class Block(Base):
    """A directed block relationship: blocker_id blocks blocked_id."""

    __tablename__ = "blocks"
    __table_args__ = (
        UniqueConstraint(
            "blocker_id",
            "blocked_id",
            name="uq_blocks_blocker_blocked",
        ),
        CheckConstraint(
            "blocker_id <> blocked_id",
            name="ck_blocks_no_self_block",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    blocker_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    blocked_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
