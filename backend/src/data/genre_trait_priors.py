"""
Genre -> content-axis priors for Auxstrology (Tier-1 content floor).

These let Auxstrology produce content flavor (energy / mood / texture) from
metadata LISTn already owns, with no audio-feature API. They are deliberately
coarse priors, not measurements: Deezer `bpm`/`gain` and (later) self-hosted
Essentia analysis refine `feature_*` per song. See AUXSTROLOGY.md §2, §5b.

Keys are lowercased genre strings as resolved from MusicBrainz (`genres_mb`)
or Deezer (`genre_deezer`). `energy` and `valence` are 0..1; `texture` is one
of the texture zone labels used by the texture axis.
"""

# Neutral fallback when a genre is unknown or unmapped. Intentionally mid so an
# unmapped genre contributes no spurious distinctiveness.
_DEFAULT_PRIOR: dict[str, float | str] = {
    "energy": 0.5,
    "valence": 0.5,
    "texture": "neutral",
}

# Starter table. Expand during the content-authoring pass (AUXSTROLOGY.md §16).
GENRE_TRAIT_PRIORS: dict[str, dict[str, float | str]] = {
    "ambient": {"energy": 0.15, "valence": 0.45, "texture": "lush"},
    "shoegaze": {"energy": 0.55, "valence": 0.35, "texture": "lush"},
    "dream pop": {"energy": 0.45, "valence": 0.55, "texture": "lush"},
    "lo-fi": {"energy": 0.30, "valence": 0.50, "texture": "raw"},
    "folk": {"energy": 0.35, "valence": 0.50, "texture": "raw"},
    "singer-songwriter": {"energy": 0.35, "valence": 0.45, "texture": "raw"},
    "indie rock": {"energy": 0.60, "valence": 0.55, "texture": "raw"},
    "punk": {"energy": 0.85, "valence": 0.50, "texture": "gritty"},
    "hardcore": {"energy": 0.95, "valence": 0.40, "texture": "gritty"},
    "metal": {"energy": 0.90, "valence": 0.35, "texture": "gritty"},
    "drill": {"energy": 0.70, "valence": 0.30, "texture": "gritty"},
    "trap": {"energy": 0.65, "valence": 0.45, "texture": "glossy"},
    "hip hop": {"energy": 0.65, "valence": 0.55, "texture": "glossy"},
    "rnb": {"energy": 0.45, "valence": 0.55, "texture": "glossy"},
    "pop": {"energy": 0.65, "valence": 0.70, "texture": "glossy"},
    "hyperpop": {"energy": 0.90, "valence": 0.70, "texture": "glossy"},
    "dance": {"energy": 0.80, "valence": 0.70, "texture": "glossy"},
    "house": {"energy": 0.80, "valence": 0.65, "texture": "glossy"},
    "techno": {"energy": 0.85, "valence": 0.45, "texture": "gritty"},
    "disco": {"energy": 0.75, "valence": 0.80, "texture": "lush"},
    "funk": {"energy": 0.70, "valence": 0.75, "texture": "lush"},
    "soul": {"energy": 0.50, "valence": 0.65, "texture": "lush"},
    "jazz": {"energy": 0.40, "valence": 0.55, "texture": "lush"},
    "classical": {"energy": 0.35, "valence": 0.50, "texture": "lush"},
    "country": {"energy": 0.50, "valence": 0.55, "texture": "raw"},
    "reggae": {"energy": 0.55, "valence": 0.70, "texture": "neutral"},
}


def resolve_genre_prior(genre: str | None) -> dict[str, float | str]:
    """Return content-axis priors for a genre, falling back to neutral."""
    if not genre:
        return _DEFAULT_PRIOR
    return GENRE_TRAIT_PRIORS.get(genre.lower(), _DEFAULT_PRIOR)
