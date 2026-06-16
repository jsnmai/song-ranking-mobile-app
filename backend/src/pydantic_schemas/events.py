# Pydantic schemas for client-reported interaction events.
from typing import Literal

from pydantic import BaseModel, Field

# Vocabulary shared with rating discovery_source and bookmarks.source.
DiscoverySource = Literal["search", "discover", "cosign", "profile", "bookmark", "feed"]


class InteractionEventCreate(BaseModel):
    """
    Request body for POST /events.

    Only whitelisted client event types are accepted (see services/events.py);
    server-written types like comparison tombstones cannot be spoofed through
    this endpoint. Context is capped to small scalar payloads by the collection
    charter (AUXSTROLOGY.md §18a) — durations and counts, not free text.
    """

    event_type: Literal["preview_started", "preview_completed"]
    deezer_id: int | None = None
    source: DiscoverySource | None = None
    listened_ms: int | None = Field(
        default=None,
        ge=0,
        le=120_000,
    )


class InteractionEventResponse(BaseModel):
    """Acknowledgement for one recorded interaction event."""

    recorded: bool
