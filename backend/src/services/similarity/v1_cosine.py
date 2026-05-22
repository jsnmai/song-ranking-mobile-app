"""v1_cosine similarity algorithm — cosine similarity on shared rated songs."""
import math
from collections import Counter
from dataclasses import dataclass


@dataclass
class SimilarityResult:
    """Output of one similarity computation between two users."""

    similarity_score: float
    shared_song_count: int
    score_distance_avg: float | None
    shared_genres: list[str]
    shared_top_artists: list[str]


def compute(
    scores_a: dict[int, float],
    scores_b: dict[int, float],
    genres: dict[int, str],
    artists: dict[int, str],
) -> SimilarityResult | None:
    """
    Compute cosine similarity between two users based on shared rated songs.

    Treats each song's score as a dimension in a vector space. Cosine similarity
    on positive vectors always falls in [0.0, 1.0], so no remapping is needed.

    Returns None when fewer than 5 songs are shared — that threshold is the
    minimum for a meaningful compatibility signal (see Phase 12 spec).

    Args:
        scores_a: {song_id: score} for user A.
        scores_b: {song_id: score} for user B.
        genres: {song_id: resolved_genre} for all songs in scores_a. The compute
            function only reads entries for shared song IDs.
        artists: {song_id: artist} for all songs in scores_a.
    """
    shared_ids = set(scores_a.keys()) & set(scores_b.keys())
    if len(shared_ids) < 5:
        return None

    vec_a = [scores_a[sid] for sid in shared_ids]
    vec_b = [scores_b[sid] for sid in shared_ids]

    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    mag_a = math.sqrt(sum(a * a for a in vec_a))
    mag_b = math.sqrt(sum(b * b for b in vec_b))

    if mag_a == 0.0 or mag_b == 0.0:
        cosine = 0.0
    else:
        cosine = dot / (mag_a * mag_b)

    # Clamp for floating-point rounding edge cases; scores are always positive
    # so cosine should naturally be in [0, 1], but guard anyway.
    cosine = max(0.0, min(1.0, cosine))

    diffs = [abs(scores_a[sid] - scores_b[sid]) for sid in shared_ids]
    score_distance_avg = sum(diffs) / len(diffs)

    genre_counts: Counter[str] = Counter()
    artist_counts: Counter[str] = Counter()
    for sid in shared_ids:
        genre = genres.get(sid, "Unknown")
        if genre != "Unknown":
            genre_counts[genre] += 1
        artist = artists.get(sid, "")
        if artist:
            artist_counts[artist] += 1

    return SimilarityResult(
        similarity_score=round(cosine, 4),
        shared_song_count=len(shared_ids),
        score_distance_avg=round(score_distance_avg, 4),
        shared_genres=[g for g, _ in genre_counts.most_common(5)],
        shared_top_artists=[a for a, _ in artist_counts.most_common(5)],
    )
