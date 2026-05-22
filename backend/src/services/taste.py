"""Business logic for taste profile computation."""
from collections import Counter

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from src.crud.profile import get_by_username
from src.crud.taste import TasteRow, get_taste_rows
from src.pydantic_schemas.profile import (
    TasteArtistItem,
    TasteBucketBreakdown,
    TasteBucketSection,
    TasteByBucket,
    TasteGenreItem,
    TasteProfileResponse,
    TasteSection,
)

_TOP_ARTIST_LIMIT = 5


def get_my_taste_profile(
    db: Session,
    user_id: int,
) -> TasteProfileResponse:
    """Return the taste profile for the authenticated user."""
    rows = get_taste_rows(db, user_id)
    return _build_taste_profile(rows)


def get_user_taste_profile_by_username(
    db: Session,
    current_user_id: int,
    username: str,
) -> TasteProfileResponse:
    """
    Return the taste profile for a public profile by username.

    Returns 404 for private profiles — taste data is not anonymised, so
    visibility follows the same rule as profile and feed access.
    """
    profile = get_by_username(db, username)
    if not profile or (
        not profile.is_public
        and profile.user_id != current_user_id
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found.",
        )
    rows = get_taste_rows(db, profile.user_id)
    return _build_taste_profile(rows)


def _build_taste_profile(rows: list[TasteRow]) -> TasteProfileResponse:
    """Compute the full taste profile from ranked song rows."""
    total = len(rows)
    avg_score = round(sum(r.score for r in rows) / total, 2) if total > 0 else None

    like_rows = [r for r in rows if r.bucket == "like"]
    alright_rows = [r for r in rows if r.bucket == "alright"]
    dislike_rows = [r for r in rows if r.bucket == "dislike"]

    return TasteProfileResponse(
        total_rated=total,
        avg_score=avg_score,
        bucket_breakdown=TasteBucketBreakdown(
            like=len(like_rows),
            okay=len(alright_rows),
            dislike=len(dislike_rows),
        ),
        overall=_build_section(rows, total),
        by_bucket=TasteByBucket(
            like=_build_bucket_section(like_rows),
            okay=_build_bucket_section(alright_rows),
            dislike=_build_bucket_section(dislike_rows),
        ),
    )


def _build_section(
    rows: list[TasteRow],
    total_rated: int,
) -> TasteSection:
    """Build genre and artist breakdown for a set of rows."""
    genres = [_resolve_genre(r.genres_mb, r.genre_deezer) for r in rows]
    return TasteSection(
        genres=_compute_genres(genres, total_rated),
        top_artists=_compute_top_artists([r.artist for r in rows]),
    )


def _build_bucket_section(rows: list[TasteRow]) -> TasteBucketSection:
    """Build a bucket-specific section with avg_score and count."""
    count = len(rows)
    avg_score = round(sum(r.score for r in rows) / count, 2) if count > 0 else None
    genres = [_resolve_genre(r.genres_mb, r.genre_deezer) for r in rows]
    return TasteBucketSection(
        avg_score=avg_score,
        count=count,
        genres=_compute_genres(genres, count),
        top_artists=_compute_top_artists([r.artist for r in rows]),
    )


def _resolve_genre(
    genres_mb: list[str] | None,
    genre_deezer: str | None,
) -> str:
    """Prefer MusicBrainz genre, fall back to Deezer genre, then Unknown."""
    if genres_mb:
        return genres_mb[0]
    if genre_deezer:
        return genre_deezer
    return "Unknown"


def _compute_genres(
    genres: list[str],
    total: int,
) -> list[TasteGenreItem]:
    """
    Build genre items sorted by count desc, Unknown forced to bottom.

    Percentages are relative to `total` so they sum to 100% within the
    section's scope (overall uses total_rated; bucket uses bucket count).
    """
    if not genres or total == 0:
        return []
    counts = Counter(genres)
    unknown_count = counts.pop("Unknown", 0)
    items = [
        TasteGenreItem(
            name=name,
            count=count,
            percentage=round(count / total * 100, 1),
        )
        for name, count in sorted(
            counts.items(),
            key=lambda x: x[1],
            reverse=True,
        )
    ]
    if unknown_count > 0:
        items.append(
            TasteGenreItem(
                name="Unknown",
                count=unknown_count,
                percentage=round(unknown_count / total * 100, 1),
            )
        )
    return items


def _compute_top_artists(artists: list[str]) -> list[TasteArtistItem]:
    """Return the top artists by song count, capped at _TOP_ARTIST_LIMIT."""
    if not artists:
        return []
    return [
        TasteArtistItem(name=name, count=count)
        for name, count in Counter(artists).most_common(_TOP_ARTIST_LIMIT)
    ]
