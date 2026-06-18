"""
Business logic for Auxstrology — the taste-decision identity chart.

Engine (AUXSTROLOGY.md §4-§9): compute axes from owned signals, normalize
against static population priors, gate by confidence, rank by distinctiveness,
then deterministically select the sign, three caption adjectives, and evidence.
All selection is seeded by (user_id, axis, ALGORITHM_VERSION) so a reading is
stable across renders; reroll later just extends the seed.

Reads are served from the newest snapshot row when it postdates the user's
latest rating event; otherwise the chart is recomputed and appended
(append-only history powers Transit/retrograde later).
"""
import math
import random
from collections import Counter
from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from src.crud.auxstrology import (
    AuxSongRow,
    ComparisonStats,
    RatingEventStats,
    get_aux_song_rows,
    get_comparison_stats,
    get_latest_rating_event_at,
    get_latest_snapshot,
    get_rating_event_stats,
    insert_snapshot,
)
from src.crud.profile import get_by_user_id as get_profile_by_user_id
from src.crud.profile import get_by_username
from src.data.auxstrology_pools import (
    ACTIVE_MIN_RATED,
    ADJECTIVE_POOLS,
    ALGORITHM_VERSION,
    AXES,
    DEFAULT_SIGN,
    SIGN_TIER_ORDER,
    SIGNS,
    SKELETON_PHRASES,
    AxisConfig,
)
from src.data.genre_trait_priors import resolve_genre_prior
from src.pydantic_schemas.auxstrology import AuxstrologyResponse
from src.services.access import can_view_profile, can_view_taste

# z-score thresholds for zone bucketing (AUXSTROLOGY.md §4).
_ZONE_BOUNDS = (
    (-1.5, "very_low"),
    (-0.5, "low"),
    (0.5, "mid"),
    (1.5, "high"),
)
# Minimum |z| for an axis to headline the sign (clears mid comfortably).
_SIGN_MIN_Z = 0.75
_CAPTION_ADJECTIVES = 3
_EVIDENCE_LIMIT = 4


@dataclass
class _AxisResult:
    """One computed axis: raw value, sample size, and derived selection stats."""

    config: AxisConfig
    value: float
    n: int
    z: float
    zone: str
    confidence: float
    distinctiveness: float


def get_my_auxstrology(
    db: Session,
    user_id: int,
) -> AuxstrologyResponse:
    """Return the authenticated user's auxstrology reading."""
    return _get_or_compute(db, user_id)


def get_user_auxstrology_by_username(
    db: Session,
    current_user_id: int,
    username: str,
) -> AuxstrologyResponse:
    """
    Return a visible profile's auxstrology by username.

    Auxstrology is taste-bearing, so it follows the central visibility rule —
    404 for missing, blocked, or taste-hidden profiles (same as taste).
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
    # Read-only: viewing another user's reading must never write their snapshot row.
    return _get_or_compute(db, profile.user_id, persist=False)


def _get_or_compute(
    db: Session,
    user_id: int,
    persist: bool = True,
) -> AuxstrologyResponse:
    """Serve the latest fresh snapshot, or recompute.

    The recomputed reading is persisted only when `persist=True` — the user's own view and
    background refresh. Viewing another user's reading recomputes read-only, so a GET by one
    user can never write another user's snapshot (avoids a side-effecting / abusable GET).
    """
    latest = get_latest_snapshot(
        db,
        user_id,
        ALGORITHM_VERSION,
    )
    latest_event_at = get_latest_rating_event_at(db, user_id)
    if latest is not None and (
        latest_event_at is None or latest.computed_at >= latest_event_at
    ):
        return AuxstrologyResponse(**latest.payload)

    response = _compute(db, user_id)
    if persist:
        insert_snapshot(
            db,
            user_id=user_id,
            algorithm_version=ALGORITHM_VERSION,
            status=response.status,
            sign_key=_sign_key_of(response),
            payload=response.model_dump(),
        )
        db.commit()
    return response


def _sign_key_of(response: AuxstrologyResponse) -> str | None:
    """Stable analytics key for the chosen sign (name doubles as the key)."""
    return response.sign.name if response.sign else None


def _compute(
    db: Session,
    user_id: int,
) -> AuxstrologyResponse:
    """Compute a full reading from scratch (unlock ladder: AUXSTROLOGY.md §12)."""
    rows = get_aux_song_rows(db, user_id)
    total_rated = len(rows)

    # The chart stays fully locked until ACTIVE_MIN_RATED ranked songs — no early teaser,
    # so the reading only appears once the user has put in real work.
    if total_rated < ACTIVE_MIN_RATED:
        return AuxstrologyResponse(
            status="locked",
            current_ratings=total_rated,
            required_ratings=ACTIVE_MIN_RATED,
            sign=None,
            caption=None,
            adjectives=[],
            evidence=[],
            axes={},
        )

    profile = get_profile_by_user_id(db, user_id)
    event_stats = get_rating_event_stats(
        db,
        user_id,
        tz=profile.timezone if profile else None,
    )
    comparison_stats = get_comparison_stats(db, user_id)
    results = _compute_axes(
        rows,
        event_stats,
        comparison_stats,
    )

    sign, sign_axis = _select_sign(results)
    adjectives, caption_axes = _select_adjectives(
        results,
        user_id,
    )
    caption = _build_caption(
        adjectives,
        user_id,
    )
    evidence = _build_evidence(
        results,
        sign_axis,
        caption_axes,
    )
    return AuxstrologyResponse(
        status="active",
        current_ratings=total_rated,
        required_ratings=None,
        sign=sign,
        caption=caption,
        adjectives=adjectives,
        evidence=evidence,
        axes={
            key: result.zone
            for key, result in results.items()
        },
    )


def _compute_axes(
    rows: list[AuxSongRow],
    event_stats: RatingEventStats,
    comparison_stats: ComparisonStats,
) -> dict[str, _AxisResult]:
    """Compute every axis with enough samples to be eligible."""
    raw: dict[str, tuple[float | None, int]] = {}

    # Behavioral (tier 1)
    raw["deliberation"] = (
        comparison_stats.median_duration_ms / 1000.0
        if comparison_stats.median_duration_ms is not None
        else None,
        comparison_stats.comparison_count,
    )
    raw["comparison_depth"] = (
        comparison_stats.mean_depth,
        comparison_stats.session_count,
    )
    total_rated = len(rows)
    raw["volatility"] = (
        event_stats.move_events / total_rated,
        total_rated,
    )
    if event_stats.total_events > 0:
        raw["pruning"] = (
            event_stats.remove_events / event_stats.total_events,
            event_stats.total_events,
        )
        raw["annotation"] = (
            event_stats.noted_events / event_stats.total_events,
            event_stats.total_events,
        )
        raw["nocturnality"] = (
            event_stats.nocturnal_events / event_stats.total_events,
            event_stats.total_events,
        )
    if event_stats.active_days > 0:
        raw["intensity"] = (
            event_stats.total_events / event_stats.active_days,
            event_stats.active_days,
        )

    # Temperament (tier 2)
    scores = [row.score for row in rows]
    extreme = sum(1 for row in rows if row.bucket in ("like", "dislike"))
    raw["conviction"] = (
        extreme / total_rated,
        total_rated,
    )
    raw["polarization"] = (
        _std(scores),
        total_rated,
    )
    crowd_rows = [
        row
        for row in rows
        if row.global_avg_score is not None and row.global_rating_count >= 3
    ]
    if crowd_rows:
        raw["contrarianism"] = (
            sum(abs(row.score - row.global_avg_score) for row in crowd_rows)
            / len(crowd_rows),
            len(crowd_rows),
        )

    # Content (tier 3)
    raw["obscurity"] = (
        1.0 / (1.0 + _median([float(row.global_rating_count) for row in rows])),
        total_rated,
    )
    genres = [
        _resolve_genre(row.genres_mb, row.genre_deezer)
        for row in rows
    ]
    known_genres = [g for g in genres if g != "Unknown"]
    if known_genres:
        raw["eclecticism"] = (
            _entropy(known_genres),
            len(known_genres),
        )
        priors = [resolve_genre_prior(g) for g in known_genres]
        raw["energy"] = (
            sum(float(p["energy"]) for p in priors) / len(priors),
            len(priors),
        )
        raw["brightness"] = (
            sum(float(p["valence"]) for p in priors) / len(priors),
            len(priors),
        )
    years = [float(row.release_year) for row in rows if row.release_year is not None]
    if years:
        raw["recency"] = (
            _median(years),
            len(years),
        )
    artist_counts = Counter(row.artist for row in rows)
    raw["artist_loyalty"] = (
        artist_counts.most_common(1)[0][1] / total_rated,
        total_rated,
    )

    results: dict[str, _AxisResult] = {}
    for key, (value, n) in raw.items():
        config = AXES[key]
        if value is None or n < config.min_samples:
            continue
        z = (value - config.prior_mean) / config.prior_std
        confidence = min(1.0, n / (3 * config.min_samples))
        results[key] = _AxisResult(
            config=config,
            value=value,
            n=n,
            z=z,
            zone=_zone(z),
            confidence=confidence,
            distinctiveness=abs(z) * confidence,
        )
    return results


def _select_sign(
    results: dict[str, _AxisResult],
) -> tuple[dict[str, str], str | None]:
    """
    Pick the headline sign via confidence-gated tier priority (AUXSTROLOGY.md §8).

    Behavioral axes get first claim; temperament, then content carry users whose
    behavior is not yet distinctive. Ties break by the curated tier order.
    """
    for tier in (1, 2, 3):
        candidates = [
            (results[key], order)
            for order, key in enumerate(SIGN_TIER_ORDER[tier])
            if key in results and abs(results[key].z) >= _SIGN_MIN_Z
        ]
        if not candidates:
            continue
        best, _ = max(
            candidates,
            key=lambda pair: (pair[0].distinctiveness, -pair[1]),
        )
        direction = "low" if best.z < 0 else "high"
        return SIGNS[best.config.key][direction], best.config.key
    return DEFAULT_SIGN, None


def _select_adjectives(
    results: dict[str, _AxisResult],
    user_id: int,
) -> tuple[list[str], list[str]]:
    """
    Pick the 3 caption adjectives from the most distinctive axes.

    Non-mid axes rank first; if fewer than 3 exist, mid-zone axes fill in using
    their leaning side so the caption always has three words. One word per axis
    guarantees variety; the seeded pick keeps it stable per user.
    """
    distinct_axes = sorted(
        (r for r in results.values() if r.zone != "mid"),
        key=lambda r: r.distinctiveness,
        reverse=True,
    )
    filler_axes = sorted(
        (r for r in results.values() if r.zone == "mid"),
        key=lambda r: abs(r.z),
        reverse=True,
    )
    adjectives: list[str] = []
    caption_axes: list[str] = []
    for result in [*distinct_axes, *filler_axes]:
        if len(adjectives) == _CAPTION_ADJECTIVES:
            break
        zone = result.zone
        if zone == "mid":
            zone = "low" if result.z < 0 else "high"
        pool = ADJECTIVE_POOLS[result.config.key][zone]
        if not pool:
            continue
        rng = random.Random(f"{user_id}:{result.config.key}:{ALGORITHM_VERSION}")
        adjectives.append(pool[rng.randrange(len(pool))])
        caption_axes.append(result.config.key)
    return adjectives, caption_axes


def _build_caption(
    adjectives: list[str],
    user_id: int,
) -> str | None:
    """Drop the three adjectives into the user's seeded skeleton phrase."""
    if len(adjectives) < _CAPTION_ADJECTIVES:
        return None
    rng = random.Random(f"{user_id}:phrase:{ALGORITHM_VERSION}")
    phrase = SKELETON_PHRASES[rng.randrange(len(SKELETON_PHRASES))]
    return phrase.format(
        a=adjectives[0],
        b=adjectives[1],
        c=adjectives[2],
    )


def _build_evidence(
    results: dict[str, _AxisResult],
    sign_axis: str | None,
    caption_axes: list[str],
) -> list[str]:
    """
    Render "Why we think this" facts for the axes that drove the reading.

    The selecting axes ARE the evidence (AUXSTROLOGY.md §9) — no separate logic
    to drift out of sync with selection.
    """
    ordered_keys: list[str] = []
    for key in [sign_axis, *caption_axes]:
        if key is not None and key not in ordered_keys:
            ordered_keys.append(key)
    evidence = []
    for key in ordered_keys[:_EVIDENCE_LIMIT]:
        result = results[key]
        if result.zone == "mid":
            continue
        template = (
            result.config.evidence_low
            if result.z < 0
            else result.config.evidence_high
        )
        evidence.append(template.format(value=_format_value(result)))
    return evidence


def _format_value(result: _AxisResult) -> str:
    """Format an axis raw value for evidence copy, per the axis fmt."""
    fmt = result.config.fmt
    if fmt == "seconds":
        return f"{result.value:.1f}s"
    if fmt == "percent":
        return f"{round(result.value * 100)}%"
    if fmt == "year":
        return f"{int(round(result.value))}"
    if fmt == "count":
        return f"{result.value:.1f}"
    if fmt == "score":
        return f"{result.value:.1f}"
    return ""


def _zone(z: float) -> str:
    """Bucket a z-score into one of the five zones."""
    for bound, zone in _ZONE_BOUNDS:
        if z <= bound:
            return zone
    return "very_high"


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


def _std(values: list[float]) -> float:
    """Population standard deviation."""
    mean = sum(values) / len(values)
    return math.sqrt(sum((v - mean) ** 2 for v in values) / len(values))


def _median(values: list[float]) -> float:
    """Median of a non-empty list."""
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2 == 1:
        return ordered[mid]
    return (ordered[mid - 1] + ordered[mid]) / 2


def _entropy(labels: list[str]) -> float:
    """Shannon entropy (nats) of a label distribution."""
    counts = Counter(labels)
    total = len(labels)
    return -sum(
        (count / total) * math.log(count / total)
        for count in counts.values()
    )
