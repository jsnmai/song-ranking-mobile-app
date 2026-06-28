# SQLAlchemy model for in-app notifications.
# One row per (recipient, actor, type, target). A row is reused for re-triggers: a
# fresh follow/like within the resurface cooldown is a silent no-op, and after the
# cooldown the row is bumped (created_at refreshed, read_at cleared) so it resurfaces
# as unread. This keeps history while collapsing obvious spam (see services/notification).
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base


class Notification(Base):
    """One in-app notification: someone followed the recipient, or liked their activity."""

    __tablename__ = "notifications"
    __table_args__ = (
        # Listing query: a recipient's notifications, newest first.
        Index(
            "ix_notifications_recipient_created_at_id",
            "recipient_id",
            "created_at",
            "id",
        ),
        # One follow notification per (recipient, actor) — follows have no target event.
        Index(
            "uq_notifications_follow",
            "recipient_id",
            "actor_id",
            unique=True,
            postgresql_where="type = 'follow'",
        ),
        # One like notification per (recipient, actor, liked activity).
        Index(
            "uq_notifications_like",
            "recipient_id",
            "actor_id",
            "rating_event_id",
            unique=True,
            postgresql_where="type = 'like'",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # Who receives the notification (the followed user / the activity's author).
    recipient_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Who caused it (the follower / the liker).
    actor_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # "follow" | "like".
    type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )
    # The liked activity card for "like" notifications; NULL for "follow".
    rating_event_id: Mapped[int | None] = mapped_column(
        ForeignKey("rating_events.id", ondelete="CASCADE"),
        nullable=True,
    )
    # Refreshed when a row resurfaces, so ordering reflects the latest interaction.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    # NULL = unread. Set when the recipient opens their notifications.
    read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
