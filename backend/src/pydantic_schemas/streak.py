"""Pydantic schemas for streak responses."""
from pydantic import BaseModel


class StreakState(BaseModel):
    """A user's weekly-rating streak as shown on a profile.

    ``current_streak`` is the effective (read-time decayed) value: it drops to 0
    once a full personal week passes with no rating, without any write.
    ``longest_streak`` is the best run the user has ever reached.
    """

    current_streak: int = 0
    longest_streak: int = 0
