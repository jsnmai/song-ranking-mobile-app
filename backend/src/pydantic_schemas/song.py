# Pydantic schemas for durable song metadata.
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

GLOBAL_AVG_MIN_RATINGS = 20


class SongCreate(BaseModel):
    """Provider metadata needed to persist a user-touched song."""

    deezer_id: int
    isrc: str | None = Field(
        default=None,
        max_length=12,
    )
    title: str = Field(max_length=255)
    artist: str = Field(max_length=255)
    artist_deezer_id: int
    album: str = Field(max_length=255)
    cover_url: str = Field(max_length=1000)
    preview_url: str | None = Field(
        default=None,
        max_length=1000,
    )
    genre_deezer: str | None = Field(
        default=None,
        max_length=120,
    )


class PreviewUrlResponse(BaseModel):
    """Response shape for the preview URL refresh endpoint."""

    preview_url: str | None


class SongResponse(BaseModel):
    """Response shape for a persisted song."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    deezer_id: int
    isrc: str | None
    title: str
    artist: str
    artist_deezer_id: int
    album: str
    cover_url: str
    preview_url: str | None
    genre_deezer: str | None
    musicbrainz_id: str | None
    genres_mb: list[str] | None
    release_year: int | None
    spotify_energy: float | None
    spotify_valence: float | None
    spotify_tempo: float | None
    spotify_danceability: float | None
    metadata_enriched_at: datetime | None
    spotify_enriched_at: datetime | None
    global_avg_score: float | None
    global_rating_count: int
    created_at: datetime

    @model_validator(mode="after")
    def hide_low_sample_global_average(self) -> "SongResponse":
        """Expose counts early, but hide confident aggregate scores until the sample is meaningful."""
        if self.global_rating_count < GLOBAL_AVG_MIN_RATINGS:
            self.global_avg_score = None
        return self
