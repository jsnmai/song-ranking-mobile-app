# Tests for the weekly-rating streak: pure window math + integration through
# finalize, the profile read surface, visibility, failure isolation, and the
# kill-switch.
from datetime import date, datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.crud.streak import (
    count_distinct_songs_in_window,
    get_user_streak,
    list_counted_rating_local_dates,
)
from src.services.streak import (
    ComputedStreak,
    compute_next_streak,
    compute_streak_from_event_dates,
    effective_current_streak,
    window_index,
)
from src.sqlalchemy_tables.follow import Follow
from src.sqlalchemy_tables.profile import Profile
from src.sqlalchemy_tables.rating_event import RatingEvent
from src.sqlalchemy_tables.song import Song

# --- Helpers -----------------------------------------------------------------


def _register(
    client: TestClient,
    email: str,
    username: str,
) -> tuple[str, int]:
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
    body = response.json()
    return body["access_token"], body["user"]["id"]


def _rate(
    client: TestClient,
    token: str,
    deezer_id: int,
    title: str = "Song",
    bucket: str = "like",
) -> None:
    response = client.post(
        "/api/v1/ratings/finalize",
        json={
            "song": {
                "deezer_id": deezer_id,
                "isrc": None,
                "title": title,
                "artist": "Artist",
                "artist_deezer_id": 1,
                "album": "Album",
                "cover_url": "https://example.com/cover.jpg",
                "preview_url": None,
                "genre_deezer": None,
            },
            "bucket": bucket,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201


def _make_song(
    db: Session,
    deezer_id: int,
    title: str = "Song",
) -> Song:
    song = Song(
        deezer_id=deezer_id,
        isrc=None,
        title=title,
        artist="Artist",
        artist_deezer_id=1,
        album="Album",
        cover_url="https://example.com/cover.jpg",
        preview_url=None,
        genre_deezer=None,
    )
    db.add(song)
    db.flush()
    return song


def _my_stats(
    client: TestClient,
    token: str,
) -> dict | None:
    response = client.get(
        "/api/v1/profile/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    return response.json()["user_stats"]


def _noon_utc_today() -> datetime:
    """A stable UTC instant for backdating events without midnight flakiness."""
    return datetime.now(timezone.utc).replace(hour=12, minute=0, second=0, microsecond=0)


# --- Pure window math (no DB) ------------------------------------------------


def _empty() -> ComputedStreak:
    return ComputedStreak(
        current_streak=0,
        longest_streak=0,
        anchor_date=None,
        last_active_date=None,
    )


def test_window_index_buckets_by_seven_days() -> None:
    anchor = date(2026, 6, 1)
    assert window_index(anchor, date(2026, 6, 1)) == 0
    assert window_index(anchor, date(2026, 6, 7)) == 0
    assert window_index(anchor, date(2026, 6, 8)) == 1
    assert window_index(anchor, date(2026, 6, 15)) == 2


def test_first_rating_starts_streak_at_one() -> None:
    state = compute_next_streak(_empty(), date(2026, 6, 1))
    assert state.current_streak == 1
    assert state.longest_streak == 1
    assert state.anchor_date == date(2026, 6, 1)
    assert state.last_active_date == date(2026, 6, 1)


def test_same_personal_week_does_not_advance() -> None:
    first = compute_next_streak(_empty(), date(2026, 6, 1))
    same_week = compute_next_streak(first, date(2026, 6, 4))
    assert same_week.current_streak == 1
    assert same_week.anchor_date == date(2026, 6, 1)
    assert same_week.last_active_date == date(2026, 6, 4)


def test_next_consecutive_week_advances() -> None:
    first = compute_next_streak(_empty(), date(2026, 6, 1))
    second = compute_next_streak(first, date(2026, 6, 8))
    assert second.current_streak == 2
    assert second.longest_streak == 2
    assert second.anchor_date == date(2026, 6, 1)


def test_gap_resets_current_but_preserves_longest() -> None:
    state = _empty()
    for day in (date(2026, 6, 1), date(2026, 6, 8), date(2026, 6, 15)):
        state = compute_next_streak(state, day)
    assert state.current_streak == 3
    assert state.longest_streak == 3

    # 6/22-6/28 is a personal week with no rating -> the streak breaks and restarts.
    lapsed = compute_next_streak(state, date(2026, 6, 29))
    assert lapsed.current_streak == 1
    assert lapsed.longest_streak == 3
    assert lapsed.anchor_date == date(2026, 6, 29)


def test_out_of_order_older_event_is_noop() -> None:
    first = compute_next_streak(_empty(), date(2026, 6, 8))
    earlier = compute_next_streak(first, date(2026, 6, 1))
    assert earlier == first


def test_replaying_same_event_date_is_idempotent() -> None:
    first = compute_next_streak(_empty(), date(2026, 6, 1))
    again = compute_next_streak(first, date(2026, 6, 1))
    assert again.current_streak == 1
    assert again.anchor_date == first.anchor_date
    assert again.last_active_date == first.last_active_date


def test_rebuild_from_event_dates_consecutive_run() -> None:
    state = compute_streak_from_event_dates(
        [date(2026, 6, 1), date(2026, 6, 4), date(2026, 6, 8), date(2026, 6, 15)]
    )
    assert state.current_streak == 3
    assert state.longest_streak == 3


def test_rebuild_from_event_dates_keeps_only_current_run_but_remembers_longest() -> None:
    state = compute_streak_from_event_dates(
        [date(2026, 6, 1), date(2026, 6, 8), date(2026, 6, 29), date(2026, 7, 6)]
    )
    assert state.current_streak == 2
    assert state.longest_streak == 2
    assert state.anchor_date == date(2026, 6, 29)


def test_effective_streak_decays_after_a_missed_week() -> None:
    anchor = date(2026, 6, 1)
    last_active = date(2026, 6, 8)  # window 1
    # Current or immediately-following window: still alive.
    assert effective_current_streak(anchor, last_active, 2, date(2026, 6, 10)) == 2
    assert effective_current_streak(anchor, last_active, 2, date(2026, 6, 16)) == 2
    # A whole personal week skipped: lapsed to 0 (without any write).
    assert effective_current_streak(anchor, last_active, 2, date(2026, 6, 23)) == 0


# --- Integration through finalize + profile read -----------------------------


def test_first_finalize_creates_streak_on_profile(
    client: TestClient,
    db_session: Session,
) -> None:
    token, user_id = _register(client, "streak1@example.com", "streakone")
    _rate(client, token, 1001)

    stats = _my_stats(client, token)
    assert stats["current_streak"] == 1
    assert stats["longest_streak"] == 1

    row = get_user_streak(db_session, user_id)
    assert row is not None
    assert row.current_streak == 1


def test_same_day_rerate_does_not_advance_streak(
    client: TestClient,
    db_session: Session,
) -> None:
    token, _user_id = _register(client, "streak2@example.com", "streaktwo")
    _rate(client, token, 1002, title="A")
    _rate(client, token, 1002, title="A")  # rerate of the same song, same day

    stats = _my_stats(client, token)
    assert stats["current_streak"] == 1


def test_first_finalize_backfills_existing_history(
    client: TestClient,
    db_session: Session,
) -> None:
    token, user_id = _register(client, "streak3@example.com", "streakthree")

    # Two counted ratings in the two prior personal weeks, before any streak row exists.
    song = _make_song(db_session, 2001, title="Old")
    base = _noon_utc_today()
    db_session.add_all(
        [
            RatingEvent(
                user_id=user_id, song_id=song.id, event_type="rated",
                new_bucket="like", new_score=9.0, created_at=base - timedelta(days=14),
            ),
            RatingEvent(
                user_id=user_id, song_id=song.id, event_type="rerated",
                new_bucket="like", new_score=9.0, created_at=base - timedelta(days=7),
            ),
        ]
    )
    db_session.commit()

    # A fresh rating today lazily rebuilds from history + today => 3 consecutive weeks.
    _rate(client, token, 2002, title="New")

    stats = _my_stats(client, token)
    assert stats["current_streak"] == 3
    assert stats["longest_streak"] == 3


def test_streak_failure_does_not_break_finalize(
    client: TestClient,
    db_session: Session,
    monkeypatch,
) -> None:
    token, user_id = _register(client, "streak4@example.com", "streakfour")

    def _raise(*args, **kwargs):
        raise RuntimeError("streak boom")

    monkeypatch.setattr("src.services.streak.list_counted_rating_local_dates", _raise)

    # The rating still finalizes and persists despite the streak update blowing up.
    _rate(client, token, 3001)
    rankings = client.get(
        "/api/v1/rankings/me",
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    assert len(rankings["rankings"]) == 1

    # The failed streak write was swallowed: no row, profile reports 0.
    assert get_user_streak(db_session, user_id) is None
    assert _my_stats(client, token)["current_streak"] == 0


def test_kill_switch_disables_streak(
    client: TestClient,
    db_session: Session,
    monkeypatch,
) -> None:
    from src.core.config import settings

    monkeypatch.setattr(settings, "streaks_enabled", False)

    token, user_id = _register(client, "streak5@example.com", "streakfive")
    _rate(client, token, 4001)

    assert get_user_streak(db_session, user_id) is None
    stats = _my_stats(client, token)
    assert stats["current_streak"] == 0
    assert stats["longest_streak"] == 0


def test_streak_follows_profile_visibility(
    client: TestClient,
    db_session: Session,
) -> None:
    owner_token, owner_id = _register(client, "owner@example.com", "owneruser")
    viewer_token, viewer_id = _register(client, "viewer@example.com", "vieweruser")
    _rate(client, owner_token, 5001)  # owner now has a 1-week streak

    def viewer_stats() -> dict | None:
        response = client.get(
            "/api/v1/profile/owneruser",
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert response.status_code == 200
        return response.json()["user_stats"]

    # Public (default): visible to anyone.
    assert viewer_stats()["current_streak"] == 1

    owner_profile = db_session.execute(
        select(Profile).where(Profile.user_id == owner_id)
    ).scalar_one()

    # friends_only + not mutual: the whole taste-gated stats block is hidden.
    owner_profile.visibility = "friends_only"
    owner_profile.is_public = False
    db_session.commit()
    assert viewer_stats() is None

    # Mutual follow restores visibility.
    db_session.add_all(
        [
            Follow(follower_id=owner_id, following_id=viewer_id),
            Follow(follower_id=viewer_id, following_id=owner_id),
        ]
    )
    db_session.commit()
    assert viewer_stats()["current_streak"] == 1

    # only_me: hidden even from a mutual follow.
    owner_profile.visibility = "only_me"
    db_session.commit()
    assert viewer_stats() is None


# --- CRUD semantics: distinct songs + timezone boundaries --------------------


def test_window_count_is_distinct_songs_not_events(
    client: TestClient,
    db_session: Session,
) -> None:
    _token, user_id = _register(client, "window@example.com", "windowuser")
    song_a = _make_song(db_session, 6001, title="A")
    song_b = _make_song(db_session, 6002, title="B")
    base = _noon_utc_today()
    today = base.date()
    db_session.add_all(
        [
            RatingEvent(user_id=user_id, song_id=song_a.id, event_type="rated",
                        new_bucket="like", new_score=9.0, created_at=base),
            RatingEvent(user_id=user_id, song_id=song_a.id, event_type="rerated",
                        new_bucket="like", new_score=9.0, created_at=base),
            RatingEvent(user_id=user_id, song_id=song_b.id, event_type="rated",
                        new_bucket="like", new_score=8.0, created_at=base),
            RatingEvent(user_id=user_id, song_id=song_a.id, event_type="removed",
                        new_bucket=None, new_score=None, created_at=base),
        ]
    )
    db_session.commit()

    # Song A counted once despite the rerate; the remove is not counted at all.
    count = count_distinct_songs_in_window(db_session, user_id, None, today, today)
    assert count == 2


def test_local_rating_dates_respect_timezone(
    client: TestClient,
    db_session: Session,
) -> None:
    _token, user_id = _register(client, "tz@example.com", "tzuser")
    song = _make_song(db_session, 7001)
    # 2026-06-10 06:00 UTC is 2026-06-09 23:00 in America/Los_Angeles (UTC-7 in June).
    db_session.add(
        RatingEvent(
            user_id=user_id, song_id=song.id, event_type="rated",
            new_bucket="like", new_score=9.0,
            created_at=datetime(2026, 6, 10, 6, 0, tzinfo=timezone.utc),
        )
    )
    db_session.commit()

    assert list_counted_rating_local_dates(db_session, user_id, None) == [date(2026, 6, 10)]
    assert list_counted_rating_local_dates(
        db_session, user_id, "America/Los_Angeles"
    ) == [date(2026, 6, 9)]
