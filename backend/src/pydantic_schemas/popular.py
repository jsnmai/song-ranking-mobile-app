"""Schemas for the global "Popular on LISTn" discovery module.

Unlike the circle aggregates, this surface is platform-wide and anonymous: it counts
every user's rating, applies no visibility predicate, and exposes no per-contributor
chips or viewer rating. The result is identical for every viewer.

The module adapts to a young/sparse catalog. `window` tells the client which signal the
items actually represent so the UI can label honestly:
  - "week": items ranked by distinct users who rated them in the last `window_days`.
  - "all_time": the week was too thin, so items are the all-time most-rated songs instead.
"""
from typing import Literal

from pydantic import BaseModel

from src.pydantic_schemas.song import SongResponse


class PopularItem(BaseModel):
    """One song on the Popular module, with the rating count for its active window."""

    song: SongResponse
    # Distinct raters in the window for "week"; all-time global rating count for "all_time".
    rating_count: int


class PopularResponse(BaseModel):
    """The global Popular-on-LISTn module for any viewer."""

    items: list[PopularItem]
    window: Literal["week", "all_time"]
    window_days: int
