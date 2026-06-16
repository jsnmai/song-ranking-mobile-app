"""Constants and layout for the local dev demo seed script."""
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

DEMO_PASSWORD = "demo1234"
DEMO_EMAIL_DOMAIN = "@listn.demo"
LEGACY_DEMO_EMAIL_DOMAINS = ("@listn.dev", "@listn.test", "@demo.listn.dev", "@li.test")
DEMO_DEEZER_ID_START = 9_000_001
DEMO_DEEZER_ID_END = 9_000_033
ALGORITHM_VERSION = "v1_cosine"

# Discovery demo song IDs for manual Discover screen testing.
# Co-Sign: demo_disc_a (10.0) + demo_disc_b (10.0) both rate this; power has not rated it.
DISCO_CO_SIGN_DEEZER_ID = 9_000_031
# Privacy test: demo_blocked rates this at 10.0 but is blocked by power → must not appear.
DISCO_BLOCKED_DEEZER_ID = 9_000_033
# Already-rated test: demo_disc_a rates this at 9.375 but power has already rated it → must not appear.
DISCO_ALREADY_RATED_DEEZER_ID = 9_000_001

# Shared songs used for compatibility pairs (power / friend / opposite / newbie overlap).
SHARED_COMPAT_DEEZER_IDS = list(range(DEMO_DEEZER_ID_START, DEMO_DEEZER_ID_START + 8))

ALLOWED_DB_HOSTS = frozenset({"localhost", "127.0.0.1", "db"})
ALLOWED_DB_NAMES = frozenset({"listn", "listn_test"})
PRODUCTION_URL_DENYLIST = (
    "amazonaws.com",
    "rds.amazonaws",
    "railway.app",
    "render.com",
    "supabase.co",
    "neon.tech",
    "planetscale",
    "azure.com",
    "googleusercontent",
    "heroku.com",
)


@dataclass(frozen=True)
class DemoAccountSpec:
    """One deterministic demo user and profile."""

    email: str
    username: str
    display_name: str
    visibility: str

    @property
    def is_public(self) -> bool:
        """Compatibility bridge for old seed assertions while visibility is the source of truth."""
        return self.visibility == "public"


@dataclass(frozen=True)
class RankingSeedSpec:
    """One ranking row: bucket-local position; score is derived at seed time."""

    deezer_id: int
    bucket: str
    position: int


@dataclass(frozen=True)
class RatingEventSeedSpec:
    """One feed-visible rating event."""

    deezer_id: int
    bucket: str
    position: int
    hours_ago: float


@dataclass(frozen=True)
class ComparisonSeedSpec:
    """One finalized Versus History receipt for a demo account."""

    session_key: str
    song_a_deezer_id: int
    song_b_deezer_id: int
    winner_deezer_id: int
    bucket: str
    comparison_index_in_session: int
    decision_duration_ms: int | None
    hours_ago: float


def demo_email(username: str) -> str:
    """Build the canonical demo account email for a seeded username."""
    local_part = username.removeprefix("demo_")
    return f"{local_part}{DEMO_EMAIL_DOMAIN}"


def seed_email(username: str) -> str:
    """Build the canonical seed account email (strips seed_ prefix to avoid legacy-purge match)."""
    local_part = username.removeprefix("seed_")
    return f"{local_part}{DEMO_EMAIL_DOMAIN}"


DEMO_ACCOUNTS: tuple[DemoAccountSpec, ...] = (
    DemoAccountSpec(demo_email("demo_empty"), "demo_empty", "Demo Empty", "public"),
    DemoAccountSpec(demo_email("demo_newbie"), "demo_newbie", "Demo Newbie", "public"),
    DemoAccountSpec(demo_email("demo_power"), "demo_power", "Demo Power", "public"),
    DemoAccountSpec(demo_email("demo_friend"), "demo_friend", "Demo Friend", "public"),
    DemoAccountSpec(demo_email("demo_opposite"), "demo_opposite", "Demo Opposite", "public"),
    DemoAccountSpec(demo_email("demo_private"), "demo_private", "Demo Only Me", "only_me"),
    DemoAccountSpec(demo_email("demo_friends_only"), "demo_friends_only", "Demo Friends Only", "friends_only"),
    DemoAccountSpec(demo_email("demo_blocked"), "demo_blocked", "Demo Blocked", "public"),
    DemoAccountSpec(demo_email("demo_feed"), "demo_feed", "Demo Feed", "public"),
    # Discovery demo contributors — followed by demo_power for Co-Sign; demo_disc_a is also a
    # mutual follow, so it counts toward demo_power's circle (Trending / Most-rated).
    DemoAccountSpec(demo_email("demo_disc_a"), "demo_disc_a", "Demo Disc A", "public"),
    DemoAccountSpec(demo_email("demo_disc_b"), "demo_disc_b", "Demo Disc B", "public"),
    # Calibration UI demo accounts — for testing the comparison ranked-list ladder states.
    # demo_calib_s: 1 song per bucket → 6 ghost rows; tests max-ghost state for all three bucket colors.
    DemoAccountSpec(demo_email("demo_calib_s"), "demo_calib_s", "Calib Sparse", "public"),
    # demo_calib_m: 6 like / 3 alright / 4 dislike → mixed ghost counts (1/4/3 ghosts per bucket).
    DemoAccountSpec(demo_email("demo_calib_m"), "demo_calib_m", "Calib Medium", "public"),
    # demo_calib_f: 12 like / 8 alright / 7 dislike → windowing active for all buckets (no ghosts).
    DemoAccountSpec(demo_email("demo_calib_f"), "demo_calib_f", "Calib Full", "public"),
    # ── Seed accounts: targeted UI state testing ──────────────────────────────
    # seed_cosign: follows disc_a + disc_b so co-sign (9_000_031) appears on Discover;
    #   own songs don't overlap with disc accounts → compatibility stays locked;
    #   2 follows → trending shows 2/3 locked; 5 songs < 30 → curated lists locked.
    DemoAccountSpec(seed_email("seed_cosign"), "seed_cosign", "Seed Co-Sign", "public"),
    # seed_scores_only: 7 likes, 0 alright/dislike → scores + positions unlocked (≥5),
    #   but anchor section stays locked (missing okay/dislike buckets).
    DemoAccountSpec(seed_email("seed_scores_only"), "seed_scores_only", "Seed Scores Only", "public"),
    # seed_anchors: 1 like + 3 alright + 1 dislike = 5 songs → both scores AND anchors
    #   just unlock simultaneously (minimum viable state for both gates).
    DemoAccountSpec(seed_email("seed_anchors"), "seed_anchors", "Seed Anchors Min", "public"),
    # seed_graduated: 10 songs (3L + 4A + 3D) → setup checklist disappears, taste profile
    #   starts forming; anchors and scores unlocked; no follows.
    DemoAccountSpec(seed_email("seed_graduated"), "seed_graduated", "Seed Graduated", "public"),
)

DEMO_USERNAMES = frozenset(account.username for account in DEMO_ACCOUNTS)

# Anti-correlated cross-bucket pattern on shared songs (cosine ~0.40 vs power).
_POWER_SHARED_RANKINGS: tuple[RankingSeedSpec, ...] = (
    RankingSeedSpec(9_000_001, "like", 1),
    RankingSeedSpec(9_000_002, "dislike", 1),
    RankingSeedSpec(9_000_003, "like", 2),
    RankingSeedSpec(9_000_004, "dislike", 2),
    RankingSeedSpec(9_000_005, "like", 3),
    RankingSeedSpec(9_000_006, "dislike", 3),
    RankingSeedSpec(9_000_007, "like", 4),
    RankingSeedSpec(9_000_008, "dislike", 4),
)

_OPPOSITE_SHARED_RANKINGS: tuple[RankingSeedSpec, ...] = (
    # Bottom of dislike / top of like buckets on shared songs for low v1_cosine (~0.41).
    RankingSeedSpec(9_000_001, "dislike", 4),
    RankingSeedSpec(9_000_002, "like", 4),
    RankingSeedSpec(9_000_003, "dislike", 4),
    RankingSeedSpec(9_000_004, "like", 4),
    RankingSeedSpec(9_000_005, "dislike", 4),
    RankingSeedSpec(9_000_006, "like", 4),
    RankingSeedSpec(9_000_007, "dislike", 4),
    RankingSeedSpec(9_000_008, "like", 4),
)

# Extra ranked songs for demo_power beyond the compatibility set.
_POWER_EXTRA_RANKINGS: tuple[RankingSeedSpec, ...] = (
    RankingSeedSpec(9_000_009, "like", 5),
    RankingSeedSpec(9_000_010, "like", 6),
    RankingSeedSpec(9_000_011, "like", 7),
    RankingSeedSpec(9_000_012, "alright", 1),
    RankingSeedSpec(9_000_013, "alright", 2),
    RankingSeedSpec(9_000_014, "alright", 3),
    RankingSeedSpec(9_000_015, "dislike", 5),
    RankingSeedSpec(9_000_016, "dislike", 6),
    RankingSeedSpec(9_000_017, "like", 8),
    RankingSeedSpec(9_000_018, "like", 9),
    RankingSeedSpec(9_000_019, "alright", 4),
    RankingSeedSpec(9_000_020, "dislike", 7),
)

_POWER_ALL_RANKINGS = _POWER_SHARED_RANKINGS + _POWER_EXTRA_RANKINGS

RANKINGS_BY_USERNAME: dict[str, tuple[RankingSeedSpec, ...]] = {
    "demo_empty": (),
    "demo_newbie": (
        RankingSeedSpec(9_000_001, "like", 1),
        RankingSeedSpec(9_000_002, "alright", 1),
        RankingSeedSpec(9_000_021, "like", 2),
    ),
    "demo_power": _POWER_ALL_RANKINGS,
    # Mirror power exactly so shared-song scores match for v1_cosine (> 0.9).
    "demo_friend": _POWER_ALL_RANKINGS,
    "demo_opposite": _OPPOSITE_SHARED_RANKINGS
    + (
        RankingSeedSpec(9_000_024, "dislike", 5),
        RankingSeedSpec(9_000_025, "like", 5),
    ),
    "demo_private": (
        RankingSeedSpec(9_000_026, "like", 1),
        RankingSeedSpec(9_000_027, "alright", 1),
    ),
    "demo_friends_only": (
        RankingSeedSpec(9_000_001, "like", 1),
        RankingSeedSpec(9_000_003, "like", 2),
        RankingSeedSpec(9_000_005, "like", 3),
        RankingSeedSpec(9_000_007, "alright", 1),
        RankingSeedSpec(9_000_009, "dislike", 1),
    ),
    "demo_blocked": (
        # 9_000_033 at pos 1/3 → score 10.0, but demo_blocked is blocked by power → excluded from discovery.
        RankingSeedSpec(9_000_033, "like", 1),
        RankingSeedSpec(9_000_020, "like", 2),
        RankingSeedSpec(9_000_021, "like", 3),
        RankingSeedSpec(9_000_022, "alright", 1),
    ),
    "demo_feed": (
        RankingSeedSpec(9_000_028, "like", 1),
        RankingSeedSpec(9_000_029, "like", 2),
        RankingSeedSpec(9_000_030, "alright", 1),
        RankingSeedSpec(9_000_009, "like", 3),
        RankingSeedSpec(9_000_010, "alright", 2),
        RankingSeedSpec(9_000_011, "dislike", 1),
    ),
    # Discovery contributors for the Co-Sign demo.
    # 5 like songs → scores: pos1=10.0, pos2=9.375, pos3=8.75, pos4=8.125, pos5=7.5.
    # 9_000_031 (pos 1, 10.0) + 9_000_001 (pos 2, 9.375 but power already rated it → excluded).
    "demo_disc_a": (
        RankingSeedSpec(9_000_031, "like", 1),
        RankingSeedSpec(9_000_001, "like", 2),
        RankingSeedSpec(9_000_003, "like", 3),
        RankingSeedSpec(9_000_005, "like", 4),
        RankingSeedSpec(9_000_007, "like", 5),
    ),
    # 9_000_031 (pos 1, 10.0) Co-Signs with disc_a; 9_000_032 (pos 2, 9.375) rated by disc_b only.
    "demo_disc_b": (
        RankingSeedSpec(9_000_031, "like", 1),
        RankingSeedSpec(9_000_032, "like", 2),
        RankingSeedSpec(9_000_002, "like", 3),
        RankingSeedSpec(9_000_004, "like", 4),
        RankingSeedSpec(9_000_006, "like", 5),
    ),
    # ── Calibration UI demo accounts ────────────────────────────────────────────
    # demo_calib_s — 1 song per bucket → max ghost state (6 ghosts shown when calibrating).
    # Bucket colors: like=accent-red, alright=gold, dislike=plum.
    "demo_calib_s": (
        RankingSeedSpec(9_000_009, "like", 1),
        RankingSeedSpec(9_000_012, "alright", 1),
        RankingSeedSpec(9_000_002, "dislike", 1),
    ),
    # demo_calib_m — 6 like / 3 alright / 4 dislike.
    # Calibrating like → 1 ghost; alright → 4 ghosts; dislike → 3 ghosts.
    "demo_calib_m": (
        RankingSeedSpec(9_000_001, "like", 1),
        RankingSeedSpec(9_000_003, "like", 2),
        RankingSeedSpec(9_000_005, "like", 3),
        RankingSeedSpec(9_000_007, "like", 4),
        RankingSeedSpec(9_000_009, "like", 5),
        RankingSeedSpec(9_000_011, "like", 6),
        RankingSeedSpec(9_000_013, "alright", 1),
        RankingSeedSpec(9_000_014, "alright", 2),
        RankingSeedSpec(9_000_019, "alright", 3),
        RankingSeedSpec(9_000_002, "dislike", 1),
        RankingSeedSpec(9_000_004, "dislike", 2),
        RankingSeedSpec(9_000_006, "dislike", 3),
        RankingSeedSpec(9_000_008, "dislike", 4),
    ),
    # ── Seed accounts ──────────────────────────────────────────────────────────
    # seed_cosign: 5 own likes on songs disc_a/disc_b have never rated → no compatibility
    # overlap. Follows both disc accounts so 9_000_031 (scored 10.0 by both) shows as co-sign.
    "seed_cosign": (
        RankingSeedSpec(9_000_008, "like", 1),
        RankingSeedSpec(9_000_010, "like", 2),
        RankingSeedSpec(9_000_012, "like", 3),
        RankingSeedSpec(9_000_014, "like", 4),
        RankingSeedSpec(9_000_016, "like", 5),
    ),
    # seed_scores_only: 7 likes only → scores + positions visible (≥5), anchors locked.
    "seed_scores_only": (
        RankingSeedSpec(9_000_009, "like", 1),
        RankingSeedSpec(9_000_011, "like", 2),
        RankingSeedSpec(9_000_013, "like", 3),
        RankingSeedSpec(9_000_015, "like", 4),
        RankingSeedSpec(9_000_017, "like", 5),
        RankingSeedSpec(9_000_018, "like", 6),
        RankingSeedSpec(9_000_019, "like", 7),
    ),
    # seed_anchors: 1L + 3A + 1D = 5 → minimum to unlock both scores AND anchors.
    "seed_anchors": (
        RankingSeedSpec(9_000_020, "like", 1),
        RankingSeedSpec(9_000_021, "alright", 1),
        RankingSeedSpec(9_000_022, "alright", 2),
        RankingSeedSpec(9_000_023, "alright", 3),
        RankingSeedSpec(9_000_024, "dislike", 1),
    ),
    # seed_graduated: 10 songs (3L + 4A + 3D) → setup checklist gone, taste starts forming.
    "seed_graduated": (
        RankingSeedSpec(9_000_025, "like", 1),
        RankingSeedSpec(9_000_026, "like", 2),
        RankingSeedSpec(9_000_027, "like", 3),
        RankingSeedSpec(9_000_009, "alright", 1),
        RankingSeedSpec(9_000_010, "alright", 2),
        RankingSeedSpec(9_000_011, "alright", 3),
        RankingSeedSpec(9_000_012, "alright", 4),
        RankingSeedSpec(9_000_028, "dislike", 1),
        RankingSeedSpec(9_000_029, "dislike", 2),
        RankingSeedSpec(9_000_030, "dislike", 3),
    ),
    # demo_calib_f — 12 like / 8 alright / 7 dislike → windowing active, no ghosts.
    # Pivot position shifts through the 7-slot window as comparisons narrow the range.
    "demo_calib_f": (
        RankingSeedSpec(9_000_001, "like", 1),
        RankingSeedSpec(9_000_002, "like", 2),
        RankingSeedSpec(9_000_003, "like", 3),
        RankingSeedSpec(9_000_004, "like", 4),
        RankingSeedSpec(9_000_005, "like", 5),
        RankingSeedSpec(9_000_006, "like", 6),
        RankingSeedSpec(9_000_007, "like", 7),
        RankingSeedSpec(9_000_008, "like", 8),
        RankingSeedSpec(9_000_009, "like", 9),
        RankingSeedSpec(9_000_010, "like", 10),
        RankingSeedSpec(9_000_011, "like", 11),
        RankingSeedSpec(9_000_012, "like", 12),
        RankingSeedSpec(9_000_013, "alright", 1),
        RankingSeedSpec(9_000_014, "alright", 2),
        RankingSeedSpec(9_000_015, "alright", 3),
        RankingSeedSpec(9_000_016, "alright", 4),
        RankingSeedSpec(9_000_017, "alright", 5),
        RankingSeedSpec(9_000_018, "alright", 6),
        RankingSeedSpec(9_000_019, "alright", 7),
        RankingSeedSpec(9_000_020, "alright", 8),
        RankingSeedSpec(9_000_021, "dislike", 1),
        RankingSeedSpec(9_000_022, "dislike", 2),
        RankingSeedSpec(9_000_023, "dislike", 3),
        RankingSeedSpec(9_000_024, "dislike", 4),
        RankingSeedSpec(9_000_025, "dislike", 5),
        RankingSeedSpec(9_000_026, "dislike", 6),
        RankingSeedSpec(9_000_027, "dislike", 7),
    ),
}

# follower_username -> following_username
FOLLOW_EDGES: tuple[tuple[str, str], ...] = (
    ("demo_power", "demo_feed"),
    ("demo_power", "demo_friend"),
    ("demo_power", "demo_opposite"),
    ("demo_power", "demo_newbie"),

    ("demo_power", "demo_private"),
    ("demo_power", "demo_friends_only"),
    ("demo_power", "demo_blocked"),
    ("demo_power", "demo_disc_a"),
    ("demo_power", "demo_disc_b"),
    ("demo_feed", "demo_power"),
    ("demo_feed", "demo_friend"),
    ("demo_feed", "demo_opposite"),
    ("demo_feed", "demo_newbie"),

    ("demo_feed", "demo_friends_only"),
    ("demo_friends_only", "demo_power"),
    ("demo_blocked", "demo_power"),
    # Mutual follows that give demo_power a circle of >=3 visible members, so the live
    # "Trending in your circle" and "Most-rated in your circle" Discover cards unlock.
    # demo_power already follows these three; they already share rated songs with the rest
    # of the circle (and have recent rating events), so both the all-time count and the
    # 7-day Trending window populate without adding any ratings. demo_blocked stays blocked
    # (excluded), and demo_empty / demo_newbie keep no circle so their locked states still demo.
    ("demo_friend", "demo_power"),
    ("demo_opposite", "demo_power"),
    ("demo_disc_a", "demo_power"),
    # seed_cosign follows both disc accounts so 9_000_031 qualifies as a co-sign (min_count=2).
    ("seed_cosign", "demo_disc_a"),
    ("seed_cosign", "demo_disc_b"),
)

# blocker_username -> blocked_username
BLOCK_EDGES: tuple[tuple[str, str], ...] = (
    ("demo_power", "demo_blocked"),
)

# Rating events for feed actors (username, specs). hours_ago relative to seed anchor.
def _feed_events(
    username: str,
    specs: tuple[RatingEventSeedSpec, ...],
) -> tuple[tuple[str, RatingEventSeedSpec], ...]:
    return tuple((username, spec) for spec in specs)


FEED_EVENT_SPECS: tuple[tuple[str, RatingEventSeedSpec], ...] = (
    *_feed_events(
        "demo_feed",
        (
            RatingEventSeedSpec(9_000_028, "like", 1, 0.5),
            RatingEventSeedSpec(9_000_029, "like", 2, 1.0),
            RatingEventSeedSpec(9_000_030, "alright", 1, 2.0),
            RatingEventSeedSpec(9_000_009, "like", 3, 3.0),
        ),
    ),
    *_feed_events(
        "demo_friend",
        (
            RatingEventSeedSpec(9_000_001, "like", 1, 0.25),
            RatingEventSeedSpec(9_000_003, "like", 2, 1.5),
            RatingEventSeedSpec(9_000_005, "like", 3, 4.0),
        ),
    ),
    *_feed_events(
        "demo_opposite",
        (
            RatingEventSeedSpec(9_000_001, "dislike", 4, 0.75),
            RatingEventSeedSpec(9_000_002, "like", 4, 2.5),
            RatingEventSeedSpec(9_000_004, "like", 4, 5.0),
        ),
    ),
    *_feed_events(
        "demo_newbie",
        (
            RatingEventSeedSpec(9_000_001, "like", 1, 1.25),
            RatingEventSeedSpec(9_000_002, "alright", 1, 6.0),
        ),
    ),
    *_feed_events(
        "demo_friends_only",
        (
            RatingEventSeedSpec(9_000_001, "like", 1, 1.1),
            RatingEventSeedSpec(9_000_009, "dislike", 1, 5.5),
        ),
    ),
    *_feed_events(
        "demo_blocked",
        (
            RatingEventSeedSpec(9_000_020, "like", 1, 0.2),
            RatingEventSeedSpec(9_000_022, "alright", 1, 4.75),
        ),
    ),
    *_feed_events(
        "demo_power",
        (
            RatingEventSeedSpec(9_000_009, "like", 5, 7.0),
        ),
    ),
)

COMPARISON_SPECS_BY_USERNAME: dict[str, tuple[ComparisonSeedSpec, ...]] = {
    "demo_power": (
        ComparisonSeedSpec("power-like-1", 9_000_003, 9_000_009, 9_000_003, "like", 1, 1450, 0.75),
        ComparisonSeedSpec("power-like-1", 9_000_003, 9_000_005, 9_000_003, "like", 2, 2300, 0.75),
        ComparisonSeedSpec("power-okay-1", 9_000_012, 9_000_014, 9_000_012, "alright", 1, None, 26.0),
        ComparisonSeedSpec("power-dislike-1", 9_000_016, 9_000_008, 9_000_008, "dislike", 1, 890, 74.0),
        ComparisonSeedSpec("power-like-older", 9_000_010, 9_000_017, 9_000_010, "like", 1, 4100, 170.0),
    ),
}

COMPATIBILITY_PAIRS: tuple[tuple[str, str], ...] = (
    ("demo_power", "demo_friend"),
    ("demo_power", "demo_opposite"),
)


def _artist_for_deezer_id(deezer_id: int) -> str:
    artists = ("Frank Ocean", "Kendrick Lamar", "Taylor Swift", "Bon Iver", "SZA")
    return artists[(deezer_id - DEMO_DEEZER_ID_START) % len(artists)]


def _genre_for_deezer_id(deezer_id: int) -> str:
    genres = ("Rock", "Hip-Hop", "Pop", "R&B", "Indie")
    return genres[(deezer_id - DEMO_DEEZER_ID_START) % len(genres)]


SONG_CATALOG: tuple[dict[str, object], ...] = tuple(
    {
        "deezer_id": deezer_id,
        "title": f"Demo Track {deezer_id - DEMO_DEEZER_ID_START + 1:02d}",
        "artist": _artist_for_deezer_id(deezer_id),
        "album": "LISTn Demo Sessions",
        "genre_deezer": _genre_for_deezer_id(deezer_id),
        "preview_url": (
            f"https://example.com/demo-preview-{deezer_id}.mp3"
            if deezer_id % 3 != 0
            else None
        ),
    }
    for deezer_id in range(DEMO_DEEZER_ID_START, DEMO_DEEZER_ID_END + 1)
)


def feed_anchor_now() -> datetime:
    """Anchor feed timestamps near the current UTC moment so Feed 'today' UI populates."""
    return datetime.now(timezone.utc).replace(microsecond=0)


def event_created_at(
    anchor: datetime,
    hours_ago: float,
) -> datetime:
    """Return a created_at offset from the feed anchor."""
    return anchor - timedelta(hours=hours_ago)
