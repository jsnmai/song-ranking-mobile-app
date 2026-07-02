# Pydantic schemas for durable song metadata.
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# Tunable minimum sample before responses expose a global average score.
# Currently 0 (gate disabled): early averages are shown from the first rating because the
# rating count is always displayed alongside, which keeps thin samples honest. Raise this
# value to hide low-sample averages everywhere SongResponse is used.
GLOBAL_AVG_MIN_RATINGS = 0


class SongCreate(BaseModel):
    """Provider metadata needed to persist a user-touched song."""

    id: int | None = Field(
        default=None,
        ge=1,
    )
    deezer_id: int | None = None
    isrc: str | None = Field(
        default=None,
        max_length=12,
    )
    title: str = Field(max_length=255)
    artist: str = Field(max_length=255)
    artist_deezer_id: int | None = None
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
    provider: str | None = Field(
        default=None,
        max_length=64,
    )
    apple_track_id: str | None = Field(
        default=None,
        max_length=128,
    )
    storefront: str | None = Field(
        default=None,
        max_length=8,
    )
    apple_view_url: str | None = Field(
        default=None,
        max_length=1000,
    )
    artwork_url: str | None = Field(
        default=None,
        max_length=1000,
    )
    apple_artist_id: str | None = Field(
        default=None,
        max_length=128,
    )
    apple_album_id: str | None = Field(
        default=None,
        max_length=128,
    )
    genre: str | None = Field(
        default=None,
        max_length=120,
    )
    duration_ms: int | None = Field(
        default=None,
        ge=1,
        le=60 * 60 * 1000,
    )
    release_year: int | None = Field(
        default=None,
        ge=1800,
        le=2100,
    )
    preview_available: bool | None = None

    @model_validator(mode="after")
    def require_supported_provider_identity(self) -> "SongCreate":
        """Require either legacy Deezer IDs or an Apple track ID for S1 finalization."""
        provider = self.provider or ("apple" if self.apple_track_id else "deezer_legacy")
        if provider == "apple":
            if not self.apple_track_id:
                raise ValueError("apple_track_id is required for Apple songs.")
            self.provider = "apple"
            self.storefront = normalize_storefront(self.storefront)
            if self.artwork_url and not self.cover_url:
                self.cover_url = self.artwork_url
            if self.genre and not self.genre_deezer:
                self.genre_deezer = self.genre
            return self

        if self.id is not None and self.deezer_id is None:
            self.provider = "listn"
            return self

        if self.deezer_id is None:
            raise ValueError("deezer_id is required for legacy Deezer songs.")
        self.provider = "deezer_legacy"
        return self

    @field_validator(
        "title",
        "artist",
        "album",
        "cover_url",
        "preview_url",
        "genre_deezer",
        "apple_track_id",
        "apple_view_url",
        "artwork_url",
        "apple_artist_id",
        "apple_album_id",
        "genre",
        mode="before",
    )
    @classmethod
    def strip_optional_strings(cls, value: object) -> object:
        """Trim provider strings and normalize blank optional values to None."""
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value


def normalize_storefront(value: str | None) -> str:
    """Normalize Apple storefront/country codes while keeping legacy refs global."""
    if value is None:
        return "US"
    storefront = value.strip().upper()
    if len(storefront) != 2 or not storefront.isalpha():
        return "US"
    return storefront


class PreviewUrlResponse(BaseModel):
    """Response shape for the preview URL refresh endpoint."""

    preview_url: str | None


class SavedSongPreviewUrlResponse(BaseModel):
    """Response shape for provider-neutral durable song preview lookup."""

    preview_url: str | None
    apple_view_url: str | None
    # Which provider the preview came from ("apple" / "deezer"), independent of
    # apple_view_url: Apple previews must render iTunes attribution even when
    # the store link is missing, so the client cannot infer provider from it.
    provider: str | None


class SongResponse(BaseModel):
    """Response shape for a persisted song."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    deezer_id: int | None
    isrc: str | None
    title: str
    artist: str
    artist_deezer_id: int | None
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
    provider: str | None = None
    apple_view_url: str | None = None
    preview_available: bool | None = None

    @model_validator(mode="after")
    def hide_low_sample_global_average(self) -> "SongResponse":
        """Expose counts early, but hide confident aggregate scores until the sample is meaningful."""
        if self.global_rating_count < GLOBAL_AVG_MIN_RATINGS:
            self.global_avg_score = None
        return self
