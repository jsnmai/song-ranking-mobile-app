"""Schemas for the global Discover New Release card.

Global and viewer-independent like Popular on LISTn: one fresh drop featured per day,
rotating through the current weekly batch. The featured entry is a durable LISTn song
(one representative track from the release) so the card plugs into the standard Song
Detail / rating / preview pipeline.
"""
from datetime import date

from pydantic import BaseModel

from src.pydantic_schemas.song import SongResponse


class NewReleaseItem(BaseModel):
    """One featured fresh release, carried by its representative song."""

    song: SongResponse
    released_at: date


class NewReleaseResponse(BaseModel):
    """The New Release module: today's pick, or empty before the first batch lands."""

    items: list[NewReleaseItem]
