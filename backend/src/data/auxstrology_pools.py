"""
Auxstrology content pools: axis config, adjective clusters, phrases, signs.

This module is DATA ONLY. Computation (axis aggregation, normalization,
distinctiveness/confidence, seeded selection) lives in
`src.services.auxstrology`. See AUXSTROLOGY.md for the full spec.

Three strictly separate namespaces (AUXSTROLOGY.md §6):
  - SIGNS            -> curated headline archetypes (deterministic lookup)
  - ADJECTIVE_POOLS  -> per-axis zone clusters, pool-sampled into the caption
  - (modifiers/badges live elsewhere, in the modifier namespace)

Bumping ALGORITHM_VERSION re-seeds adjective selection and invalidates stored
snapshots (the service only serves snapshots matching the current version).
"""
from dataclasses import dataclass

# Bump when pools, axes, or selection logic change in a way that should
# invalidate stored snapshots / re-seed adjective picks.
ALGORITHM_VERSION = "v3"

# Five zones every axis is bucketed into by its z-score.
ZONES = ("very_low", "low", "mid", "high", "very_high")

# Unlock threshold (rated songs): the chart stays locked until the user has put in
# real work, then the full reading unlocks at once. No intermediate teaser — a chart
# after a single rating felt unearned. AUXSTROLOGY.md §12.
ACTIVE_MIN_RATED = 10


@dataclass(frozen=True)
class AxisConfig:
    """
    Static configuration for one axis.

    prior_mean / prior_std are hand-tuned population baselines (AUXSTROLOGY.md §4
    Phase A). Replace with a computed population snapshot in Phase B — only these
    numbers change, never the engine. min_samples gates eligibility; fmt tells the
    service how to render the raw value inside evidence strings.

    tier: 1 = behavioral (sign priority first), 2 = temperament, 3 = content.
    """

    key: str
    tier: int
    prior_mean: float
    prior_std: float
    min_samples: int
    fmt: str
    evidence_low: str
    evidence_high: str


# Raw-value direction is baked into each axis definition (no invert flags):
# higher raw value always matches the "high" adjective pools and sign.
AXES: dict[str, AxisConfig] = {
    "deliberation": AxisConfig(
        key="deliberation",
        tier=1,
        prior_mean=4.0,
        prior_std=3.0,
        min_samples=5,
        fmt="seconds",
        evidence_low="Your median head-to-head verdict lands in {value} — you don't linger.",
        evidence_high="Your median head-to-head verdict takes {value} — you sit with it.",
    ),
    "comparison_depth": AxisConfig(
        key="comparison_depth",
        tier=1,
        prior_mean=3.0,
        prior_std=1.5,
        min_samples=3,
        fmt="count",
        evidence_low="You place songs in about {value} comparisons — first instinct usually sticks.",
        evidence_high="You run about {value} comparisons per placement — every slot is earned.",
    ),
    "volatility": AxisConfig(
        key="volatility",
        tier=1,
        prior_mean=0.15,
        prior_std=0.15,
        min_samples=10,
        fmt="percent",
        evidence_low="Only {value} of your songs have ever moved after the first verdict.",
        evidence_high="{value} of your songs have been re-ranked since their first verdict.",
    ),
    "pruning": AxisConfig(
        key="pruning",
        tier=1,
        prior_mean=0.05,
        prior_std=0.05,
        min_samples=10,
        fmt="percent",
        evidence_low="You almost never remove a rating — everything stays on the record.",
        evidence_high="You've removed {value} of your verdicts — nothing survives on mercy.",
    ),
    "annotation": AxisConfig(
        key="annotation",
        tier=1,
        prior_mean=0.15,
        prior_std=0.15,
        min_samples=5,
        fmt="percent",
        evidence_low="You rate without leaving a trail — notes on just {value} of verdicts.",
        evidence_high="You leave notes on {value} of your verdicts — your rankings have a narrator.",
    ),
    "nocturnality": AxisConfig(
        key="nocturnality",
        tier=1,
        prior_mean=0.25,
        prior_std=0.15,
        min_samples=8,
        fmt="percent",
        evidence_low="Your verdicts come in by daylight — only {value} land late at night.",
        evidence_high="{value} of your verdicts land after dark.",
    ),
    "intensity": AxisConfig(
        key="intensity",
        tier=1,
        prior_mean=4.0,
        prior_std=3.0,
        min_samples=3,
        fmt="count",
        evidence_low="You graze — about {value} verdicts on a day you show up.",
        evidence_high="When you show up, you show up — about {value} verdicts per active day.",
    ),
    "conviction": AxisConfig(
        key="conviction",
        tier=2,
        prior_mean=0.6,
        prior_std=0.15,
        min_samples=5,
        fmt="percent",
        evidence_low="Most of your verdicts land in the middle — only {value} are a hard yes or no.",
        evidence_high="{value} of your verdicts are a hard yes or a hard no — little middle ground.",
    ),
    "polarization": AxisConfig(
        key="polarization",
        tier=2,
        prior_mean=2.0,
        prior_std=0.8,
        min_samples=5,
        fmt="score",
        evidence_low="Your scores cluster tight — you keep the field close.",
        evidence_high="Your scores swing wide — peaks and valleys, not plateaus.",
    ),
    "contrarianism": AxisConfig(
        key="contrarianism",
        tier=2,
        prior_mean=1.2,
        prior_std=0.8,
        min_samples=3,
        fmt="score",
        evidence_low="Your scores track the room — you and the crowd mostly agree.",
        evidence_high="Your scores run {value} points off the crowd's, on average.",
    ),
    "obscurity": AxisConfig(
        key="obscurity",
        tier=3,
        prior_mean=0.3,
        prior_std=0.2,
        min_samples=5,
        fmt="level",
        evidence_low="Your library leans toward songs everyone's already weighed in on.",
        evidence_high="Your library lives where almost nobody else has rated yet.",
    ),
    "eclecticism": AxisConfig(
        key="eclecticism",
        tier=3,
        prior_mean=1.2,
        prior_std=0.6,
        min_samples=5,
        fmt="level",
        evidence_low="Your ratings stay close to home — a few genres, deeply worked.",
        evidence_high="Your ratings sprawl across genres — no single lane holds you.",
    ),
    "recency": AxisConfig(
        key="recency",
        tier=3,
        prior_mean=2016.0,
        prior_std=7.0,
        min_samples=5,
        fmt="year",
        evidence_low="Your median rated song is from {value} — you keep the past close.",
        evidence_high="Your median rated song is from {value} — you live near the new-release shelf.",
    ),
    "artist_loyalty": AxisConfig(
        key="artist_loyalty",
        tier=3,
        prior_mean=0.2,
        prior_std=0.12,
        min_samples=5,
        fmt="percent",
        evidence_low="No single artist holds more than {value} of your ratings — you roam.",
        evidence_high="One artist holds {value} of your ratings — that's devotion.",
    ),
    "energy": AxisConfig(
        key="energy",
        tier=3,
        prior_mean=0.55,
        prior_std=0.1,
        min_samples=5,
        fmt="level",
        evidence_low="Your rated genres lean toward the quiet end of the spectrum.",
        evidence_high="Your rated genres run hot — high-energy lanes dominate.",
    ),
    "brightness": AxisConfig(
        key="brightness",
        tier=3,
        prior_mean=0.55,
        prior_std=0.1,
        min_samples=5,
        fmt="level",
        evidence_low="Your rated genres skew toward the melancholy end of the dial.",
        evidence_high="Your rated genres skew sunny — the bright end of the dial.",
    ),
}

# Sign-selection priority within each tier (AUXSTROLOGY.md §8). Order breaks
# distinctiveness ties deterministically.
SIGN_TIER_ORDER: dict[int, tuple[str, ...]] = {
    1: (
        "deliberation",
        "comparison_depth",
        "volatility",
        "pruning",
        "annotation",
        "nocturnality",
        "intensity",
    ),
    2: (
        "conviction",
        "polarization",
        "contrarianism",
    ),
    3: (
        "obscurity",
        "eclecticism",
        "recency",
        "artist_loyalty",
        "energy",
        "brightness",
    ),
}

# Skeleton phrases for the caption. Every phrase must accept three bare
# adjectives in {a}/{b}/{c} and read grammatically with any cluster word.
SKELETON_PHRASES: tuple[str, ...] = (
    "Your scores lean {a}, {b}, and a little {c}.",
    "You rate like someone {a}, {b}, and {c} all at once.",
    "Equal parts {a} and {b} — and quietly {c}.",
    "A taste that's {a}, {b}, and {c} underneath.",
    "Lately you're sounding {a}, {b}, and unmistakably {c}.",
    "On the aux you read as {a}, {b}, and just slightly {c}.",
    "The chart says {a}, {b}, and — when nobody's watching — {c}.",
)

# Per-axis, per-zone adjective clusters. The caption samples ONE word per chosen
# axis (seeded, stable). `mid` is empty everywhere on purpose: a mid zone is not
# distinctive, so it never supplies caption words.
ADJECTIVE_POOLS: dict[str, dict[str, list[str]]] = {
    "deliberation": {
        "very_low": [
            "instant", "gut-driven", "snap-judging", "verdict-ready", "trigger-quick",
            "reflexive", "lightning-sure", "unhesitating", "point-blank", "off-the-cuff",
        ],
        "low": [
            "quick", "decisive", "assured", "brisk", "sure-footed",
            "ready", "unbothered", "swift", "clean-cut", "no-nonsense",
        ],
        "mid": [],
        "high": [
            "measured", "careful", "considered", "unhurried", "weighing",
            "patient", "thorough", "slow-burning", "watchful", "methodical",
        ],
        "very_high": [
            "deliberate", "painstaking", "agonizing", "glacial", "exhaustive",
            "labyrinthine", "second-guessing", "marathon-minded", "forensic", "monkish",
        ],
    },
    "comparison_depth": {
        "very_low": [
            "breezy", "instinct-led", "one-and-done", "easygoing", "unfussy",
            "freehand", "loose", "intuitive", "offhand", "casual-handed",
        ],
        "low": [
            "efficient", "trusting", "light-touch", "smooth", "frictionless",
            "settled", "direct", "uncomplicated", "easy", "fluent",
        ],
        "mid": [],
        "high": [
            "exacting", "precise", "rigorous", "fine-grained", "particular",
            "careful-handed", "detailed", "discerning", "fastidious", "sharp-eyed",
        ],
        "very_high": [
            "surgical", "obsessive", "microscopic", "perfectionist", "merciless",
            "boundary-testing", "hair-splitting", "relentless", "clinical", "uncompromising",
        ],
    },
    "volatility": {
        "very_low": [
            "immovable", "locked-in", "settled", "steadfast", "unshakeable",
            "iron-clad", "permanent", "carved-in-stone", "resolute", "unbending",
        ],
        "low": [
            "steady", "anchored", "consistent", "grounded", "reliable",
            "even-keeled", "constant", "stable", "rooted", "sure",
        ],
        "mid": [],
        "high": [
            "restless", "revising", "shifting", "fluid", "evolving",
            "reconsidering", "unsettled", "changeable", "open-ended", "unfixed",
        ],
        "very_high": [
            "mercurial", "ever-revising", "volatile", "quicksilver", "tempestuous",
            "shape-shifting", "kaleidoscopic", "untethered", "stormy", "capricious",
        ],
    },
    "pruning": {
        "very_low": [
            "archival", "completist", "keeping", "collecting", "preservation-minded",
            "sentimental-handed", "keepsake-minded", "all-saving", "museum-minded", "hoarding",
        ],
        "low": [
            "retentive", "loyal-to-the-record", "steady-shelved", "accumulating", "patient-shelved",
            "tolerant", "forgiving", "easy-keeping", "roomy", "generous-shelved",
        ],
        "mid": [],
        "high": [
            "curating", "editing", "selective", "tidy", "discriminating",
            "trim", "sharpened", "pared-down", "intentional", "clean-shelved",
        ],
        "very_high": [
            "ruthless", "scorched-earth", "unsentimental", "surgical-shelved", "merciless",
            "guillotine-handed", "zero-tolerance", "purging", "cutthroat", "unforgiving",
        ],
    },
    "annotation": {
        "very_low": [
            "silent", "trail-less", "wordless", "unspoken", "inscrutable",
            "tight-lipped", "private", "shadowy", "no-comment", "sphinxlike",
        ],
        "low": [
            "terse", "economical", "quiet", "reserved", "understated",
            "minimal", "spare", "succinct", "low-key", "plainspoken",
        ],
        "mid": [],
        "high": [
            "expressive", "annotating", "talkative", "documenting", "editorial",
            "narrating", "opinionated", "commentating", "vocal", "chronicling",
        ],
        "very_high": [
            "diaristic", "confessional", "essayistic", "novelistic", "footnoting",
            "liner-note-writing", "testimonial", "memoirist", "verbose", "epistolary",
        ],
    },
    "nocturnality": {
        "very_low": [
            "daylit", "early-rising", "morning-bright", "sunrise-tuned", "diurnal",
            "first-light", "breakfast-houred", "dawn-patrol", "clear-eyed", "daybreak-driven",
        ],
        "low": [
            "daytime", "bright-houred", "sunlit", "afternoon-paced", "workday-rhythmed",
            "noonish", "golden-houred", "daylight-leaning", "open-aired", "early-evening",
        ],
        "mid": [],
        "high": [
            "late", "after-hours", "evening-leaning", "dusky", "twilight-tuned",
            "night-leaning", "lamplit", "moonlit", "past-bedtime", "late-shift",
        ],
        "very_high": [
            "nocturnal", "midnight", "small-hours", "after-dark", "insomniac",
            "3am-certified", "owl-houred", "graveyard-shift", "moon-governed", "night-sworn",
        ],
    },
    "intensity": {
        "very_low": [
            "grazing", "occasional", "sip-sized", "leisurely", "unrushed",
            "ambient", "drop-in", "light-footed", "passing-through", "wandering",
        ],
        "low": [
            "casual", "easy-paced", "relaxed", "steady-dripped", "measured-dose",
            "low-volume", "gentle", "weekendish", "strolling", "unforced",
        ],
        "mid": [],
        "high": [
            "committed", "engaged", "deep-diving", "locked-on", "session-stacking",
            "immersive", "absorbed", "devoted", "full-attention", "in-the-weeds",
        ],
        "very_high": [
            "obsessive", "marathonic", "binge-built", "insatiable", "all-consuming",
            "feverish", "torrential", "rabbit-holing", "possessed", "unstoppable",
        ],
    },
    "conviction": {
        "very_low": [
            "diplomatic", "equivocal", "fence-sitting", "noncommittal", "tempered",
            "hedging", "balanced", "both-sides", "circumspect", "softly-spoken",
        ],
        "low": [
            "moderate", "even-handed", "fair-minded", "middle-pathed", "judicious",
            "measured-hearted", "reasonable", "level", "temperate", "easy-graded",
        ],
        "mid": [],
        "high": [
            "decisive", "certain", "firm", "clear-eyed", "definite",
            "strong-stanced", "assertive", "committed", "full-throated", "unambiguous",
        ],
        "very_high": [
            "high-voltage", "all-or-nothing", "absolute", "zealous", "thunderous",
            "verdict-heavy", "black-and-white", "take-no-prisoners", "emphatic", "scorching",
        ],
    },
    "polarization": {
        "very_low": [
            "even", "level-scored", "uniform", "flat-lined", "consistent-handed",
            "narrow-banded", "centrist", "smooth-graded", "steady-handed", "equanimous",
        ],
        "low": [
            "temperate", "close-ranged", "balanced", "mild", "gentle-sloped",
            "soft-edged", "tame", "regular", "predictable", "calm-scored",
        ],
        "mid": [],
        "high": [
            "contrasting", "wide-ranging", "dynamic", "peak-and-valley", "dramatic",
            "sweeping", "bold-stroked", "vivid", "high-contrast", "expressive-scored",
        ],
        "very_high": [
            "polarized", "extreme", "all-or-nothing", "volcanic", "whiplash-scored",
            "love-or-loathe", "maximal", "tempest-graded", "razor-edged", "operatic",
        ],
    },
    "contrarianism": {
        "very_low": [
            "consensus-fluent", "crowd-aligned", "in-step", "agreeable", "harmonized",
            "chorus-joining", "majority-minded", "tide-riding", "synchronous", "communal",
        ],
        "low": [
            "amenable", "receptive", "open", "convergent", "easy-agreeing",
            "neighborly", "cooperative", "tuned-in", "congenial", "accordant",
        ],
        "mid": [],
        "high": [
            "skeptical", "contrarian", "against-the-grain", "unconvinced", "independent",
            "self-ruled", "divergent", "off-consensus", "unswayed", "free-thinking",
        ],
        "very_high": [
            "consensus-dodging", "hype-rejecting", "defiant", "unpersuadable", "heretical",
            "iconoclastic", "crowd-allergic", "insurgent", "renegade", "tide-fighting",
        ],
    },
    "obscurity": {
        "very_low": [
            "mainstream", "chart-fluent", "of-the-moment", "popular", "radio-ready",
            "zeitgeist-tuned", "playlist-famous", "headline-adjacent", "crowd-tested", "big-room",
        ],
        "low": [
            "familiar", "accessible", "well-trodden", "known", "recognizable",
            "canon-friendly", "household", "tried-and-true", "approachable", "broadly-loved",
        ],
        "mid": [],
        "high": [
            "off-radar", "deep-cut", "seldom-streamed", "obscure", "left-field",
            "B-side-loving", "tucked-away", "low-mileage", "uncharted", "word-of-mouth",
        ],
        "very_high": [
            "crate-digging", "subterranean", "fiercely-obscure", "deeply-buried", "fathoms-deep",
            "catacomb-deep", "unindexed", "secret-keeping", "vault-dwelling", "undiscovered",
        ],
    },
    "eclecticism": {
        "very_low": [
            "devoted", "single-lane", "monogamous", "purist", "laser-focused",
            "deep-rooted", "specialized", "genre-loyal", "faithful", "home-keeping",
        ],
        "low": [
            "focused", "selective-ranged", "core-loyal", "narrow-cast", "homebound",
            "concentrated", "centered", "particular", "lane-keeping", "anchored-taste",
        ],
        "mid": [],
        "high": [
            "eclectic", "wide-ranging", "genre-fluid", "roaming", "cross-pollinating",
            "borderless", "adventurous", "varied", "open-eared", "polyglot",
        ],
        "very_high": [
            "omnivorous", "sprawling", "magpie-ish", "untamed", "encyclopedic",
            "kaleidoscopic", "genre-agnostic", "everything-everywhere", "boundless", "maximalist",
        ],
    },
    "recency": {
        "very_low": [
            "archival", "time-capsuled", "sepia-toned", "golden-aged", "vintage",
            "back-catalog", "heritage-minded", "old-soul", "classic-keeping", "analog-hearted",
        ],
        "low": [
            "nostalgic", "throwback", "retro-leaning", "rearview-loving", "era-faithful",
            "yesteryear-tuned", "time-warped", "memory-laned", "revivalist", "rooted-in-then",
        ],
        "mid": [],
        "high": [
            "current", "fresh-eared", "up-to-date", "newly-minted", "of-the-now",
            "release-day", "forward-listening", "in-season", "contemporary", "present-tense",
        ],
        "very_high": [
            "bleeding-edge", "drop-chasing", "first-week", "tomorrow-eared", "premiere-hungry",
            "newest-of-the-new", "embargo-breaking", "future-facing", "preorder-souled", "instant-on",
        ],
    },
    "artist_loyalty": {
        "very_low": [
            "roaming", "name-agnostic", "free-floating", "untethered", "wide-cast",
            "nomadic", "unattached", "field-playing", "open-rostered", "everywhere-at-once",
        ],
        "low": [
            "varied", "broad-rostered", "many-voiced", "diversified", "open-circled",
            "ensemble-minded", "wide-loving", "spread-out", "multi-anchored", "circulating",
        ],
        "mid": [],
        "high": [
            "loyal", "devoted", "anchored", "ride-or-die", "inner-circled",
            "favorite-keeping", "true-fan", "steadfast-hearted", "committed", "deep-catalog",
        ],
        "very_high": [
            "monogamous", "one-artist-souled", "discography-completing", "shrine-building", "superfan",
            "single-orbit", "tunnel-hearted", "all-in", "completist-hearted", "devotional",
        ],
    },
    "energy": {
        "very_low": [
            "hushed", "whispering", "ambient-souled", "still", "feather-light",
            "candlelit", "breath-quiet", "weightless", "serene", "barely-there",
        ],
        "low": [
            "mellow", "soft-spoken", "low-lit", "gentle", "slow-waving",
            "cool-tempered", "velvet-volumed", "easeful", "drifting", "unplugged",
        ],
        "mid": [],
        "high": [
            "energetic", "driving", "charged", "vivid", "propulsive",
            "live-wired", "kinetic", "punchy", "amped", "surging",
        ],
        "very_high": [
            "frenetic", "electric", "high-voltage", "supercharged", "blistering",
            "wired", "combustible", "breakneck", "volcanic", "adrenalized",
        ],
    },
    "brightness": {
        "very_low": [
            "melancholic", "wistful", "brooding", "rain-streaked", "aching",
            "plaintive", "somber", "blue-toned", "heavy-hearted", "twilight-souled",
        ],
        "low": [
            "bittersweet", "moody", "downcast", "overcast", "minor-keyed",
            "pensive", "shadowed", "longing", "tender-bruised", "grey-skied",
        ],
        "mid": [],
        "high": [
            "bright", "warm", "sunlit", "uplifted", "major-keyed",
            "glowing", "open-windowed", "lighthearted", "buoyant", "golden",
        ],
        "very_high": [
            "euphoric", "radiant", "effervescent", "jubilant", "fireworks-hearted",
            "sun-drenched", "ecstatic", "champagne-bright", "soaring", "incandescent",
        ],
    },
}

# Headline archetypes, keyed by axis -> direction ("low" | "high"). low and
# very_low share the "low" sign (halves authoring without losing identity).
# Curated, finite, never generated (AUXSTROLOGY.md §6, §8).
SIGNS: dict[str, dict[str, dict[str, str]]] = {
    "deliberation": {
        "low": {
            "name": "The Certified Knower",
            "summary": "You came in with the answer, not a question.",
        },
        "high": {
            "name": "The Slow Burner",
            "summary": "You take your time, and the verdict is worth the wait.",
        },
    },
    "comparison_depth": {
        "low": {
            "name": "The Clean Placer",
            "summary": "First instinct, final answer — your gut files fast.",
        },
        "high": {
            "name": "The Boundary Tester",
            "summary": "No song gets a rank until it survives the gauntlet.",
        },
    },
    "volatility": {
        "low": {
            "name": "The Locked Ledger",
            "summary": "Once you've ruled, the ruling stands.",
        },
        "high": {
            "name": "The Re-Rate Prophet",
            "summary": "Your rankings are a living document, and revisions are the point.",
        },
    },
    "pruning": {
        "low": {
            "name": "The Completist",
            "summary": "Every verdict stays on the record — your list is an archive.",
        },
        "high": {
            "name": "The Ruthless Curator",
            "summary": "Nothing stays on your list out of mercy.",
        },
    },
    "annotation": {
        "low": {
            "name": "The Quiet Verdict",
            "summary": "No notes, no explanations — the rating is the statement.",
        },
        "high": {
            "name": "The Note Confessor",
            "summary": "Every rating comes with a story, and you write them all down.",
        },
    },
    "nocturnality": {
        "low": {
            "name": "The Daylight Judge",
            "summary": "Your taste keeps office hours.",
        },
        "high": {
            "name": "The Midnight Judge",
            "summary": "Your verdicts come in after the world goes quiet.",
        },
    },
    "intensity": {
        "low": {
            "name": "The Grazer",
            "summary": "A verdict here, a verdict there — taste on a slow drip.",
        },
        "high": {
            "name": "The Marathoner",
            "summary": "When you start rating, the session doesn't end until you say so.",
        },
    },
    "conviction": {
        "low": {
            "name": "The Diplomat",
            "summary": "You can find the case for almost anything.",
        },
        "high": {
            "name": "The Hard Liner",
            "summary": "Love it or leave it — your middle shelf is nearly empty.",
        },
    },
    "polarization": {
        "low": {
            "name": "The Even Hand",
            "summary": "Your scores hold a steady line — no song gets thrown off a cliff.",
        },
        "high": {
            "name": "The All-or-Nothing",
            "summary": "Your scoreboard is peaks and valleys with nothing in between.",
        },
    },
    "contrarianism": {
        "low": {
            "name": "The Crowd Whisperer",
            "summary": "You and the room usually land in the same place.",
        },
        "high": {
            "name": "The Consensus Dodger",
            "summary": "The crowd's pick is the one you trust least.",
        },
    },
    "obscurity": {
        "low": {
            "name": "The Mainstage Regular",
            "summary": "You're fluent in what everyone's playing — and unashamed of it.",
        },
        "high": {
            "name": "The Deep Cut Loyalist",
            "summary": "You live three clicks past the popular ones.",
        },
    },
    "eclecticism": {
        "low": {
            "name": "The Purist",
            "summary": "One lane, mastered completely.",
        },
        "high": {
            "name": "The Magpie",
            "summary": "Anything shiny from any genre — your taste has no fences.",
        },
    },
    "recency": {
        "low": {
            "name": "The Archivist",
            "summary": "The good stuff already exists; you're cataloguing it.",
        },
        "high": {
            "name": "The First Listener",
            "summary": "If it dropped this week, you've already ruled on it.",
        },
    },
    "artist_loyalty": {
        "low": {
            "name": "The Free Agent",
            "summary": "No artist owns you — every song stands alone.",
        },
        "high": {
            "name": "The Devotee",
            "summary": "When you love an artist, you rate the whole discography.",
        },
    },
    "energy": {
        "low": {
            "name": "The Still Water",
            "summary": "Your taste runs quiet and deep.",
        },
        "high": {
            "name": "The Live Wire",
            "summary": "If it doesn't move, it doesn't make your list.",
        },
    },
    "brightness": {
        "low": {
            "name": "The Nocturne",
            "summary": "You hear the beauty in the minor keys.",
        },
        "high": {
            "name": "The Sunseeker",
            "summary": "Your list is a window with the curtains thrown open.",
        },
    },
}

# Fallback when no axis is both eligible and distinctive (low data, flat taste).
DEFAULT_SIGN: dict[str, str] = {
    "name": "The Open Book",
    "summary": "Your chart is still taking shape — every rating sharpens it.",
}
