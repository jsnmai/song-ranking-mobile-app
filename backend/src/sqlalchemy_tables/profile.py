# SQLAlchemy model for the `profiles` table.
# This is a pure table definition — no business logic lives here.
# All reads and writes go through src/crud/profile.py.
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base


class Profile(Base):
    """
    One profile per user — linked by user_id foreign key.

    username is stored lowercase and must be unique — enforced at both the
    Pydantic (input validation) and database (unique constraint) levels.
    display_name allows any characters — it is stripped of leading/trailing
    whitespace in the service layer before being stored.
    """

    __tablename__ = "profiles"
    __table_args__ = (
        Index(
            "ix_profiles_user_public",
            "user_id",
            "is_public",
        ),
        Index(
            "ix_profiles_user_visibility",
            "user_id",
            "visibility",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        unique=True,  # one profile per user
        nullable=False,
    )
    username: Mapped[str] = mapped_column(
        String(20),
        unique=True,
        nullable=False,
    )
    display_name: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )
    avatar_color: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,  # null = client falls back to the deterministic palette color
    )
    # IANA timezone (e.g. "America/Los_Angeles"), captured silently from the client.
    # Used to interpret event timestamps in the user's local clock (auxstrology
    # nocturnality/active-days). Null = fall back to UTC interpretation.
    timezone: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )
    is_public: Mapped[bool] = mapped_column(
        nullable=False,
        default=True,  # profiles are public by default
    )
    visibility: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="public",
        server_default="public",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
