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

    status drives the unlock ladder: "locked" (0 ratings), "first_contact"
    (1-4), "active" (5+, full sign + caption + evidence). required_ratings is
    the next threshold, or null once fully unlocked.
    """

    status: Literal["locked", "first_contact", "active"]
    current_ratings: int
    required_ratings: int | None
    sign: AuxstrologySign | None
    caption: str | None
    adjectives: list[str]
    evidence: list[str]
    axes: dict[str, str]
