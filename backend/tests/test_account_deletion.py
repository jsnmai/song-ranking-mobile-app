# Integration tests for authenticated account deletion.
import uuid
from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.block import Block
from src.sqlalchemy_tables.comparison import Comparison
from src.sqlalchemy_tables.comparison_session import ComparisonSession
from src.sqlalchemy_tables.follow import Follow
from src.sqlalchemy_tables.profile import Profile
from src.sqlalchemy_tables.ranking import Ranking
from src.sqlalchemy_tables.rating_event import RatingEvent
from src.sqlalchemy_tables.report import Report
from src.sqlalchemy_tables.bookmark import Bookmark
from src.sqlalchemy_tables.song import Song
from src.sqlalchemy_tables.user import User
from src.sqlalchemy_tables.user_similarity_snapshot import UserSimilaritySnapshot


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


def _finalize_rating(
    client: TestClient,
    token: str,
    deezer_id: int,
    title: str,
    bucket: str = "like",
) -> None:
    response = client.post(
        "/api/v1/ratings/finalize",
        json={
            "song": {
                "deezer_id": deezer_id,
                "isrc": "USUM70000000",
                "title": title,
                "artist": "Frank Ocean",
                "artist_deezer_id": 456,
                "album": "Blonde",
                "cover_url": "https://example.com/cover.jpg",
                "preview_url": "https://example.com/preview.mp3",
                "genre_deezer": None,
            },
            "bucket": bucket,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201


def _count_user_rows(
    db: Session,
    model,
    user_id: int,
) -> int:
    return db.execute(
        select(func.count())
        .select_from(model)
        .where(model.user_id == user_id)
    ).scalar_one()


def test_delete_me_removes_user_owned_data_and_recomputes_song_aggregates(
    client: TestClient,
    db_session: Session,
) -> None:
    """Account deletion removes identifiable taste/social rows while preserving song metadata."""
    deleting_token, deleting_user_id = _register(client, "delete-me@example.com", "deleteme")
    remaining_token, remaining_user_id = _register(client, "remaining@example.com", "remaining")

    _finalize_rating(client, deleting_token, 9001, "Shared Song")
    _finalize_rating(client, deleting_token, 9002, "Deleted Only Song", bucket="dislike")
    _finalize_rating(client, remaining_token, 9001, "Shared Song")

    follow_response = client.post(
        "/api/v1/profile/deleteme/follow",
        headers={"Authorization": f"Bearer {remaining_token}"},
    )
    assert follow_response.status_code == 200
    reported_by_deleting_response = client.post(
        "/api/v1/profile/remaining/report",
        json={"reason": "other"},
        headers={"Authorization": f"Bearer {deleting_token}"},
    )
    assert reported_by_deleting_response.status_code == 201
    reported_deleting_response = client.post(
        "/api/v1/profile/deleteme/report",
        json={"reason": "spam"},
        headers={"Authorization": f"Bearer {remaining_token}"},
    )
    assert reported_deleting_response.status_code == 201
    block_response = client.post(
        "/api/v1/profile/remaining/block",
        headers={"Authorization": f"Bearer {deleting_token}"},
    )
    assert block_response.status_code == 200

    shared_song = db_session.execute(
        select(Song)
        .where(Song.deezer_id == 9001)
    ).scalar_one()
    deleted_only_song = db_session.execute(
        select(Song)
        .where(Song.deezer_id == 9002)
    ).scalar_one()
    session_uuid = uuid.uuid4()
    db_session.add(
        Comparison(
            session_uuid=session_uuid,
            user_id=deleting_user_id,
            song_a_id=shared_song.id,
            song_b_id=deleted_only_song.id,
            winner_id=shared_song.id,
            finalized_at=datetime.now(timezone.utc),
        )
    )
    db_session.add(
        Bookmark(
            user_id=deleting_user_id,
            song_id=deleted_only_song.id,
            source="song_detail",
        )
    )
    db_session.add(
        ComparisonSession(
            session_uuid=uuid.uuid4(),
            user_id=deleting_user_id,
            song_payload={
                "deezer_id": 9003,
                "title": "Temporary Song",
            },
            bucket="like",
            low_index=0,
            high_index=0,
            decisions=[],
        )
    )
    db_session.add(
        UserSimilaritySnapshot(
            user_a_id=min(deleting_user_id, remaining_user_id),
            user_b_id=max(deleting_user_id, remaining_user_id),
            similarity_score=0.78,
            shared_song_count=5,
            score_distance_avg=1.3,
            shared_genres=["R&B"],
            shared_top_artists=["Frank Ocean"],
            algorithm_version="v1_cosine",
        )
    )
    db_session.commit()

    history_response = client.get(
        "/api/v1/rankings/me/versus-history",
        headers={"Authorization": f"Bearer {deleting_token}"},
    )
    assert history_response.status_code == 200
    assert len(history_response.json()["receipts"]) == 1

    response = client.request(
        "DELETE",
        "/api/v1/auth/me",
        json={"confirmation": "DELETE"},
        headers={"Authorization": f"Bearer {deleting_token}"},
    )

    assert response.status_code == 204
    assert db_session.execute(
        select(func.count())
        .select_from(User)
        .where(User.id == deleting_user_id)
    ).scalar_one() == 0
    assert db_session.execute(
        select(func.count())
        .select_from(Profile)
        .where(Profile.user_id == deleting_user_id)
    ).scalar_one() == 0
    assert _count_user_rows(db_session, Ranking, deleting_user_id) == 0
    assert _count_user_rows(db_session, RatingEvent, deleting_user_id) == 0
    assert _count_user_rows(db_session, Comparison, deleting_user_id) == 0
    assert _count_user_rows(db_session, ComparisonSession, deleting_user_id) == 0
    assert _count_user_rows(db_session, Bookmark, deleting_user_id) == 0
    assert db_session.execute(
        select(func.count())
        .select_from(Follow)
        .where(
            or_(
                Follow.follower_id == deleting_user_id,
                Follow.following_id == deleting_user_id,
            )
        )
    ).scalar_one() == 0
    assert db_session.execute(
        select(func.count())
        .select_from(Block)
        .where(
            or_(
                Block.blocker_id == deleting_user_id,
                Block.blocked_id == deleting_user_id,
            )
        )
    ).scalar_one() == 0
    assert db_session.execute(
        select(func.count())
        .select_from(UserSimilaritySnapshot)
        .where(
            or_(
                UserSimilaritySnapshot.user_a_id == deleting_user_id,
                UserSimilaritySnapshot.user_b_id == deleting_user_id,
            )
        )
    ).scalar_one() == 0
    reports = db_session.execute(
        select(Report)
        .order_by(Report.id)
    ).scalars().all()
    assert len(reports) == 2
    assert reports[0].reporter_user_id is None
    assert reports[0].reported_user_id == remaining_user_id
    assert reports[1].reporter_user_id == remaining_user_id
    assert reports[1].reported_user_id is None

    db_session.refresh(shared_song)
    db_session.refresh(deleted_only_song)
    remaining_score = db_session.execute(
        select(Ranking.score)
        .where(Ranking.user_id == remaining_user_id)
        .where(Ranking.song_id == shared_song.id)
    ).scalar_one()
    assert shared_song.global_rating_count == 1
    assert shared_song.global_avg_score == remaining_score
    assert deleted_only_song.global_rating_count == 0
    assert deleted_only_song.global_avg_score is None
    assert db_session.execute(select(func.count()).select_from(Song)).scalar_one() == 2

    feed_response = client.get(
        "/api/v1/feed",
        headers={"Authorization": f"Bearer {remaining_token}"},
    )
    profile_response = client.get(
        "/api/v1/profile/deleteme",
        headers={"Authorization": f"Bearer {remaining_token}"},
    )
    me_response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {deleting_token}"},
    )
    anchors_response = client.get(
        "/api/v1/rankings/me/anchors",
        headers={"Authorization": f"Bearer {deleting_token}"},
    )
    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "delete-me@example.com", "password": "password123"},
    )

    assert feed_response.status_code == 200
    assert feed_response.json()["events"] == []
    assert profile_response.status_code == 404
    assert me_response.status_code == 401
    assert anchors_response.status_code == 401
    assert login_response.status_code == 401


def test_delete_me_requires_authentication(client: TestClient) -> None:
    """Anonymous callers cannot delete an account."""
    response = client.request("DELETE", "/api/v1/auth/me", json={"confirmation": "DELETE"})

    assert response.status_code == 401


def test_delete_me_rejects_wrong_confirmation(
    client: TestClient,
    db_session: Session,
) -> None:
    """Wrong deletion confirmation leaves the account intact."""
    token, user_id = _register(client, "keep-me@example.com", "keepme")

    response = client.request(
        "DELETE",
        "/api/v1/auth/me",
        json={"confirmation": "NOPE"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 400
    assert db_session.execute(
        select(func.count())
        .select_from(User)
        .where(User.id == user_id)
    ).scalar_one() == 1


def test_delete_me_requires_confirmation_body(
    client: TestClient,
    db_session: Session,
) -> None:
    """Missing deletion confirmation leaves the account intact."""
    token, user_id = _register(client, "missing-confirm@example.com", "missingconfirm")

    response = client.request(
        "DELETE",
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 422
    assert db_session.execute(
        select(func.count())
        .select_from(User)
        .where(User.id == user_id)
    ).scalar_one() == 1
