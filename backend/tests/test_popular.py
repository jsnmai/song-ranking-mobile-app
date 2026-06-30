"""Integration tests for the global "Popular on LISTn" module.

Popular is platform-wide and anonymous: no follow/visibility wiring, every user counts, and
the same response is served to every viewer. These tests pin the locked rules: weekly mode
counts only distinct eligible raters inside the 7-day window and needs enough qualifying songs
to engage; when the week is too thin the module backfills with all-time most-rated songs and
reports window="all_time".
"""
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.core.limiter import limiter
from src.services.popular import POPULAR_MIN_ITEMS, POPULAR_MIN_RATERS_WEEK
from src.sqlalchemy_tables.profile import Profile
from src.sqlalchemy_tables.ranking import Ranking
from src.sqlalchemy_tables.rating_event import RatingEvent
from src.sqlalchemy_tables.song import Song

POPULAR_PATH = "/api/v1/discover/popular"


def _register(
    client: TestClient,
    email: str,
    username: str,
) -> str:
    """Register one test user and return their token."""
    limiter._storage.reset()
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "password123",
            "birthdate": "2000-01-01",
            "display_name": username.title(),
            "username": username,
        },
    )
    assert response.status_code == 201
    return response.json()["access_token"]


def _user_id(
    db: Session,
    username: str,
) -> int:
    """Resolve a username to its user id for direct inserts."""
    return db.execute(
        select(Profile.user_id)
        .where(Profile.username == username)
    ).scalar_one()


def _song(
    db: Session,
    deezer_id: int,
    title: str,
    *,
    global_rating_count: int = 0,
    global_avg_score: float | None = None,
) -> Song:
    """Get or create a deterministic song, optionally seeding its all-time aggregates."""
    song = db.execute(
        select(Song)
        .where(Song.deezer_id == deezer_id)
    ).scalar_one_or_none()
    if song is None:
        song = Song(
            deezer_id=deezer_id,
            isrc=None,
            title=title,
            artist="Popular Artist",
            artist_deezer_id=789,
            album="Popular Album",
            cover_url="https://example.com/cover.jpg",
            preview_url="https://example.com/preview.mp3",
            genre_deezer=None,
            global_rating_count=global_rating_count,
            global_avg_score=global_avg_score,
        )
        db.add(song)
        db.flush()
    return song


def _rate(
    db: Session,
    username: str,
    deezer_id: int,
    title: str,
    score: float,
    bucket: str = "like",
) -> int:
    """Create current Ranking state for one user/song and return the song id."""
    song = _song(db, deezer_id, title)
    db.add(
        Ranking(
            user_id=_user_id(db, username),
            song_id=song.id,
            bucket=bucket,
            position=1,
            score=score,
        )
    )
    db.commit()
    return song.id


def _event(
    db: Session,
    username: str,
    song_id: int,
    event_type: str = "rated",
    days_ago: float = 1.0,
) -> None:
    """Insert one rating_event at a controlled age for window tests."""
    db.add(
        RatingEvent(
            user_id=_user_id(db, username),
            song_id=song_id,
            event_type=event_type,
            new_bucket="like",
            new_score=8.0,
            created_at=datetime.now(timezone.utc) - timedelta(days=days_ago),
        )
    )
    db.commit()


def _rated_in_window(
    db: Session,
    username: str,
    deezer_id: int,
    title: str,
    score: float,
    *,
    days_ago: float = 1.0,
    event_type: str = "rated",
) -> int:
    """Create a current ranking AND a matching in-window rating event for one user/song."""
    song_id = _rate(db, username, deezer_id, title, score)
    _event(db, username, song_id, event_type=event_type, days_ago=days_ago)
    return song_id


def _get(
    client: TestClient,
    token: str,
) -> dict:
    """Get the authenticated Popular response."""
    response = client.get(
        POPULAR_PATH,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    return response.json()


def _item(
    payload: dict,
    song_id: int,
) -> dict | None:
    """Return the response item for one song id, or None when omitted."""
    for item in payload["items"]:
        if item["song"]["id"] == song_id:
            return item
    return None


def _seed_weekly_floor(
    client: TestClient,
    db: Session,
) -> None:
    """Register two raters and rate POPULAR_MIN_ITEMS filler songs to engage weekly mode.

    Each filler song is rated by both users in-window, so it clears POPULAR_MIN_RATERS_WEEK and
    the module is in window="week" before a test adds its own song under inspection.
    """
    _register(client, "alice@example.com", "alice")
    _register(client, "bob@example.com", "bob")
    for offset in range(POPULAR_MIN_ITEMS):
        deezer_id = 9000 + offset
        _rated_in_window(db, "alice", deezer_id, f"Filler {offset}", 8.0)
        _rated_in_window(db, "bob", deezer_id, f"Filler {offset}", 8.0)


def test_weekly_counts_distinct_raters_and_orders_by_count(
    client: TestClient,
    db_session: Session,
):
    """A song rated by more distinct users this week ranks above one rated by fewer."""
    viewer_token = _register(client, "viewer@example.com", "viewer")
    _register(client, "carol@example.com", "carol")
    _seed_weekly_floor(client, db_session)

    # Top song: three distinct raters in-window.
    top_id = _rated_in_window(db_session, "alice", 2001, "Top Song", 8.0)
    _rated_in_window(db_session, "bob", 2001, "Top Song", 9.0)
    _rated_in_window(db_session, "carol", 2001, "Top Song", 10.0)
    # Runner-up: two distinct raters in-window.
    runner_id = _rated_in_window(db_session, "alice", 2002, "Runner Song", 7.0)
    _rated_in_window(db_session, "bob", 2002, "Runner Song", 7.0)

    payload = _get(client, viewer_token)
    assert payload["window"] == "week"
    assert payload["window_days"] == 7

    top = _item(payload, top_id)
    runner = _item(payload, runner_id)
    assert top is not None and runner is not None
    assert top["rating_count"] == 3
    assert runner["rating_count"] == 2
    ids = [item["song"]["id"] for item in payload["items"]]
    assert ids.index(top_id) < ids.index(runner_id)


def test_single_rater_song_is_excluded_from_week(
    client: TestClient,
    db_session: Session,
):
    """A song only one user rated this week is below the floor and omitted."""
    viewer_token = _register(client, "viewer@example.com", "viewer")
    _seed_weekly_floor(client, db_session)

    lonely_id = _rated_in_window(db_session, "alice", 2003, "Lonely Song", 8.0)

    payload = _get(client, viewer_token)
    assert payload["window"] == "week"
    assert POPULAR_MIN_RATERS_WEEK == 2  # guard: the assertion below assumes a floor of 2
    assert _item(payload, lonely_id) is None


def test_reratings_by_same_user_count_once(
    client: TestClient,
    db_session: Session,
):
    """A user who rerates the same song many times is still one distinct rater."""
    viewer_token = _register(client, "viewer@example.com", "viewer")
    _seed_weekly_floor(client, db_session)

    song_id = _rated_in_window(db_session, "alice", 2004, "Rerated Song", 6.0)
    _event(db_session, "alice", song_id, event_type="rerated", days_ago=0.5)
    _event(db_session, "alice", song_id, event_type="rerated", days_ago=0.2)
    _rated_in_window(db_session, "bob", 2004, "Rerated Song", 7.0)

    item = _item(_get(client, viewer_token), song_id)
    assert item is not None
    assert item["rating_count"] == 2  # alice (despite 3 events) + bob


def test_events_outside_window_do_not_count(
    client: TestClient,
    db_session: Session,
):
    """Two raters whose events are older than the window do not surface the song."""
    viewer_token = _register(client, "viewer@example.com", "viewer")
    _seed_weekly_floor(client, db_session)

    stale_id = _rated_in_window(db_session, "alice", 2005, "Stale Song", 8.0, days_ago=10.0)
    _rated_in_window(db_session, "bob", 2005, "Stale Song", 8.0, days_ago=9.0)

    payload = _get(client, viewer_token)
    assert payload["window"] == "week"
    assert _item(payload, stale_id) is None


def test_thin_week_backfills_with_all_time_most_rated(
    client: TestClient,
    db_session: Session,
):
    """Too few weekly songs to engage weekly mode, so fall back to all-time, count-ordered."""
    viewer_token = _register(client, "viewer@example.com", "viewer")

    # Only one weekly-qualifying song exists (below POPULAR_MIN_ITEMS), so weekly mode is off.
    _register(client, "alice@example.com", "alice")
    _register(client, "bob@example.com", "bob")
    _rated_in_window(db_session, "alice", 3001, "Weekly Single", 8.0)
    _rated_in_window(db_session, "bob", 3001, "Weekly Single", 8.0)

    # All-time leaders, ranked by global_rating_count.
    big_id = _song(db_session, 4001, "Big All Time", global_rating_count=500).id
    mid_id = _song(db_session, 4002, "Mid All Time", global_rating_count=120).id
    db_session.commit()

    payload = _get(client, viewer_token)
    assert payload["window"] == "all_time"
    ids = [item["song"]["id"] for item in payload["items"]]
    assert ids.index(big_id) < ids.index(mid_id)
    assert _item(payload, big_id)["rating_count"] == 500


def test_empty_platform_returns_no_items(
    client: TestClient,
    db_session: Session,
):
    """No rated songs anywhere yields an empty all-time response, not an error."""
    viewer_token = _register(client, "viewer@example.com", "viewer")

    payload = _get(client, viewer_token)
    assert payload["window"] == "all_time"
    assert payload["items"] == []


def test_requires_authentication(
    client: TestClient,
):
    """The module is auth-gated like the rest of Discover."""
    response = client.get(POPULAR_PATH)
    assert response.status_code == 401
