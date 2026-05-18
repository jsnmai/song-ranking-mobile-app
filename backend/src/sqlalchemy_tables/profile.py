# SQLAlchemy model for the `profiles` table.
# This is a pure table definition — no business logic lives here.
# All reads and writes go through src/crud/profile.py.
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
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
    is_public: Mapped[bool] = mapped_column(
        nullable=False,
        default=True,  # profiles are public by default
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
