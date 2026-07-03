# Pydantic schemas for normalized song search responses.
from pydantic import BaseModel, Field, field_validator

from src.pydantic_schemas.song import normalize_storefront, strip_blank_to_none


class SongSearchResult(BaseModel):
    """One normalized Deezer search result returned to the frontend."""

    deezer_id: int
    isrc: str | None = None
    title: str
    artist: str
    artist_deezer_id: int
    album: str
    cover_url: str
    preview_url: str | None = None
    # Viewer's existing rating, so search rows can show a rated state instead of a Rate action.
    my_bucket: str | None = None
    my_score: float | None = None


class SongSearchResponse(BaseModel):
    """Response body for GET /search/songs."""

    results: list[SongSearchResult]


class AppleSearchAnnotationItem(BaseModel):
    """One Apple search result identity to annotate from LISTn-owned data."""

    apple_track_id: str = Field(max_length=128)
    storefront: str | None = Field(
        default="US",
        max_length=8,
    )
    # Client-supplied title/artist/album, used only to fall back to a match against a song
    # this user rated before the Deezer->Apple migration when no direct provider-ref match
    # resolves to their own rating. Optional so older clients that don't send them keep
    # working (the fallback is simply skipped). Bounded to Song.title/artist/album's column
    # widths since this is untrusted client text.
    title: str | None = Field(default=None, max_length=255)
    artist: str | None = Field(default=None, max_length=255)
    album: str | None = Field(default=None, max_length=255)

    @field_validator("apple_track_id", mode="before")
    @classmethod
    def normalize_track_id(cls, value: object) -> str:
        """Store provider IDs as stable strings regardless of numeric JSON input."""
        return str(value).strip()

    @field_validator("storefront")
    @classmethod
    def normalize_item_storefront(cls, value: str | None) -> str:
        """Default malformed or absent Apple storefronts to the launch country."""
        return normalize_storefront(value)

    @field_validator("title", "artist", "album", mode="before")
    @classmethod
    def strip_optional_match_fields(cls, value: object) -> object:
        """Trim match-fallback strings and normalize blank input to None."""
        return strip_blank_to_none(value)


class AppleSearchAnnotationRequest(BaseModel):
    """Request body for Apple search-result LISTn annotations."""

    results: list[AppleSearchAnnotationItem] = Field(max_length=50)


class AppleSearchAnnotationResult(BaseModel):
    """LISTn-owned state for one Apple search result."""

    apple_track_id: str
    storefront: str
    song_id: int | None = None
    my_bucket: str | None = None
    my_score: float | None = None
    already_rated: bool = False


class AppleSearchAnnotationResponse(BaseModel):
    """Response body for Apple search-result annotations."""

    results: list[AppleSearchAnnotationResult]
