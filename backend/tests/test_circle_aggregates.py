"""Integration tests for circle-aggregate discovery (Most-rated, Trending).

"Your circle" means mutual follows whose taste is visible to the viewer. These tests pin
the locked rules: only mutual + visible contributors count, the viewer is excluded from the
aggregate (but exposed separately as viewer_rating), blocked/deleted/only_me/one-way users
never count, below-3 songs are omitted entirely (no hint leaks), and Trending counts only
distinct eligible activity inside the 7-day window.
"""
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.core.limiter import limiter
from src.sqlalchemy_tables.profile import Profile
from src.sqlalchemy_tables.ranking import Ranking
from src.sqlalchemy_tables.rating_event import RatingEvent
from src.sqlalchemy_tables.song import Song

MOST_RATED_PATH = "/api/v1/discover/circle/most-rated"
TRENDING_PATH = "/api/v1/discover/circle/trending"


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


def _follow(
    client: TestClient,
    token: str,
    username: str,
) -> None:
    """Create one directed follow."""
    response = client.post(
        f"/api/v1/profile/{username}/follow",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200


def _mutual(
    client: TestClient,
    viewer_token: str,
    member_token: str,
    member_username: str,
) -> None:
    """Wire a mutual follow between the viewer and one member."""
    _follow(client, viewer_token, member_username)
    _follow(client, member_token, "viewer")


def _set_visibility(
    client: TestClient,
    token: str,
    visibility: str,
) -> None:
    """Set one user's taste visibility."""
    response = client.put(
        "/api/v1/profile/me/visibility",
        json={"visibility": visibility},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200


def _block(
    client: TestClient,
    token: str,
    username: str,
) -> None:
    """Create one directed block."""
    response = client.post(
        f"/api/v1/profile/{username}/block",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200


def _delete_account(
    client: TestClient,
    token: str,
) -> None:
    """Delete one user's account."""
    response = client.request(
        "DELETE",
        "/api/v1/auth/me",
        json={"confirmation": "DELETE"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 204


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
) -> Song:
    """Get or create a deterministic song for aggregate tests."""
    song = db.execute(
        select(Song)
        .where(Song.deezer_id == deezer_id)
    ).scalar_one_or_none()
    if song is None:
        song = Song(
            deezer_id=deezer_id,
            isrc=None,
            title=title,
            artist="Circle Artist",
            artist_deezer_id=789,
            album="Circle Album",
            cover_url="https://example.com/cover.jpg",
            preview_url="https://example.com/preview.mp3",
            genre_deezer=None,
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
    """Insert one rating_event at a controlled age for Trending window tests."""
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


def _get(
    client: TestClient,
    token: str,
    path: str,
) -> dict:
    """Get one authenticated circle-aggregate response."""
    response = client.get(
        path,
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


def _three_public_members(
    client: TestClient,
    viewer_token: str,
) -> None:
    """Register three public users who all mutually follow the viewer."""
    for name in ("alice", "bob", "carol"):
        token = _register(client, f"{name}@example.com", name)
        _mutual(client, viewer_token, token, name)


# --- Most-rated -----------------------------------------------------------------


def test_mutual_public_members_are_counted(
    client: TestClient,
    db_session: Session,
):
    """A song rated by three mutual public members appears with count 3."""
    viewer_token = _register(client, "viewer@example.com", "viewer")
    _three_public_members(client, viewer_token)
    song_id = _rate(db_session, "alice", 1001, "Shared Song", 8.0)
    _rate(db_session, "bob", 1001, "Shared Song", 9.0)
    _rate(db_session, "carol", 1001, "Shared Song", 10.0)

    item = _item(_get(client, viewer_token, MOST_RATED_PATH), song_id)
    assert item is not None
    assert item["circle_rating_count"] == 3
    assert item["average_circle_score"] == 9.0


def test_mutual_friends_only_member_is_counted(
    client: TestClient,
    db_session: Session,
):
    """A friends_only member counts when the follow is mutual."""
    viewer_token = _register(client, "viewer@example.com", "viewer")
    _three_public_members(client, viewer_token)
    friend_token = _register(client, "friend@example.com", "friend")
    _set_visibility(client, friend_token, "friends_only")
    _mutual(client, viewer_token, friend_token, "friend")
    song_id = _rate(db_session, "alice", 1002, "Friendly Song", 7.0)
    _rate(db_session, "bob", 1002, "Friendly Song", 7.0)
    _rate(db_session, "carol", 1002, "Friendly Song", 7.0)
    _rate(db_session, "friend", 1002, "Friendly Song", 7.0)

    item = _item(_get(client, viewer_token, MOST_RATED_PATH), song_id)
    assert item is not None
    assert item["circle_rating_count"] == 4


def test_one_way_follow_is_excluded(
    client: TestClient,
    db_session: Session,
):
    """A one-way followed public user does not count (mutual required)."""
    viewer_token = _register(client, "viewer@example.com", "viewer")
    _three_public_members(client, viewer_token)
    _register(client, "stranger@example.com", "stranger")
    _follow(client, viewer_token, "stranger")  # one-way only
    song_id = _rate(db_session, "alice", 1003, "One Way Song", 8.0)
    _rate(db_session, "bob", 1003, "One Way Song", 8.0)
    _rate(db_session, "carol", 1003, "One Way Song", 8.0)
    _rate(db_session, "stranger", 1003, "One Way Song", 8.0)

    item = _item(_get(client, viewer_token, MOST_RATED_PATH), song_id)
    assert item is not None
    assert item["circle_rating_count"] == 3


def test_viewer_block_excludes_member(
    client: TestClient,
    db_session: Session,
):
    """A mutual follow the viewer has blocked does not count."""
    viewer_token = _register(client, "viewer@example.com", "viewer")
    _three_public_members(client, viewer_token)
    blocked_token = _register(client, "blocked@example.com", "blockeduser")
    _mutual(client, viewer_token, blocked_token, "blockeduser")
    _block(client, viewer_token, "blockeduser")
    song_id = _rate(db_session, "alice", 1004, "Blocked Song", 8.0)
    _rate(db_session, "bob", 1004, "Blocked Song", 8.0)
    _rate(db_session, "carol", 1004, "Blocked Song", 8.0)
    _rate(db_session, "blockeduser", 1004, "Blocked Song", 8.0)

    item = _item(_get(client, viewer_token, MOST_RATED_PATH), song_id)
    assert item is not None
    assert item["circle_rating_count"] == 3


def test_member_block_of_viewer_excludes_member(
    client: TestClient,
    db_session: Session,
):
    """A mutual follow who has blocked the viewer does not count."""
    viewer_token = _register(client, "viewer@example.com", "viewer")
    _three_public_members(client, viewer_token)
    blocker_token = _register(client, "blocker@example.com", "blockeruser")
    _mutual(client, viewer_token, blocker_token, "blockeruser")
    _block(client, blocker_token, "viewer")
    song_id = _rate(db_session, "alice", 1005, "Blocker Song", 8.0)
    _rate(db_session, "bob", 1005, "Blocker Song", 8.0)
    _rate(db_session, "carol", 1005, "Blocker Song", 8.0)
    _rate(db_session, "blockeruser", 1005, "Blocker Song", 8.0)

    item = _item(_get(client, viewer_token, MOST_RATED_PATH), song_id)
    assert item is not None
    assert item["circle_rating_count"] == 3


def test_only_me_member_is_excluded(
    client: TestClient,
    db_session: Session,
):
    """An only_me member is excluded even when the follow is mutual."""
    viewer_token = _register(client, "viewer@example.com", "viewer")
    _three_public_members(client, viewer_token)
    private_token = _register(client, "private@example.com", "privateuser")
    _set_visibility(client, private_token, "only_me")
    _mutual(client, viewer_token, private_token, "privateuser")
    song_id = _rate(db_session, "alice", 1006, "Private Song", 8.0)
    _rate(db_session, "bob", 1006, "Private Song", 8.0)
    _rate(db_session, "carol", 1006, "Private Song", 8.0)
    _rate(db_session, "privateuser", 1006, "Private Song", 8.0)

    item = _item(_get(client, viewer_token, MOST_RATED_PATH), song_id)
    assert item is not None
    assert item["circle_rating_count"] == 3


def test_deleted_member_is_excluded(
    client: TestClient,
    db_session: Session,
):
    """A deleted member drops out of the count."""
    viewer_token = _register(client, "viewer@example.com", "viewer")
    _three_public_members(client, viewer_token)
    doomed_token = _register(client, "doomed@example.com", "doomeduser")
    _mutual(client, viewer_token, doomed_token, "doomeduser")
    song_id = _rate(db_session, "alice", 1007, "Doomed Song", 8.0)
    _rate(db_session, "bob", 1007, "Doomed Song", 8.0)
    _rate(db_session, "carol", 1007, "Doomed Song", 8.0)
    _rate(db_session, "doomeduser", 1007, "Doomed Song", 8.0)
    _delete_account(client, doomed_token)

    item = _item(_get(client, viewer_token, MOST_RATED_PATH), song_id)
    assert item is not None
    assert item["circle_rating_count"] == 3


def test_viewer_rating_excluded_from_aggregate_and_exposed_separately(
    client: TestClient,
    db_session: Session,
):
    """The viewer's own rating never feeds the count/average but is returned separately."""
    viewer_token = _register(client, "viewer@example.com", "viewer")
    _three_public_members(client, viewer_token)
    song_id = _rate(db_session, "alice", 1008, "Mine Too", 6.0)
    _rate(db_session, "bob", 1008, "Mine Too", 8.0)
    _rate(db_session, "carol", 1008, "Mine Too", 10.0)
    _rate(db_session, "viewer", 1008, "Mine Too", 2.0)

    item = _item(_get(client, viewer_token, MOST_RATED_PATH), song_id)
    assert item is not None
    assert item["circle_rating_count"] == 3
    assert item["average_circle_score"] == 8.0  # (6+8+10)/3, viewer's 2.0 excluded
    assert item["viewer_rating"] == {"score": 2.0, "bucket": "like"}


def test_viewer_rating_is_null_when_unrated(
    client: TestClient,
    db_session: Session,
):
    """viewer_rating is None for a circle song the viewer has not rated."""
    viewer_token = _register(client, "viewer@example.com", "viewer")
    _three_public_members(client, viewer_token)
    song_id = _rate(db_session, "alice", 1009, "Not Mine", 8.0)
    _rate(db_session, "bob", 1009, "Not Mine", 8.0)
    _rate(db_session, "carol", 1009, "Not Mine", 8.0)

    item = _item(_get(client, viewer_token, MOST_RATED_PATH), song_id)
    assert item is not None
    assert item["viewer_rating"] is None


def test_below_three_contributors_is_omitted(
    client: TestClient,
    db_session: Session,
):
    """A song with only two visible circle raters is omitted entirely (no hint)."""
    viewer_token = _register(client, "viewer@example.com", "viewer")
    _three_public_members(client, viewer_token)
    song_id = _rate(db_session, "alice", 1010, "Too Few", 8.0)
    _rate(db_session, "bob", 1010, "Too Few", 8.0)

    assert _item(_get(client, viewer_token, MOST_RATED_PATH), song_id) is None


def test_exactly_three_contributors_is_included(
    client: TestClient,
    db_session: Session,
):
    """Exactly three visible circle raters meets the threshold."""
    viewer_token = _register(client, "viewer@example.com", "viewer")
    _three_public_members(client, viewer_token)
    song_id = _rate(db_session, "alice", 1011, "Just Enough", 8.0)
    _rate(db_session, "bob", 1011, "Just Enough", 8.0)
    _rate(db_session, "carol", 1011, "Just Enough", 8.0)

    item = _item(_get(client, viewer_token, MOST_RATED_PATH), song_id)
    assert item is not None
    assert item["circle_rating_count"] == 3


def test_contributors_capped_at_three_highest_scores(
    client: TestClient,
    db_session: Session,
):
    """Contributors are capped at three, highest current score first."""
    viewer_token = _register(client, "viewer@example.com", "viewer")
    for name in ("alice", "bob", "carol", "dave", "erin"):
        token = _register(client, f"{name}@example.com", name)
        _mutual(client, viewer_token, token, name)
    song_id = _rate(db_session, "alice", 1012, "Crowded", 5.0)
    _rate(db_session, "bob", 1012, "Crowded", 9.5)
    _rate(db_session, "carol", 1012, "Crowded", 7.0)
    _rate(db_session, "dave", 1012, "Crowded", 9.9)
    _rate(db_session, "erin", 1012, "Crowded", 8.0)

    item = _item(_get(client, viewer_token, MOST_RATED_PATH), song_id)
    assert item is not None
    assert item["circle_rating_count"] == 5
    scores = [contributor["score"] for contributor in item["contributors"]]
    assert scores == [9.9, 9.5, 8.0]


def test_most_rated_orders_by_contributor_count(
    client: TestClient,
    db_session: Session,
):
    """Most-rated sorts by how many circle members rated, descending."""
    viewer_token = _register(client, "viewer@example.com", "viewer")
    for name in ("alice", "bob", "carol", "dave"):
        token = _register(client, f"{name}@example.com", name)
        _mutual(client, viewer_token, token, name)
    less_id = _rate(db_session, "alice", 1013, "Less Rated", 8.0)
    _rate(db_session, "bob", 1013, "Less Rated", 8.0)
    _rate(db_session, "carol", 1013, "Less Rated", 8.0)
    more_id = _rate(db_session, "alice", 1014, "More Rated", 8.0)
    _rate(db_session, "bob", 1014, "More Rated", 8.0)
    _rate(db_session, "carol", 1014, "More Rated", 8.0)
    _rate(db_session, "dave", 1014, "More Rated", 8.0)

    ids = [item["song"]["id"] for item in _get(client, viewer_token, MOST_RATED_PATH)["items"]]
    assert ids.index(more_id) < ids.index(less_id)


# --- Trending -------------------------------------------------------------------


def test_trending_counts_recent_window_activity(
    client: TestClient,
    db_session: Session,
):
    """Three circle members with eligible activity inside the window appear in Trending."""
    viewer_token = _register(client, "viewer@example.com", "viewer")
    _three_public_members(client, viewer_token)
    song_id = _rate(db_session, "alice", 2001, "Hot Song", 8.0)
    _rate(db_session, "bob", 2001, "Hot Song", 8.0)
    _rate(db_session, "carol", 2001, "Hot Song", 8.0)
    for name in ("alice", "bob", "carol"):
        _event(db_session, name, song_id, "rated", days_ago=1.0)

    payload = _get(client, viewer_token, TRENDING_PATH)
    assert payload["window_days"] == 7
    item = _item(payload, song_id)
    assert item is not None
    assert item["recent_circle_rating_count"] == 3


def test_trending_excludes_activity_outside_window(
    client: TestClient,
    db_session: Session,
):
    """Activity older than the 7-day window does not count toward Trending."""
    viewer_token = _register(client, "viewer@example.com", "viewer")
    for name in ("alice", "bob", "carol", "dave"):
        token = _register(client, f"{name}@example.com", name)
        _mutual(client, viewer_token, token, name)
    song_id = _rate(db_session, "alice", 2002, "Cooling", 8.0)
    _rate(db_session, "bob", 2002, "Cooling", 8.0)
    _rate(db_session, "carol", 2002, "Cooling", 8.0)
    _rate(db_session, "dave", 2002, "Cooling", 8.0)
    for name in ("alice", "bob", "carol"):
        _event(db_session, name, song_id, "rated", days_ago=1.0)
    _event(db_session, "dave", song_id, "rated", days_ago=10.0)  # outside window

    item = _item(_get(client, viewer_token, TRENDING_PATH), song_id)
    assert item is not None
    assert item["recent_circle_rating_count"] == 3


def test_trending_excludes_removed_song_with_no_current_ranking(
    client: TestClient,
    db_session: Session,
):
    """A member with recent activity but no current ranking (removed) does not count."""
    viewer_token = _register(client, "viewer@example.com", "viewer")
    for name in ("alice", "bob", "carol", "dave"):
        token = _register(client, f"{name}@example.com", name)
        _mutual(client, viewer_token, token, name)
    song_id = _rate(db_session, "alice", 2003, "Removed", 8.0)
    _rate(db_session, "bob", 2003, "Removed", 8.0)
    _rate(db_session, "carol", 2003, "Removed", 8.0)
    for name in ("alice", "bob", "carol"):
        _event(db_session, name, song_id, "rated", days_ago=1.0)
    # dave has recent activity but never created (or removed) their ranking.
    _event(db_session, "dave", song_id, "rated", days_ago=1.0)

    item = _item(_get(client, viewer_token, TRENDING_PATH), song_id)
    assert item is not None
    assert item["recent_circle_rating_count"] == 3


def test_trending_dedupes_repeated_reratings(
    client: TestClient,
    db_session: Session,
):
    """A member who rerated several times inside the window counts once."""
    viewer_token = _register(client, "viewer@example.com", "viewer")
    _three_public_members(client, viewer_token)
    song_id = _rate(db_session, "alice", 2004, "Rerated", 8.0)
    _rate(db_session, "bob", 2004, "Rerated", 8.0)
    _rate(db_session, "carol", 2004, "Rerated", 8.0)
    _event(db_session, "alice", song_id, "rated", days_ago=3.0)
    _event(db_session, "alice", song_id, "rerated", days_ago=2.0)
    _event(db_session, "alice", song_id, "rerated", days_ago=1.0)
    _event(db_session, "bob", song_id, "rated", days_ago=1.0)
    _event(db_session, "carol", song_id, "rated", days_ago=1.0)

    item = _item(_get(client, viewer_token, TRENDING_PATH), song_id)
    assert item is not None
    assert item["recent_circle_rating_count"] == 3


def test_trending_excludes_comparison_tombstones(
    client: TestClient,
    db_session: Session,
):
    """A member whose only recent event is a comparison tombstone does not count."""
    viewer_token = _register(client, "viewer@example.com", "viewer")
    for name in ("alice", "bob", "carol", "dave"):
        token = _register(client, f"{name}@example.com", name)
        _mutual(client, viewer_token, token, name)
    song_id = _rate(db_session, "alice", 2005, "Tombstone", 8.0)
    _rate(db_session, "bob", 2005, "Tombstone", 8.0)
    _rate(db_session, "carol", 2005, "Tombstone", 8.0)
    _rate(db_session, "dave", 2005, "Tombstone", 8.0)
    for name in ("alice", "bob", "carol"):
        _event(db_session, name, song_id, "rated", days_ago=1.0)
    _event(db_session, "dave", song_id, "comparison_canceled", days_ago=1.0)

    item = _item(_get(client, viewer_token, TRENDING_PATH), song_id)
    assert item is not None
    assert item["recent_circle_rating_count"] == 3


def test_trending_respects_retroactive_privacy(
    client: TestClient,
    db_session: Session,
):
    """A member who became only_me after recent activity is excluded at query time."""
    viewer_token = _register(client, "viewer@example.com", "viewer")
    for name in ("alice", "bob", "carol"):
        token = _register(client, f"{name}@example.com", name)
        _mutual(client, viewer_token, token, name)
    gone_token = _register(client, "gone@example.com", "goneuser")
    _mutual(client, viewer_token, gone_token, "goneuser")
    song_id = _rate(db_session, "alice", 2006, "Retro", 8.0)
    _rate(db_session, "bob", 2006, "Retro", 8.0)
    _rate(db_session, "carol", 2006, "Retro", 8.0)
    _rate(db_session, "goneuser", 2006, "Retro", 8.0)
    for name in ("alice", "bob", "carol", "goneuser"):
        _event(db_session, name, song_id, "rated", days_ago=1.0)
    _set_visibility(client, gone_token, "only_me")  # after the activity

    item = _item(_get(client, viewer_token, TRENDING_PATH), song_id)
    assert item is not None
    assert item["recent_circle_rating_count"] == 3


# --- Auth -----------------------------------------------------------------------


def test_circle_endpoints_require_auth(
    client: TestClient,
):
    """Both circle endpoints reject unauthenticated requests."""
    assert client.get(MOST_RATED_PATH).status_code == 401
    assert client.get(TRENDING_PATH).status_code == 401
