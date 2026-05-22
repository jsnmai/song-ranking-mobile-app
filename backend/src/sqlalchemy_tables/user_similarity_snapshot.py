# SQLAlchemy model for the `user_similarity_snapshots` table.
# Snapshots are written by background tasks, not computed live on profile view.
# user_a_id < user_b_id is enforced so each pair has exactly one canonical row.
from datetime import datetime

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base


class UserSimilaritySnapshot(Base):
    """
    Persisted compatibility score between two users.

    Computed for all user pairs with >= 5 shared rated songs, regardless of
    follow relationship. Visibility for display is gated at read time by
    follow status and is_public; the snapshot itself is unrestricted so
    Phase 13 recommendations can query it.
    """

    __tablename__ = "user_similarity_snapshots"
    __table_args__ = (
        UniqueConstraint(
            "user_a_id",
            "user_b_id",
            "algorithm_version",
            name="uq_user_similarity_user_a_b_algo",
        ),
        CheckConstraint(
            "user_a_id < user_b_id",
            name="ck_user_similarity_a_lt_b",
        ),
        Index("ix_user_similarity_user_a", "user_a_id"),
        Index("ix_user_similarity_user_b", "user_b_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_a_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
    )
    user_b_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
    )
    # Cosine similarity on shared rated songs, normalised to [0.0, 1.0].
    similarity_score: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )
    shared_song_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    # Average absolute score difference across shared songs. Null only when
    # no shared songs exist (which cannot happen given the >= 5 gate).
    score_distance_avg: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )
    # Top genres and artists from shared song metadata, stored as structured
    # data so each display surface (profile card, Wrapped, Taste Tribes) can
    # format them differently. Never pre-format as a string here.
    shared_genres: Mapped[list] = mapped_column(
        JSON,
        nullable=False,
        default=list,
    )
    shared_top_artists: Mapped[list] = mapped_column(
        JSON,
        nullable=False,
        default=list,
    )
    # Plain string — not a PostgreSQL ENUM — so future algorithm versions need
    # no ALTER TYPE migration.
    algorithm_version: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        server_default="v1_cosine",
    )
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
