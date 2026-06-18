# Pydantic schemas for Auxstrology response payloads.
from typing import Literal

from pydantic import BaseModel


class AuxstrologySign(BaseModel):
    """The headline archetype (main label)."""

    name: str
    summary: str


class AuxstrologyResponse(BaseModel):
    """
    One Auxstrology reading.

    status drives the unlock gate: "locked" (below the threshold — no sign yet)
    and "active" (full sign + caption + evidence once the user has ranked
    ACTIVE_MIN_RATED songs). required_ratings is the unlock threshold while
    locked, or null once unlocked.
    """

    status: Literal["locked", "active"]
    current_ratings: int
    required_ratings: int | None
    sign: AuxstrologySign | None
    caption: str | None
    adjectives: list[str]
    evidence: list[str]
    axes: dict[str, str]
