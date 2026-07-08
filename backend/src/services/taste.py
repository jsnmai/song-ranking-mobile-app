"""Business logic for taste profile computation."""
from collections import Counter

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from src.crud.profile import get_by_username
from src.crud.taste import TasteRow, get_population_like_shares, get_taste_rows
from src.pydantic_schemas.profile import (
    TasteArtistItem,
    TasteBucketBreakdown,
    TasteBucketSection,
    TasteByBucket,
    TasteGenreItem,
    TasteHarshness,
    TasteProfileResponse,
    TasteSection,
)
from src.services.access import can_view_profile, can_view_taste

_TOP_ARTIST_LIMIT = 5

# Harshness needs enough of the user's own ratings to be stable and enough peers
# to rank against before it means anything; until then the tile reads "forming".
_MIN_RATINGS_FOR_HARSHNESS = 10
_MIN_POPULATION_FOR_HARSHNESS = 10


def get_my_taste_profile(
    db: Session,
    user_id: int,
) -> TasteProfileResponse:
    """Return the taste profile for the authenticated user."""
    rows = get_taste_rows(db, user_id)
    harshness = _compute_harshness(db, user_id, rows)
    return _build_taste_profile(rows, harshness)


def get_user_taste_profile_by_username(
    db: Session,
    current_user_id: int,
    username: str,
) -> TasteProfileResponse:
    """
    Return the taste profile for a visible profile by username.

    Returns 404 for missing, blocked, or taste-hidden profiles — taste data
    is not anonymised, so it follows the central visibility rule.
    """
    profile = get_by_username(db, username)
    if (
        not profile
        or not can_view_profile(
            db,
            current_user_id,
            profile.user_id,
        )
        or not can_view_taste(
            db,
            current_user_id,
            profile,
        )
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found.",
        )
    rows = get_taste_rows(db, profile.user_id)
    harshness = _compute_harshness(db, profile.user_id, rows)
    return _build_taste_profile(rows, harshness)


def _compute_harshness(
    db: Session,
    user_id: int,
    rows: list[TasteRow],
) -> TasteHarshness:
    """Percentile-rank how harsh the user is against the rest of the population.

    Harshness = a low share of "like" ratings. We compare the user's like-share
    with everyone else's and report the fraction of raters they are harsher than.
    Stays "forming" until the user and the population both have enough ratings.
    """
    total = len(rows)
    if total < _MIN_RATINGS_FOR_HARSHNESS:
        return TasteHarshness(status="forming", percentile=None)
    population = get_population_like_shares(
        db,
        _MIN_RATINGS_FOR_HARSHNESS,
        exclude_user_id=user_id,
    )
    if len(population) < _MIN_POPULATION_FOR_HARSHNESS:
        return TasteHarshness(status="forming", percentile=None)
    like_share = sum(1 for r in rows if r.bucket == "like") / total
    # Harsher = fewer likes, so the percentile is the share of raters who are
    # more generous (a higher like-share) than this user.
    harsher_than = sum(1 for share in population if share > like_share)
    return TasteHarshness(
        status="ready",
        percentile=round(harsher_than / len(population) * 100),
    )


def _build_taste_profile(
    rows: list[TasteRow],
    harshness: TasteHarshness,
) -> TasteProfileResponse:
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
        harshness=harshness,
    )


def _build_section(
    rows: list[TasteRow],
    total_rated: int,
) -> TasteSection:
    """Build genre and artist breakdown for a set of rows."""
    genres = [_resolve_genre(r.genres_mb, r.genre_deezer) for r in rows]
    return TasteSection(
        genres=_compute_genres(genres, total_rated),
        top_artists=_compute_top_artists(rows),
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
        top_artists=_compute_top_artists(rows),
    )


def _resolve_genre(
    genres_mb: list[str] | None,
    genre_deezer: str | None,
) -> str:
    """Prefer the first MusicBrainz tag, fall back to Deezer, then Unknown.

    Mirrors the Rank Map's songGenre() (frontend/.../rankmap/layouts.ts) exactly — same
    MusicBrainz-first priority, same first-letter capitalization — so a song lands in the
    same genre label on the Taste Profile's Top Genres and on the Rank Map.
    """
    if genres_mb:
        for tag in genres_mb:
            if tag and tag.strip():
                return _format_genre(tag)
    if genre_deezer and genre_deezer.strip():
        return _format_genre(genre_deezer)
    return "Unknown"


def _format_genre(name: str) -> str:
    """Capitalize the first letter so lowercase MusicBrainz tags (e.g. "trap") read
    consistently with Title-Case Deezer genres and match the Rank Map's titleCase()."""
    trimmed = name.strip()
    return trimmed[:1].upper() + trimmed[1:]


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


def _compute_top_artists(rows: list[TasteRow]) -> list[TasteArtistItem]:
    """Return the top artists by song count, capped at _TOP_ARTIST_LIMIT.

    Each artist carries a representative cover_url — the art from the user's
    highest-scored song by that artist that has art — so clients can render an
    artist disc without a dedicated artist-image source.
    """
    if not rows:
        return []
    counts: Counter[str] = Counter()
    best_cover: dict[str, tuple[float, str]] = {}
    best_score: dict[str, float] = {}
    total_score: dict[str, float] = {}
    for row in rows:
        artist_names = row.artist_credits if row.artist_credits else [row.artist]
        for artist_name in dict.fromkeys(artist_names):
            counts[artist_name] += 1
            best_score[artist_name] = max(best_score.get(artist_name, row.score), row.score)
            total_score[artist_name] = total_score.get(artist_name, 0.0) + row.score
            if not row.cover_url:
                continue
            current = best_cover.get(artist_name)
            if current is None or row.score > current[0]:
                best_cover[artist_name] = (row.score, row.cover_url)
    sorted_artists = sorted(
        counts.items(),
        key=lambda item: (
            -item[1],
            -(total_score[item[0]] / item[1]),
            -best_score[item[0]],
            item[0].casefold(),
        ),
    )
    return [
        TasteArtistItem(
            name=name,
            count=count,
            cover_url=best_cover[name][1] if name in best_cover else None,
        )
        for name, count in sorted_artists[:_TOP_ARTIST_LIMIT]
    ]
