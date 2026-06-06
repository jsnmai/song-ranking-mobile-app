"""
Dev-only demo seed for local frontend edge-case testing.

Usage (from backend/):
    ALLOW_DEV_SEED=1 uv run python scripts/seed_dev_demo.py
"""
from __future__ import annotations

import logging
import os
import sys
import uuid
from pathlib import Path

# Allow `uv run python scripts/seed_dev_demo.py` from backend/ (sys.path[0] is scripts/).
_BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))
from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.parse import urlparse

from sqlalchemy import delete, select
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm import Session

import src.sqlalchemy_tables.block  # noqa: F401

# Register all ORM models before any delete/insert touches metadata.
import src.sqlalchemy_tables.comparison  # noqa: F401
import src.sqlalchemy_tables.follow  # noqa: F401
import src.sqlalchemy_tables.profile  # noqa: F401
import src.sqlalchemy_tables.ranking  # noqa: F401
import src.sqlalchemy_tables.rating_event  # noqa: F401
import src.sqlalchemy_tables.song  # noqa: F401
import src.sqlalchemy_tables.user  # noqa: F401
import src.sqlalchemy_tables.user_similarity_snapshot  # noqa: F401
from scripts.demo_seed_data import (
    ALGORITHM_VERSION,
    ALLOWED_DB_HOSTS,
    ALLOWED_DB_NAMES,
    BLOCK_EDGES,
    COMPARISON_SPECS_BY_USERNAME,
    COMPATIBILITY_PAIRS,
    DEMO_ACCOUNTS,
    DEMO_EMAIL_DOMAIN,
    DEMO_PASSWORD,
    DEMO_USERNAMES,
    FEED_EVENT_SPECS,
    FOLLOW_EDGES,
    LEGACY_DEMO_EMAIL_DOMAINS,
    PRODUCTION_URL_DENYLIST,
    RANKINGS_BY_USERNAME,
    SONG_CATALOG,
    RankingSeedSpec,
    event_created_at,
    feed_anchor_now,
)
from src.core.config import settings
from src.core.security import hash_password
from src.crud.profile import get_by_user_id
from src.crud.similarity import upsert_snapshot
from src.crud.song import recompute_song_aggregates, upsert_from_deezer
from src.crud.user import create_user_with_profile, get_by_email
from src.db.session import SessionLocal
from src.pydantic_schemas.song import SongCreate
from src.services.rating import BUCKET_SCORE_RANGES
from src.services.similarity import get_algorithm
from src.services.similarity_tasks import _resolve_genre
from src.sqlalchemy_tables.block import Block
from src.sqlalchemy_tables.comparison import Comparison
from src.sqlalchemy_tables.follow import Follow
from src.sqlalchemy_tables.profile import Profile
from src.sqlalchemy_tables.ranking import Ranking
from src.sqlalchemy_tables.rating_event import RatingEvent
from src.sqlalchemy_tables.song import Song
from src.sqlalchemy_tables.user import User
from src.sqlalchemy_tables.user_similarity_snapshot import UserSimilaritySnapshot

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SeedResult:
    """Summary returned after a successful seed run."""

    user_ids_by_username: dict[str, int]
    power_friend_similarity: float
    power_opposite_similarity: float


class SeedAbortedError(RuntimeError):
    """Raised when production guards or compatibility asserts fail."""


REQUIRED_TABLE_COLUMNS = {
    "blocks": {"id", "blocker_id", "blocked_id"},
    "profiles": {"visibility"},
    "users": {"age_verified_13_plus", "age_verified_at", "age_gate_version"},
}


def calculate_score(
    bucket: str,
    position: int,
    total: int,
) -> float:
    """Mirror production bucket-relative score calculation."""
    score_range = BUCKET_SCORE_RANGES[bucket]
    if total <= 1:
        return score_range["midpoint"]

    t_value = (position - 1) / max(total - 1, 1)
    score = score_range["max"] - (score_range["max"] - score_range["min"]) * t_value
    return round(max(score, score_range["min"]), 4)


def assert_seed_environment() -> None:
    """Refuse to run unless every production guard passes."""
    if os.environ.get("ALLOW_DEV_SEED") != "1":
        raise SeedAbortedError(
            "Refusing to seed: set ALLOW_DEV_SEED=1 to run this script in local dev only.",
        )

    assert_safe_database_url(settings.database_url)

    for account in DEMO_ACCOUNTS:
        if not account.email.endswith(DEMO_EMAIL_DOMAIN):
            raise SeedAbortedError(f"Demo account email must use {DEMO_EMAIL_DOMAIN}: {account.email}")


def assert_safe_database_url(database_url: str) -> None:
    """Block production-like database URLs."""
    lowered = database_url.lower()
    for fragment in PRODUCTION_URL_DENYLIST:
        if fragment in lowered:
            raise SeedAbortedError(
                f"Refusing to seed: DATABASE_URL matches production denylist fragment {fragment!r}.",
            )

    parsed = urlparse(database_url)
    host = (parsed.hostname or "").lower()
    db_name = parsed.path.lstrip("/").split("?")[0]

    if host not in ALLOWED_DB_HOSTS:
        raise SeedAbortedError(
            f"Refusing to seed: database host {host!r} is not in allowlist {sorted(ALLOWED_DB_HOSTS)}.",
        )
    if db_name not in ALLOWED_DB_NAMES:
        raise SeedAbortedError(
            f"Refusing to seed: database name {db_name!r} is not in allowlist {sorted(ALLOWED_DB_NAMES)}.",
        )


def assert_required_schema(db: Session) -> None:
    """Fail clearly when local migrations have not been applied before seeding."""
    if db.bind is None:
        raise SeedAbortedError("Refusing to seed: database session is not bound to an engine.")

    inspector = sa_inspect(db.bind)
    table_names = set(inspector.get_table_names())
    missing_tables = sorted(set(REQUIRED_TABLE_COLUMNS) - table_names)
    missing_columns: list[str] = []

    for table_name, required_columns in REQUIRED_TABLE_COLUMNS.items():
        if table_name not in table_names:
            continue
        existing_columns = {column["name"] for column in inspector.get_columns(table_name)}
        for column_name in sorted(required_columns - existing_columns):
            missing_columns.append(f"{table_name}.{column_name}")

    if missing_tables or missing_columns:
        missing_parts = []
        if missing_tables:
            missing_parts.append(f"tables: {', '.join(missing_tables)}")
        if missing_columns:
            missing_parts.append(f"columns: {', '.join(missing_columns)}")
        raise SeedAbortedError(
            "Refusing to seed: database schema is missing "
            + "; ".join(missing_parts)
            + ". Run `uv run alembic upgrade head` from backend, then rerun the seed.",
        )


def _scores_for_specs(
    specs: tuple[RankingSeedSpec, ...],
) -> dict[tuple[int, str], float]:
    """Return {(deezer_id, bucket): score} after bucket-local compaction."""
    totals_by_bucket: dict[str, int] = {}
    for spec in specs:
        totals_by_bucket[spec.bucket] = totals_by_bucket.get(spec.bucket, 0) + 1

    scores: dict[tuple[int, str], float] = {}
    for spec in specs:
        total = totals_by_bucket[spec.bucket]
        scores[(spec.deezer_id, spec.bucket)] = calculate_score(
            spec.bucket,
            spec.position,
            total,
        )
    return scores


def upsert_demo_users(
    db: Session,
) -> dict[str, int]:
    """Create or refresh demo users and profiles; return username -> user_id."""
    user_ids: dict[str, int] = {}
    hashed = hash_password(DEMO_PASSWORD)

    for account in DEMO_ACCOUNTS:
        user = get_by_email(db, account.email)
        if user is None:
            user = create_user_with_profile(
                db,
                email=account.email,
                hashed_password=hashed,
                username=account.username,
                display_name=account.display_name,
                age_verified_13_plus=True,
                age_verified_at=datetime.now(timezone.utc),
                age_gate_version="dev-seed-13-plus-v1",
            )
            profile = get_by_user_id(db, user.id)
            if profile is None:
                raise SeedAbortedError(f"Demo user {account.email} was created without a profile.")
        else:
            user.hashed_password = hashed
            user.age_verified_13_plus = True
            user.age_verified_at = user.age_verified_at or datetime.now(timezone.utc)
            user.age_gate_version = user.age_gate_version or "dev-seed-13-plus-v1"
            profile = get_by_user_id(db, user.id)
            if profile is None:
                raise SeedAbortedError(f"Demo user {account.email} exists without a profile.")

        profile.display_name = account.display_name
        profile.is_public = account.is_public
        profile.visibility = account.visibility

        user_ids[account.username] = user.id

    db.flush()
    return user_ids


def is_legacy_demo_email(email: str) -> bool:
    """True only for known demo usernames or email locals on retired demo domains."""
    if email.endswith(DEMO_EMAIL_DOMAIN):
        local = email[: -len(DEMO_EMAIL_DOMAIN)]
        return local in DEMO_USERNAMES

    for domain in LEGACY_DEMO_EMAIL_DOMAINS:
        if not email.endswith(domain):
            continue
        local = email[: -len(domain)]
        return local in DEMO_USERNAMES or f"demo_{local}" in DEMO_USERNAMES
    return False


def find_legacy_demo_user_ids(db: Session) -> list[int]:
    """Return user IDs for legacy demo accounts, if any exist."""
    rows = []
    rows.extend(
        db.execute(
            select(User.id, User.email).where(User.email.like(f"%{DEMO_EMAIL_DOMAIN}")),
        ).all(),
    )
    for domain in LEGACY_DEMO_EMAIL_DOMAINS:
        rows.extend(
            db.execute(
                select(User.id, User.email).where(User.email.like(f"%{domain}")),
            ).all(),
        )
    return [row.id for row in rows if is_legacy_demo_email(row.email)]


def purge_legacy_demo_users(db: Session) -> None:
    """Remove retired @listn.test demo users without touching other accounts."""
    legacy_user_ids = find_legacy_demo_user_ids(db)
    if not legacy_user_ids:
        return

    logger.info(
        "Removing %d legacy demo users on %s",
        len(legacy_user_ids),
        ", ".join(LEGACY_DEMO_EMAIL_DOMAINS),
    )
    clear_demo_scoped_rows(db, legacy_user_ids)
    db.execute(delete(Profile).where(Profile.user_id.in_(legacy_user_ids)))
    db.execute(delete(User).where(User.id.in_(legacy_user_ids)))
    db.flush()


def clear_demo_scoped_rows(
    db: Session,
    demo_user_ids: list[int],
) -> None:
    """Delete demo-owned rows so a re-run yields the same logical graph."""
    if not demo_user_ids:
        return

    db.execute(delete(RatingEvent).where(RatingEvent.user_id.in_(demo_user_ids)))
    db.execute(delete(Comparison).where(Comparison.user_id.in_(demo_user_ids)))
    db.execute(delete(Ranking).where(Ranking.user_id.in_(demo_user_ids)))
    db.execute(
        delete(Block).where(
            Block.blocker_id.in_(demo_user_ids) | Block.blocked_id.in_(demo_user_ids),
        ),
    )
    db.execute(
        delete(UserSimilaritySnapshot).where(
            UserSimilaritySnapshot.user_a_id.in_(demo_user_ids)
            | UserSimilaritySnapshot.user_b_id.in_(demo_user_ids),
        ),
    )
    db.execute(
        delete(Follow).where(
            Follow.follower_id.in_(demo_user_ids) | Follow.following_id.in_(demo_user_ids),
        ),
    )
    db.flush()


def seed_songs(
    db: Session,
) -> dict[int, int]:
    """Upsert catalog songs; return deezer_id -> song.id."""
    song_ids: dict[int, int] = {}
    for entry in SONG_CATALOG:
        deezer_id = int(entry["deezer_id"])
        payload = SongCreate(
            deezer_id=deezer_id,
            isrc=None,
            title=str(entry["title"]),
            artist=str(entry["artist"]),
            artist_deezer_id=900_000 + (deezer_id % 100),
            album=str(entry["album"]),
            cover_url=f"https://example.com/demo-cover-{deezer_id}.jpg",
            preview_url=(
                None
                if entry["preview_url"] is None
                else str(entry["preview_url"])
            ),
            genre_deezer=str(entry["genre_deezer"]),
        )
        song = upsert_from_deezer(db, payload)
        song_ids[deezer_id] = song.id

    db.flush()
    return song_ids


def seed_rankings(
    db: Session,
    user_ids: dict[str, int],
    song_ids: dict[int, int],
) -> set[int]:
    """Insert rankings for every demo account; return touched internal song ids."""
    touched_song_ids: set[int] = set()

    for username, specs in RANKINGS_BY_USERNAME.items():
        user_id = user_ids[username]
        score_map = _scores_for_specs(specs)
        for spec in specs:
            song_id = song_ids[spec.deezer_id]
            score = score_map[(spec.deezer_id, spec.bucket)]
            db.add(
                Ranking(
                    user_id=user_id,
                    song_id=song_id,
                    bucket=spec.bucket,
                    position=spec.position,
                    score=score,
                ),
            )
            touched_song_ids.add(song_id)

    db.flush()
    return touched_song_ids


def seed_rating_events(
    db: Session,
    user_ids: dict[str, int],
    song_ids: dict[int, int],
    anchor: datetime,
) -> None:
    """Insert feed-visible rating events with deterministic offsets from anchor."""
    for username, spec in FEED_EVENT_SPECS:
        user_id = user_ids[username]
        song_id = song_ids[spec.deezer_id]
        specs = RANKINGS_BY_USERNAME[username]
        score_map = _scores_for_specs(specs)
        score = score_map[(spec.deezer_id, spec.bucket)]
        created_at = event_created_at(anchor, spec.hours_ago)
        db.add(
            RatingEvent(
                user_id=user_id,
                song_id=song_id,
                event_type="rated",
                previous_bucket=None,
                new_bucket=spec.bucket,
                previous_position=None,
                new_position=spec.position,
                previous_score=None,
                new_score=score,
                note=None,
                event_metadata=None,
                created_at=created_at,
            ),
        )

    db.flush()


def seed_comparisons(
    db: Session,
    user_ids: dict[str, int],
    song_ids: dict[int, int],
    anchor: datetime,
) -> None:
    """Insert deterministic finalized receipts for Versus History manual testing."""
    session_uuids: dict[str, uuid.UUID] = {}
    for username, specs in COMPARISON_SPECS_BY_USERNAME.items():
        user_id = user_ids[username]
        for spec in specs:
            session_uuid = session_uuids.setdefault(
                spec.session_key,
                uuid.uuid5(uuid.NAMESPACE_URL, f"listn-demo:{username}:{spec.session_key}"),
            )
            finalized_at = event_created_at(anchor, spec.hours_ago)
            db.add(
                Comparison(
                    session_uuid=session_uuid,
                    user_id=user_id,
                    song_a_id=song_ids[spec.song_a_deezer_id],
                    song_b_id=song_ids[spec.song_b_deezer_id],
                    winner_id=song_ids[spec.winner_deezer_id],
                    bucket=spec.bucket,
                    comparison_index_in_session=spec.comparison_index_in_session,
                    decision_duration_ms=spec.decision_duration_ms,
                    created_at=finalized_at,
                    finalized_at=finalized_at,
                ),
            )

    db.flush()


def seed_follows(
    db: Session,
    user_ids: dict[str, int],
) -> None:
    """Insert follow edges for the demo social graph."""
    for follower, following in FOLLOW_EDGES:
        db.add(
            Follow(
                follower_id=user_ids[follower],
                following_id=user_ids[following],
            ),
        )
    db.flush()


def seed_blocks(
    db: Session,
    user_ids: dict[str, int],
) -> None:
    """Insert block edges for privacy/blocking manual tests."""
    for blocker, blocked in BLOCK_EDGES:
        db.add(
            Block(
                blocker_id=user_ids[blocker],
                blocked_id=user_ids[blocked],
            ),
        )
    db.flush()


def seed_similarity_snapshots(
    db: Session,
    user_ids: dict[str, int],
) -> tuple[float, float]:
    """
    Compute and upsert compatibility snapshots for configured pairs.

    Returns (power_friend_score, power_opposite_score).
    """
    algorithm = get_algorithm(ALGORITHM_VERSION)
    scores: dict[str, float] = {}

    for left_name, right_name in COMPATIBILITY_PAIRS:
        left_id = user_ids[left_name]
        right_id = user_ids[right_name]
        left_rows = db.execute(
            select(Ranking, Song)
            .join(Song, Song.id == Ranking.song_id)
            .where(Ranking.user_id == left_id),
        ).all()
        right_rows = db.execute(
            select(Ranking, Song)
            .join(Song, Song.id == Ranking.song_id)
            .where(Ranking.user_id == right_id),
        ).all()

        scores_a = {row[0].song_id: row[0].score for row in left_rows}
        scores_b = {row[0].song_id: row[0].score for row in right_rows}
        genres = {
            row[0].song_id: _resolve_genre(row[1].genres_mb, row[1].genre_deezer)
            for row in left_rows
        }
        artists = {row[0].song_id: row[1].artist for row in left_rows}

        result = algorithm.compute(scores_a, scores_b, genres, artists)
        if result is None:
            raise SeedAbortedError(
                f"Similarity compute returned None for {left_name} vs {right_name}; adjust shared rankings.",
            )

        user_a_id = min(left_id, right_id)
        user_b_id = max(left_id, right_id)
        upsert_snapshot(
            db,
            user_a_id=user_a_id,
            user_b_id=user_b_id,
            algorithm_version=ALGORITHM_VERSION,
            similarity_score=result.similarity_score,
            shared_song_count=result.shared_song_count,
            score_distance_avg=result.score_distance_avg,
            shared_genres=result.shared_genres,
            shared_top_artists=result.shared_top_artists,
        )
        pair_key = f"{left_name}+{right_name}"
        scores[pair_key] = result.similarity_score
        logger.info(
            "Compatibility %s vs %s: similarity=%.4f shared=%d",
            left_name,
            right_name,
            result.similarity_score,
            result.shared_song_count,
        )

    friend_score = scores["demo_power+demo_friend"]
    opposite_score = scores["demo_power+demo_opposite"]
    if friend_score <= 0.9:
        raise SeedAbortedError(
            f"demo_power+demo_friend similarity {friend_score:.4f} is not > 0.9; adjust seed data.",
        )
    if opposite_score >= 0.5:
        raise SeedAbortedError(
            f"demo_power+demo_opposite similarity {opposite_score:.4f} is not < 0.5; adjust seed data.",
        )

    return friend_score, opposite_score


def recompute_aggregates(
    db: Session,
    song_ids: set[int],
) -> None:
    """Refresh global song stats after demo rankings are written."""
    for song_id in sorted(song_ids):
        recompute_song_aggregates(db, song_id)


def print_login_table() -> None:
    """Print demo credentials for local manual and curl testing."""
    print(f"\nDemo accounts (password: {DEMO_PASSWORD}):\n")
    print(f"{'Email':<42} {'Username'}")
    print("-" * 60)
    for account in DEMO_ACCOUNTS:
        print(f"{account.email:<42} {account.username}")
    print()


def seed_demo_data(db: Session) -> SeedResult:
    """Run the full demo seed in one transaction."""
    assert_required_schema(db)
    purge_legacy_demo_users(db)
    user_ids = upsert_demo_users(db)
    demo_user_ids = list(user_ids.values())
    clear_demo_scoped_rows(db, demo_user_ids)

    song_ids = seed_songs(db)
    touched_song_ids = seed_rankings(db, user_ids, song_ids)
    anchor = feed_anchor_now()
    seed_rating_events(db, user_ids, song_ids, anchor)
    seed_comparisons(db, user_ids, song_ids, anchor)
    seed_follows(db, user_ids)
    seed_blocks(db, user_ids)
    friend_score, opposite_score = seed_similarity_snapshots(db, user_ids)
    recompute_aggregates(db, touched_song_ids)

    db.commit()
    return SeedResult(
        user_ids_by_username=user_ids,
        power_friend_similarity=friend_score,
        power_opposite_similarity=opposite_score,
    )


def run_seed() -> SeedResult:
    """Validate environment, seed the configured database, and log results."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    assert_seed_environment()

    db = SessionLocal()
    try:
        result = seed_demo_data(db)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    logger.info(
        "Demo seed complete. power+friend=%.4f power+opposite=%.4f",
        result.power_friend_similarity,
        result.power_opposite_similarity,
    )
    print_login_table()
    return result


def main() -> None:
    """CLI entrypoint."""
    try:
        run_seed()
    except SeedAbortedError as err:
        print(f"error: {err}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
