"""Constants and layout for the local dev demo seed script."""
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

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
SMOKE_DEMO_DEEZER_ID = 9_000_001
SMOKE_APPLE_TRACK_ID = "6764676334"
SMOKE_APPLE_VIEW_URL = "https://music.apple.com/us/album/smoke/1895874910?i=6764676334&uo=4"
SMOKE_APPLE_ARTWORK_URL = (
    "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/49/6f/61/"
    "496f61fd-0c54-7d6e-812c-79c0d159aa72/075679582362.jpg/600x600bb.jpg"
)

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
    # Avatar palette token (accent/sky/plum/mint/gold/ink). None => the deterministic default.
    avatar_color: str | None = None
    # One-line "what this account is good for testing", printed in the login cheat-sheet so you
    # can pick the right login without guessing. Keep it short (fits one table row).
    note: str | None = None

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
class RerateEventSeedSpec:
    """One feed-visible re-rate (a score the user moved), powering Re-rate Radar.

    `new_bucket`/`new_position` must mirror the user's current ranking for the song so the
    event's stored `new_score` matches the live ranking; `previous_*` are the pre-move values
    shown as the delta.
    """

    deezer_id: int
    previous_bucket: str
    previous_score: float
    new_bucket: str
    new_position: int
    hours_ago: float


@dataclass(frozen=True)
class NotificationSeedSpec:
    """One in-app notification demo_power has received (the recipient is always demo_power).

    `type` is "follow" or "like"; `deezer_id` is the demo_power activity that was liked (a song
    demo_power has a rating event for) and is None for follows; `read` controls the unread dot
    and the header badge count.
    """

    type: str
    actor_username: str
    deezer_id: int | None
    hours_ago: float
    read: bool


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
    # Deliberate avatar colors across the palette so avatars read consistently on the feed and
    # profiles (and demo the picker); demo_newbie keeps the black "ink" icon as an explicit choice.
    DemoAccountSpec(
        demo_email("demo_empty"), "demo_empty", "Demo Empty", "public", avatar_color="gold",
        note="Setup card: all 3 steps pending, 'Rate a song' CTA. Empty feed/rankings/taste.",
    ),
    DemoAccountSpec(
        demo_email("demo_newbie"), "demo_newbie", "Demo Newbie", "public", avatar_color="ink",
        note="Setup card: step 1 done (3 rated), rate + follow steps pending, CTA present.",
    ),
    DemoAccountSpec(
        demo_email("demo_power"), "demo_power", "Demo Power", "public", avatar_color="accent",
        note="Fully set up (card gone): feed modules, notifications, streak, discover, versus.",
    ),
    DemoAccountSpec(
        demo_email("demo_friend"), "demo_friend", "Demo Friend", "public", avatar_color="sky",
        note="High-compatibility match for demo_power (mirrors its ratings); public profile.",
    ),
    DemoAccountSpec(
        demo_email("demo_opposite"), "demo_opposite", "Demo Opposite", "public", avatar_color="plum",
        note="Low-compatibility match for demo_power (anti-correlated ratings).",
    ),
    DemoAccountSpec(
        demo_email("demo_private"), "demo_private", "Demo Only Me", "only_me", avatar_color="mint",
        note="only_me visibility: profile hidden from others, taste stats gated.",
    ),
    DemoAccountSpec(
        demo_email("demo_friends_only"), "demo_friends_only", "Demo Friends Only",
        "friends_only", avatar_color="gold",
        note="friends_only visibility: visible to mutual follows, hidden from strangers.",
    ),
    DemoAccountSpec(
        demo_email("demo_blocked"), "demo_blocked", "Demo Blocked", "public", avatar_color="plum",
        note="Blocked by demo_power: excluded from its discovery/feed despite 10.0 ratings.",
    ),
    DemoAccountSpec(
        demo_email("demo_feed"), "demo_feed", "Demo Feed", "public", avatar_color="mint",
        note="Feed actor: recent rating events + a Match-Moment comparison for demo_power's feed.",
    ),
    # Discovery demo contributors — followed by demo_power for Co-Sign; demo_disc_a is also a
    # mutual follow, so it counts toward demo_power's circle (Trending / Most-rated).
    DemoAccountSpec(
        demo_email("demo_disc_a"), "demo_disc_a", "Demo Disc A", "public",
        note="Discovery contributor (Co-Sign on 9_000_031); mutual follow in demo_power's circle.",
    ),
    DemoAccountSpec(
        demo_email("demo_disc_b"), "demo_disc_b", "Demo Disc B", "public",
        note="Discovery contributor (second Co-Sign voter on 9_000_031).",
    ),
    # Calibration UI demo accounts — for testing the comparison ranked-list ladder states.
    DemoAccountSpec(
        demo_email("demo_calib_s"), "demo_calib_s", "Calib Sparse", "public",
        note="Calibration ladder: 1 song/bucket → max 6 ghost rows across all bucket colors.",
    ),
    DemoAccountSpec(
        demo_email("demo_calib_m"), "demo_calib_m", "Calib Medium", "public",
        note="Calibration ladder: 6L/3A/4D → mixed ghost counts (1/4/3 per bucket).",
    ),
    DemoAccountSpec(
        demo_email("demo_calib_f"), "demo_calib_f", "Calib Full", "public",
        note="Calibration ladder: 12L/8A/7D → windowing active, no ghosts.",
    ),
    # ── Seed accounts: targeted UI state testing ──────────────────────────────
    DemoAccountSpec(
        seed_email("seed_cosign"), "seed_cosign", "Seed Co-Sign", "public",
        note="Discover: co-sign CAROUSEL (5 cards; 9_000_001 shows 3 contributors); compatibility "
        "locked (no mutuals); trending/most-rated locked (circle_size 0); lists locked.",
    ),
    DemoAccountSpec(
        seed_email("seed_scores_only"), "seed_scores_only", "Seed Scores Only", "public",
        note="Rankings: 7 likes → scores + positions unlocked (≥5), anchors still locked.",
    ),
    DemoAccountSpec(
        seed_email("seed_anchors"), "seed_anchors", "Seed Anchors Min", "public",
        note="Rankings: 1L/3A/1D → scores AND anchors unlock together (min viable both gates).",
    ),
    # seed_graduated: 10 ratings AND 3 follows → every setup step done, so the checklist card is
    # gone and the taste profile is forming. (Since the card now also gates on follows, it needs
    # the follow edges below to actually "graduate" — 10 ratings alone leaves it friends-pending.)
    DemoAccountSpec(
        seed_email("seed_graduated"), "seed_graduated", "Seed Graduated", "public",
        note="Setup complete (card gone): 10 rated + 3 follows; taste forming, scores/anchors on.",
    ),
    # seed_friends_pending: 11 ratings, 0 follows → the setup card's "friends pending" state —
    # rating steps show glowing ticks, the 'Rate a song' CTA is dropped, and the 3-avatar cluster
    # top-right spotlights the remaining "Follow 3 friends" step.
    DemoAccountSpec(
        seed_email("seed_friends_pending"), "seed_friends_pending", "Seed Friends Pending", "public",
        avatar_color="sky",
        note="Setup card FRIENDS-PENDING: 11 rated / 0 follows → glowing ticks, avatar cluster, no CTA.",
    ),
    # seed_friends_first: 4 ratings but already 3 follows → follow step is ticked while the rating
    # steps are still mixed (step 1 done, step 2 pending). Verifies ticks/glow on non-contiguous
    # steps and that the 'Rate a song' CTA stays because rating is unfinished.
    DemoAccountSpec(
        seed_email("seed_friends_first"), "seed_friends_first", "Seed Friends First", "public",
        avatar_color="mint",
        note="Setup card FRIENDS-FIRST: 4 rated / 3 follows → step 3 ticked, rating steps pending, CTA on.",
    ),
    # seed_locked_full: the module gate is MET (6 rated ≥5, 3 follows), so Feed renders the
    # full-size unlocked section — but every followed user is inactive (no rating events /
    # comparisons / re-rates, and none follow back so there are 0 mutual friends), so all six
    # full-size module cards (Split, Consensus, Re-rate, Match, Disagreement, Recent Verdict)
    # render in their LOCKED placeholder state at once.
    DemoAccountSpec(
        seed_email("seed_locked_full"), "seed_locked_full", "Seed Locked Full", "public",
        avatar_color="plum",
        note="Feed FULL-SIZE locked cards: gate met (6 rated / 3 follows) but follows inactive "
        "→ every module card locked.",
    ),
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
    # seed_cosign: 5 own likes chosen so none of its co-sign songs are self-rated (co-signs
    # require the viewer hasn't rated the song). Its follows (disc_a, disc_b, power, friend)
    # yield five co-signs: 9_000_031 (disc_a+disc_b), 9_000_001 (power+friend+disc_a → 3
    # contributors), and 9_000_003/005/007 (power+friend). Compatibility stays locked: Most
    # Compatible uses the mutual-follow circle and nobody follows seed_cosign back.
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
    # seed_graduated: 10 songs (3L + 4A + 3D). Paired with 3 follow edges below so all setup
    # steps clear and the checklist card is gone (taste forming, scores + anchors on).
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
    # seed_friends_pending: 11 songs (4L + 4A + 3D), 0 follows → rating steps done, friend step
    # not. Drives the setup card's friends-pending state (glowing ticks + avatar cluster, no CTA).
    "seed_friends_pending": (
        RankingSeedSpec(9_000_001, "like", 1),
        RankingSeedSpec(9_000_002, "like", 2),
        RankingSeedSpec(9_000_003, "like", 3),
        RankingSeedSpec(9_000_004, "like", 4),
        RankingSeedSpec(9_000_005, "alright", 1),
        RankingSeedSpec(9_000_006, "alright", 2),
        RankingSeedSpec(9_000_007, "alright", 3),
        RankingSeedSpec(9_000_008, "alright", 4),
        RankingSeedSpec(9_000_009, "dislike", 1),
        RankingSeedSpec(9_000_010, "dislike", 2),
        RankingSeedSpec(9_000_011, "dislike", 3),
    ),
    # seed_friends_first: 4 songs (2L + 1A + 1D), paired with 3 follow edges below → follow step
    # ticks while the rating steps stay mixed (step 1 done, step 2 pending); CTA remains.
    "seed_friends_first": (
        RankingSeedSpec(9_000_012, "like", 1),
        RankingSeedSpec(9_000_013, "like", 2),
        RankingSeedSpec(9_000_014, "alright", 1),
        RankingSeedSpec(9_000_015, "dislike", 1),
    ),
    # seed_locked_full: 6 songs (2L + 2A + 2D) → clears the module rated gate (≥5). Paired with 3
    # follows of inactive, non-mutual users below so the full-size unlocked section renders while
    # every module card stays in its locked placeholder.
    "seed_locked_full": (
        RankingSeedSpec(9_000_017, "like", 1),
        RankingSeedSpec(9_000_018, "like", 2),
        RankingSeedSpec(9_000_019, "alright", 1),
        RankingSeedSpec(9_000_020, "alright", 2),
        RankingSeedSpec(9_000_021, "dislike", 1),
        RankingSeedSpec(9_000_022, "dislike", 2),
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
    # seed_cosign follows both disc accounts (9_000_031 co-signs, min_count=2) PLUS power and
    # friend, whose mirrored like buckets score 9_000_001/003/005/007 at >= 9.0. seed_cosign has
    # rated none of those, so it sees a FIVE-card co-sign carousel — including 9_000_001 with
    # THREE contributors (power + friend + disc_a) for the stacked-chip state. All four follows
    # are one-way (nobody follows seed_cosign back), so circle_size stays 0 and the trending /
    # most-rated cards keep their honest locked state.
    ("seed_cosign", "demo_disc_a"),
    ("seed_cosign", "demo_disc_b"),
    ("seed_cosign", "demo_power"),
    ("seed_cosign", "demo_friend"),
    # seed_graduated: 3 follows so the "Follow 3 friends" setup step clears and the checklist
    # card fully graduates (it now gates on follows too, not just the 10-rating count).
    ("seed_graduated", "demo_disc_a"),
    ("seed_graduated", "demo_disc_b"),
    ("seed_graduated", "demo_friend"),
    # seed_friends_first: friends done before rating — 3 follows with only 4 ratings, so the
    # follow step is ticked while the rating steps are still in progress.
    ("seed_friends_first", "demo_disc_a"),
    ("seed_friends_first", "demo_disc_b"),
    ("seed_friends_first", "demo_friend"),
    # seed_locked_full: 3 follows that open the module gate but generate no module data — none
    # follow back (0 mutual friends → Consensus/Disagreement locked), none have rating events
    # (→ Recent Verdict / Re-rate Radar locked) or comparisons (→ Match Moment / Split locked),
    # and disc_a/disc_b agree on their only shared song (→ no Split). Everything stays locked.
    ("seed_locked_full", "demo_empty"),
    ("seed_locked_full", "demo_disc_a"),
    ("seed_locked_full", "demo_disc_b"),
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
    # seed_locked_full's own verdicts so its Feed is populated (not the empty-welcome layout)
    # while every module card above stays locked. Own events never become the hero (the hero
    # excludes the viewer), so Recent Verdict stays locked too.
    *_feed_events(
        "seed_locked_full",
        (
            RatingEventSeedSpec(9_000_017, "like", 1, 1.0),
            RatingEventSeedSpec(9_000_019, "alright", 1, 3.0),
        ),
    ),
    *_feed_events(
        "demo_power",
        (
            RatingEventSeedSpec(9_000_009, "like", 5, 7.0),
            # Two more demo_power verdicts so its own activity has variety and there are
            # multiple distinct activity cards for the seeded "liked your rating" notifications.
            RatingEventSeedSpec(9_000_001, "like", 1, 30.0),
            RatingEventSeedSpec(9_000_012, "alright", 1, 52.0),
        ),
    ),
)

# Re-rate events (a friend moved a score) so demo_power's Re-rate Radar module has a live card.
# demo_power follows demo_friend (public), who ranks 9_000_009 as ("like", 5); the event records an
# upward move from "alright" to that current "like" placement, so the delta reads as a real bump.
RERATE_EVENT_SPECS: tuple[tuple[str, RerateEventSeedSpec], ...] = (
    ("demo_friend", RerateEventSeedSpec(9_000_009, "alright", 5.4, "like", 5, 0.4)),
)

# In-app notifications demo_power has received, so the header bell has an unread badge and the
# Notifications list shows both kinds with a realistic read/unread + recency spread. Likes target
# demo_power's own seeded rating events (see the demo_power FEED_EVENT_SPECS above); each like also
# seeds the underlying Like row so the activity card shows the count and likers list. Actors are all
# visible to demo_power (public, or friends-only with a mutual follow); demo_blocked is omitted on
# purpose. The three most recent are unread (badge = 3).
POWER_NOTIFICATION_SPECS: tuple[NotificationSeedSpec, ...] = (
    NotificationSeedSpec("like", "demo_friend", 9_000_009, 0.1, False),
    NotificationSeedSpec("follow", "demo_disc_a", None, 0.4, False),
    NotificationSeedSpec("like", "demo_opposite", 9_000_009, 1.5, False),
    NotificationSeedSpec("follow", "demo_friend", None, 5.0, True),
    NotificationSeedSpec("like", "demo_feed", 9_000_001, 9.0, True),
    NotificationSeedSpec("follow", "demo_opposite", None, 26.0, True),
    NotificationSeedSpec("like", "demo_friends_only", 9_000_012, 31.0, True),
    NotificationSeedSpec("follow", "demo_feed", None, 50.0, True),
    NotificationSeedSpec("follow", "demo_friends_only", None, 73.0, True),
)

COMPARISON_SPECS_BY_USERNAME: dict[str, tuple[ComparisonSeedSpec, ...]] = {
    "demo_power": (
        ComparisonSeedSpec("power-like-1", 9_000_003, 9_000_009, 9_000_003, "like", 1, 1450, 0.75),
        ComparisonSeedSpec("power-like-1", 9_000_003, 9_000_005, 9_000_003, "like", 2, 2300, 0.75),
        ComparisonSeedSpec("power-okay-1", 9_000_012, 9_000_014, 9_000_012, "alright", 1, None, 26.0),
        ComparisonSeedSpec("power-dislike-1", 9_000_016, 9_000_008, 9_000_008, "dislike", 1, 890, 74.0),
        ComparisonSeedSpec("power-like-older", 9_000_010, 9_000_017, 9_000_010, "like", 1, 4100, 170.0),
    ),
    # demo_power follows demo_feed (public), so demo_feed's most recent finalized pick fills
    # demo_power's Feed "Match Moment" card. Two comparisons share one session; the module dedupes
    # to the decisive last one (index 2) — winner 9_000_002 over loser 9_000_006 — and the fast
    # 1.1s decision drives the "snap pick" flourish.
    "demo_feed": (
        ComparisonSeedSpec("feed-match-1", 9_000_002, 9_000_004, 9_000_002, "like", 1, 1600, 0.5),
        ComparisonSeedSpec("feed-match-1", 9_000_002, 9_000_006, 9_000_002, "like", 2, 1100, 0.5),
    ),
}

COMPATIBILITY_PAIRS: tuple[tuple[str, str], ...] = (
    ("demo_power", "demo_friend"),
    ("demo_power", "demo_opposite"),
)


def _apple_song(
    deezer_id: int,
    title: str,
    artist: str,
    album: str,
    cover_url: str,
    genre_deezer: str,
    apple_track_id: str,
    apple_artist_id: str,
    apple_album_id: str,
    apple_view_url: str,
    preview_available: bool = True,
) -> dict[str, object]:
    """Build an Apple-backed seed row while keeping the old fixture id stable."""
    return {
        "deezer_id": deezer_id,
        "title": title,
        "artist": artist,
        "album": album,
        "cover_url": cover_url,
        "genre_deezer": genre_deezer,
        "preview_url": None,
        "apple_track_id": apple_track_id,
        "apple_artist_id": apple_artist_id,
        "apple_album_id": apple_album_id,
        "apple_view_url": apple_view_url,
        "artwork_url": cover_url,
        "preview_available": preview_available,
    }


SONG_CATALOG: tuple[dict[str, object], ...] = (
    _apple_song(
        SMOKE_DEMO_DEEZER_ID,
        "Smoke",
        "Skrillex, ISOxo, Cristale & TeeZandos",
        "Smoke - Single",
        SMOKE_APPLE_ARTWORK_URL,
        "Electronic",
        SMOKE_APPLE_TRACK_ID,
        "356545647",
        "1895874910",
        SMOKE_APPLE_VIEW_URL,
    ),
    _apple_song(
        9_000_002,
        "Pink + White",
        "Frank Ocean",
        "Blonde",
        "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/bb/45/68/"
        "bb4568f3-68cd-619d-fbcb-4e179916545d/BlondCover-Final.jpg/600x600bb.jpg",
        "Pop",
        "1146195714",
        "442122051",
        "1146195596",
        "https://music.apple.com/us/album/pink-white/1146195596?i=1146195714&uo=4",
    ),
    _apple_song(
        9_000_003,
        "HUMBLE.",
        "Kendrick Lamar",
        "DAMN.",
        "https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/ab/16/ef/"
        "ab16efe9-e7f1-66ec-021c-5592a23f0f9e/17UMGIM88793.rgb.jpg/600x600bb.jpg",
        "Hip-Hop/Rap",
        "1440882165",
        "368183298",
        "1440881722",
        "https://music.apple.com/us/album/humble/1440881722?i=1440882165&uo=4",
    ),
    _apple_song(
        9_000_004,
        "Cruel Summer",
        "Taylor Swift",
        "Lover",
        "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/49/3d/ab/"
        "493dab54-f920-9043-6181-80993b8116c9/19UMGIM53909.rgb.jpg/600x600bb.jpg",
        "Pop",
        "1468058171",
        "159260351",
        "1468058165",
        "https://music.apple.com/us/album/cruel-summer/1468058165?i=1468058171&uo=4",
    ),
    _apple_song(
        9_000_005,
        "Skinny Love",
        "Bon Iver",
        "For Emma, Forever Ago",
        "https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/21/2f/ea/"
        "212fea18-5fdc-ba4d-5dd7-1b07aaa88b67/656605211565.tif/600x600bb.jpg",
        "Alternative",
        "947059829",
        "273428126",
        "947059824",
        "https://music.apple.com/us/album/skinny-love/947059824?i=947059829&uo=4",
    ),
    _apple_song(
        9_000_006,
        "Good Days",
        "SZA",
        "SOS",
        "https://is1-ssl.mzstatic.com/image/thumb/Music122/v4/62/93/13/"
        "6293132e-20ff-67ab-3d1f-96bb6797a6ba/196589564955.jpg/600x600bb.jpg",
        "R&B/Soul",
        "1658650802",
        "605800394",
        "1658650093",
        "https://music.apple.com/us/album/good-days/1658650093?i=1658650802&uo=4",
    ),
    _apple_song(
        9_000_007,
        "Super Shy",
        "NewJeans",
        "NewJeans 'Super Shy' - Single",
        "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/63/e5/e2/"
        "63e5e2e4-829b-924d-a1dc-8058a1d69bd4/196922462702_Cover.jpg/600x600bb.jpg",
        "K-Pop",
        "1692686518",
        "1635469693",
        "1692686264",
        "https://music.apple.com/us/album/super-shy/1692686264?i=1692686518&uo=4",
    ),
    _apple_song(
        9_000_008,
        "Not Like Us",
        "Kendrick Lamar",
        "Not Like Us - Single",
        "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/31/3a/3f/"
        "313a3fbc-bb8f-80c7-b5a2-e226869a38cd/24UMGIM51924.rgb.jpg/600x600bb.jpg",
        "Hip-Hop/Rap",
        "1781353929",
        "368183298",
        "1781353928",
        "https://music.apple.com/us/album/not-like-us/1781353928?i=1781353929&uo=4",
    ),
    _apple_song(
        9_000_009,
        "Kill Bill",
        "SZA",
        "SOS",
        "https://is1-ssl.mzstatic.com/image/thumb/Music122/v4/bd/3b/a9/"
        "bd3ba9fb-9609-144f-bcfe-ead67b5f6ab3/196589564931.jpg/600x600bb.jpg",
        "R&B/Soul",
        "1657869393",
        "605800394",
        "1657869377",
        "https://music.apple.com/us/album/kill-bill/1657869377?i=1657869393&uo=4",
    ),
    _apple_song(
        9_000_010,
        "Anti-Hero",
        "Taylor Swift",
        "Midnights",
        "https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/3d/01/f2/"
        "3d01f2e5-5a08-835f-3d30-d031720b2b80/22UM1IM07364.rgb.jpg/600x600bb.jpg",
        "Pop",
        "1649434293",
        "159260351",
        "1649434004",
        "https://music.apple.com/us/album/anti-hero/1649434004?i=1649434293&uo=4",
    ),
    _apple_song(
        9_000_011,
        "Bad Habit",
        "Steve Lacy",
        "Gemini Rights",
        "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/41/cf/77/"
        "41cf7744-535f-3679-0ca6-c1b8d3f98c8f/196874557266.jpg/600x600bb.jpg",
        "R&B/Soul",
        "6788150545",
        "1210275020",
        "6788150539",
        "https://music.apple.com/us/album/bad-habit/6788150539?i=6788150545&uo=4",
    ),
    _apple_song(
        9_000_012,
        "Blinding Lights",
        "The Weeknd",
        "Blinding Lights - Single",
        "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/a6/6e/bf/"
        "a66ebf79-5008-8948-b352-a790fc87446b/19UM1IM04638.rgb.jpg/600x600bb.jpg",
        "R&B/Soul",
        "1488408568",
        "479756766",
        "1488408555",
        "https://music.apple.com/us/album/blinding-lights/1488408555?i=1488408568&uo=4",
    ),
    _apple_song(
        9_000_013,
        "Get Lucky",
        "Daft Punk, Pharrell Williams & Nile Rodgers",
        "Random Access Memories",
        "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/e8/43/5f/"
        "e8435ffa-b6b9-b171-40ab-4ff3959ab661/886443919266.jpg/600x600bb.jpg",
        "Pop",
        "617154366",
        "5468295",
        "617154241",
        "https://music.apple.com/us/album/get-lucky/617154241?i=617154366&uo=4",
    ),
    _apple_song(
        9_000_014,
        "Midnight City",
        "M83",
        "Hurry Up, We're Dreaming",
        "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/cb/7b/a9/"
        "cb7ba903-b5f1-cc21-90db-7a81b7aa0997/724596951057.jpg/600x600bb.jpg",
        "Electronic",
        "828259377",
        "46086389",
        "828259375",
        "https://music.apple.com/us/album/midnight-city/828259375?i=828259377&uo=4",
    ),
    _apple_song(
        9_000_015,
        "Dreams",
        "Fleetwood Mac",
        "Greatest Hits",
        "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/d2/48/f4/"
        "d248f4ae-a7e4-a48e-1588-6617de3e8d76/mzi.izeorbmm.jpg/600x600bb.jpg",
        "Rock",
        "202272624",
        "158038",
        "202271826",
        "https://music.apple.com/us/album/dreams/202271826?i=202272624&uo=4",
    ),
    _apple_song(
        9_000_016,
        "Everlong",
        "Foo Fighters",
        "The Colour And The Shape",
        "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/68/f5/86/"
        "68f586ca-a375-9965-a864-9e227e77ef5b/884977570328.jpg/600x600bb.jpg",
        "Rock",
        "362133505",
        "6906197",
        "362133451",
        "https://music.apple.com/us/album/everlong/362133451?i=362133505&uo=4",
    ),
    _apple_song(
        9_000_017,
        "Royals",
        "Lorde",
        "The Love Club EP",
        "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/b9/e2/d0/"
        "b9e2d0af-8ce2-e078-d4e2-eccf24d7e206/12UMGIM55707.rgb.jpg/600x600bb.jpg",
        "Alternative",
        "1594982922",
        "602767352",
        "1594982748",
        "https://music.apple.com/us/album/royals/1594982748?i=1594982922&uo=4",
    ),
    _apple_song(
        9_000_018,
        "This Is America",
        "Childish Gambino",
        "This Is America - Single",
        "https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/f7/a4/ee/"
        "f7a4ee19-086e-7aba-ea4d-c36be6ea69d4/886447095850.jpg/600x600bb.jpg",
        "Hip-Hop/Rap",
        "1379065464",
        "466842536",
        "1379065454",
        "https://music.apple.com/us/album/this-is-america/1379065454?i=1379065464&uo=4",
    ),
    _apple_song(
        9_000_019,
        "Latch (feat. Sam Smith)",
        "Disclosure",
        "The Singles - EP",
        "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/71/ed/a0/"
        "71eda00a-4017-94a7-f6ee-e6a965458fd7/13UMGIM28546.rgb.jpg/600x600bb.jpg",
        "Electronic",
        "1471695442",
        "520848228",
        "1471695436",
        "https://music.apple.com/us/album/latch-feat-sam-smith/1471695436?i=1471695442&uo=4",
    ),
    _apple_song(
        9_000_020,
        "Sweet Disposition",
        "The Temper Trap",
        "(500) Days of Summer (Music from the Motion Picture)",
        "https://is1-ssl.mzstatic.com/image/thumb/Features/fc/78/d1/dj.ktqhcjke.jpg/600x600bb.jpg",
        "Soundtrack",
        "321980767",
        "202033981",
        "321980590",
        "https://music.apple.com/us/album/sweet-disposition/321980590?i=321980767&uo=4",
    ),
    _apple_song(
        9_000_021,
        "Heat Waves",
        "Glass Animals",
        "Dreamland",
        "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/da/8b/77/"
        "da8b7731-6f4f-eacf-5e74-8b23389eefa1/20UMGIM03371.rgb.jpg/600x600bb.jpg",
        "Alternative",
        "1508562516",
        "528928008",
        "1508562310",
        "https://music.apple.com/us/album/heat-waves/1508562310?i=1508562516&uo=4",
    ),
    _apple_song(
        9_000_022,
        "As It Was",
        "Harry Styles",
        "Harry's House",
        "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/2a/19/fb/"
        "2a19fb85-2f70-9e44-f2a9-82abe679b88e/886449990061.jpg/600x600bb.jpg",
        "Pop",
        "1615585008",
        "471260289",
        "1615584999",
        "https://music.apple.com/us/album/as-it-was/1615584999?i=1615585008&uo=4",
    ),
    _apple_song(
        9_000_023,
        "Levitating",
        "Dua Lipa",
        "Future Nostalgia",
        "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/6c/11/d6/"
        "6c11d681-aa3a-d59e-4c2e-f77e181026ab/190295092665.jpg/600x600bb.jpg",
        "Pop",
        "1538003843",
        "1031397873",
        "1538003494",
        "https://music.apple.com/us/album/levitating/1538003494?i=1538003843&uo=4",
    ),
    _apple_song(
        9_000_024,
        "Motion Sickness",
        "Phoebe Bridgers",
        "Stranger in the Alps",
        "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/20/4c/6e/"
        "204c6ef3-8e95-4cee-2256-202ca62aebed/60220.jpg/600x600bb.jpg",
        "Alternative",
        "1256607810",
        "697833299",
        "1256607808",
        "https://music.apple.com/us/album/motion-sickness/1256607808?i=1256607810&uo=4",
    ),
    _apple_song(
        9_000_025,
        "Kyoto",
        "Phoebe Bridgers",
        "Punisher",
        "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/39/91/4f/"
        "39914f60-e9aa-4ae9-3962-44b0a5e5d570/656605150062.jpg/600x600bb.jpg",
        "Alternative",
        "1504699860",
        "697833299",
        "1504699857",
        "https://music.apple.com/us/album/kyoto/1504699857?i=1504699860&uo=4",
    ),
    _apple_song(
        9_000_026,
        "Electric Feel",
        "MGMT",
        "Oracular Spectacular",
        "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/72/f3/ed/"
        "72f3edba-cbb0-4887-bb89-4aedf97ecd12/888880287779.jpg/600x600bb.jpg",
        "Alternative",
        "264720106",
        "251553551",
        "264720008",
        "https://music.apple.com/us/album/electric-feel/264720008?i=264720106&uo=4",
    ),
    _apple_song(
        9_000_027,
        "Ribs",
        "Lorde",
        "Pure Heroine",
        "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/96/a5/09/"
        "96a50916-169b-724c-b722-b8c474406352/13UAAIM68691.rgb.jpg/600x600bb.jpg",
        "Alternative",
        "1440818666",
        "602767352",
        "1440818584",
        "https://music.apple.com/us/album/ribs/1440818584?i=1440818666&uo=4",
    ),
    _apple_song(
        9_000_028,
        "Mr. Brightside",
        "The Killers",
        "Direct Hits",
        "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/11/64/9c/"
        "11649c80-2066-dba8-77a9-df7eecae26c1/17UM1IM06937.rgb.jpg/600x600bb.jpg",
        "Rock",
        "1440891171",
        "6483093",
        "1440891166",
        "https://music.apple.com/us/album/mr-brightside/1440891166?i=1440891171&uo=4",
    ),
    _apple_song(
        9_000_029,
        "Time to Pretend",
        "MGMT",
        "Oracular Spectacular",
        "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/e5/06/cc/"
        "e506ccd5-56ec-3d4c-69f7-14900bea74f0/mzi.bbgsikee.jpg/600x600bb.jpg",
        "Alternative",
        "273519673",
        "251553551",
        "273519664",
        "https://music.apple.com/us/album/time-to-pretend/273519664?i=273519673&uo=4",
    ),
    _apple_song(
        9_000_030,
        "Oblivion",
        "Grimes",
        "Visions",
        "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/5e/07/53/"
        "5e0753c1-f3fb-e464-908f-8efc0a249b9b/652637320886.png/600x600bb.jpg",
        "Electronic",
        "499875050",
        "2756920",
        "499874506",
        "https://music.apple.com/us/album/oblivion/499874506?i=499875050&uo=4",
    ),
    _apple_song(
        9_000_031,
        "Archie, Marry Me",
        "Alvvays",
        "Alvvays",
        "https://is1-ssl.mzstatic.com/image/thumb/Music122/v4/90/78/52/"
        "907852ec-15c8-c6cb-c810-6912dd18577d/644110028297.png/600x600bb.jpg",
        "Alternative",
        "1651310198",
        "730606893",
        "1651310191",
        "https://music.apple.com/us/album/archie-marry-me/1651310191?i=1651310198&uo=4",
    ),
    _apple_song(
        9_000_032,
        "good 4 u",
        "Olivia Rodrigo",
        "SOUR (Video Version)",
        "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/76/46/48/"
        "76464884-0e9c-1951-a3f6-ce02f74c2b19/21UMGIM26093.rgb.jpg/600x600bb.jpg",
        "Pop",
        "1582277652",
        "979458609",
        "1582277315",
        "https://music.apple.com/us/album/good-4-u/1582277315?i=1582277652&uo=4",
    ),
    _apple_song(
        9_000_033,
        "XS",
        "Rina Sawayama",
        "SAWAYAMA",
        "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/b8/da/9c/"
        "b8da9cab-3c87-0d86-9548-5b7d15156eca/192641421341_Cover.jpg/600x600bb.jpg",
        "Alternative",
        "1493469443",
        "638343826",
        "1493469433",
        "https://music.apple.com/us/album/xs/1493469433?i=1493469443&uo=4",
    ),
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


@dataclass(frozen=True)
class StreakSeedSpec:
    """A demo user's weekly rating streak to display on the profile streak UI."""

    username: str
    current_streak: int
    longest_streak: int


# Weekly streaks for manual testing of the profile streak UI:
# - demo_power has a long active streak (own-profile chip + detail modal).
# - demo_friend is public, so it is visible to demo_power and exercises the
#   other-profile streak badge + popover.
STREAK_SPECS: tuple[StreakSeedSpec, ...] = (
    StreakSeedSpec("demo_power", 7, 12),
    StreakSeedSpec("demo_friend", 4, 4),
)


def streak_dates(current_streak: int) -> tuple[date, date]:
    """Return (anchor_date, last_active_date) for a streak that is alive this week.

    last_active_date is today so the read-time decay keeps the streak active
    (gap 0); anchor_date is placed so the current run spans `current_streak`
    personal weeks. Mirrors how services/streak.py stores local dates.
    """
    today = datetime.now(timezone.utc).date()
    anchor = today - timedelta(days=7 * max(current_streak - 1, 0))
    return anchor, today
