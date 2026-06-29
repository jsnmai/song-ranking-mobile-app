# Tests for GET /profile/me/taste and GET /profile/{username}/taste.
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.song import Song


def _register(
    client: TestClient,
    email: str,
    username: str,
) -> tuple[str, int]:
    """Register a user and return (token, user_id)."""
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "password123",
            "birthdate": "2000-01-01",
            "display_name": "Test User",
            "username": username,
        },
    )
    data = response.json()
    return data["access_token"], data["user"]["id"]


def _rate(
    client: TestClient,
    token: str,
    deezer_id: int,
    artist: str,
    bucket: str,
    genre_deezer: str | None = None,
    title: str = "Test Song",
) -> None:
    """Finalize one rating into an empty bucket — no comparison required."""
    client.post(
        "/api/v1/ratings/finalize",
        json={
            "song": {
                "deezer_id": deezer_id,
                "isrc": None,
                "title": title,
                "artist": artist,
                "artist_deezer_id": 1,
                "album": "Test Album",
                "cover_url": "https://example.com/cover.jpg",
                "preview_url": None,
                "genre_deezer": genre_deezer,
            },
            "bucket": bucket,
        },
        headers={"Authorization": f"Bearer {token}"},
    )


def _get_taste(
    client: TestClient,
    token: str,
    username: str | None = None,
) -> dict:
    """Call the taste endpoint for own profile or another user."""
    path = f"/api/v1/profile/{username}/taste" if username else "/api/v1/profile/me/taste"
    response = client.get(
        path,
        headers={"Authorization": f"Bearer {token}"},
    )
    return response


def test_empty_taste_profile_returns_zeros(client: TestClient) -> None:
    """A user with no ratings gets zeros and empty arrays, not an error."""
    token, _ = _register(client, "empty@example.com", "emptyuser")

    response = _get_taste(client, token)

    assert response.status_code == 200
    data = response.json()
    assert data["total_rated"] == 0
    assert data["avg_score"] is None
    assert data["bucket_breakdown"] == {"like": 0, "okay": 0, "dislike": 0}
    assert data["overall"]["genres"] == []
    assert data["overall"]["top_artists"] == []
    assert data["by_bucket"]["like"]["count"] == 0
    assert data["by_bucket"]["okay"]["count"] == 0
    assert data["by_bucket"]["dislike"]["count"] == 0


def test_my_taste_profile_bucket_breakdown(client: TestClient) -> None:
    """Bucket breakdown counts match the number of songs rated in each bucket."""
    token, _ = _register(client, "breakdown@example.com", "breakdownuser")
    _rate(client, token, deezer_id=1, artist="Artist A", bucket="like", genre_deezer="Rock")
    _rate(client, token, deezer_id=2, artist="Artist B", bucket="alright", genre_deezer="Pop")
    _rate(client, token, deezer_id=3, artist="Artist C", bucket="dislike", genre_deezer="Jazz")

    response = _get_taste(client, token)

    assert response.status_code == 200
    data = response.json()
    assert data["total_rated"] == 3
    assert data["avg_score"] is not None
    assert data["bucket_breakdown"]["like"] == 1
    assert data["bucket_breakdown"]["okay"] == 1
    assert data["bucket_breakdown"]["dislike"] == 1
    assert data["by_bucket"]["like"]["count"] == 1
    assert data["by_bucket"]["okay"]["count"] == 1
    assert data["by_bucket"]["dislike"]["count"] == 1


def test_taste_genre_deezer_fallback(client: TestClient) -> None:
    """When genres_mb is null, genre_deezer is used as the genre."""
    token, _ = _register(client, "deezer@example.com", "deezeruser")
    _rate(client, token, deezer_id=1, artist="Artist A", bucket="like", genre_deezer="Rock")

    response = _get_taste(client, token)

    data = response.json()
    assert data["overall"]["genres"][0]["name"] == "Rock"


def test_taste_unknown_genre_when_no_metadata(client: TestClient) -> None:
    """A song with no genres_mb and no genre_deezer gets the genre 'Unknown'."""
    token, _ = _register(client, "unknown@example.com", "unknownuser")
    _rate(client, token, deezer_id=1, artist="Artist A", bucket="like", genre_deezer=None)

    response = _get_taste(client, token)

    data = response.json()
    genres = data["overall"]["genres"]
    assert len(genres) == 1
    assert genres[0]["name"] == "Unknown"


def test_taste_unknown_genre_sorted_to_bottom(client: TestClient) -> None:
    """Unknown genre always appears after named genres regardless of count."""
    token, _ = _register(client, "bottom@example.com", "bottomuser")
    _rate(client, token, deezer_id=1, artist="Artist A", bucket="like", genre_deezer=None)
    _rate(client, token, deezer_id=2, artist="Artist B", bucket="alright", genre_deezer="Rock")
    _rate(client, token, deezer_id=3, artist="Artist C", bucket="dislike", genre_deezer=None)

    response = _get_taste(client, token)

    data = response.json()
    genres = data["overall"]["genres"]
    assert genres[-1]["name"] == "Unknown"
    assert genres[0]["name"] == "Rock"


def test_taste_genres_mb_takes_priority_over_deezer(
    client: TestClient,
    db_session: Session,
) -> None:
    """genres_mb[0] is used instead of genre_deezer when both are present."""
    token, _ = _register(client, "mb@example.com", "mbuser")
    _rate(client, token, deezer_id=1, artist="Artist A", bucket="like", genre_deezer="Pop")

    song = db_session.query(Song).filter(Song.deezer_id == 1).first()
    assert song is not None
    song.genres_mb = ["Alternative R&B", "Art Pop"]
    db_session.commit()

    response = _get_taste(client, token)

    data = response.json()
    assert data["overall"]["genres"][0]["name"] == "Alternative R&B"


def test_taste_percentages_sum_to_100(client: TestClient) -> None:
    """Genre percentages across the overall section sum to approximately 100%."""
    token, _ = _register(client, "pct@example.com", "pctuser")
    _rate(client, token, deezer_id=1, artist="Artist A", bucket="like", genre_deezer="Rock")
    _rate(client, token, deezer_id=2, artist="Artist B", bucket="alright", genre_deezer="Pop")
    _rate(client, token, deezer_id=3, artist="Artist C", bucket="dislike", genre_deezer="Jazz")

    response = _get_taste(client, token)

    genres = response.json()["overall"]["genres"]
    total_pct = sum(g["percentage"] for g in genres)
    assert abs(total_pct - 100.0) < 0.5


def test_taste_top_artists(client: TestClient) -> None:
    """Top artists are sorted by count descending."""
    token, _ = _register(client, "artists@example.com", "artistsuser")
    _rate(client, token, deezer_id=1, artist="Frank Ocean", bucket="like")
    _rate(client, token, deezer_id=2, artist="Frank Ocean", bucket="alright")
    _rate(client, token, deezer_id=3, artist="Kendrick Lamar", bucket="dislike")

    response = _get_taste(client, token)

    artists = response.json()["overall"]["top_artists"]
    assert artists[0]["name"] == "Frank Ocean"
    assert artists[0]["count"] == 2
    assert artists[1]["name"] == "Kendrick Lamar"
    assert artists[1]["count"] == 1


def test_other_user_public_taste_profile(client: TestClient) -> None:
    """A public profile's taste data is visible to another authenticated user."""
    token_a, _ = _register(client, "usera@example.com", "usera")
    token_b, _ = _register(client, "userb@example.com", "userb")
    _rate(client, token_a, deezer_id=1, artist="Artist A", bucket="like", genre_deezer="Rock")

    response = _get_taste(client, token_b, username="usera")

    assert response.status_code == 200
    data = response.json()
    assert data["total_rated"] == 1
    assert data["overall"]["genres"][0]["name"] == "Rock"


def test_private_profile_taste_returns_404(
    client: TestClient,
    db_session: Session,
) -> None:
    """A private profile's taste endpoint returns 404 to other users."""
    from src.sqlalchemy_tables.profile import Profile

    token_a, _ = _register(client, "private@example.com", "privateuser")
    token_b, _ = _register(client, "viewer@example.com", "vieweruser")

    profile = db_session.query(Profile).filter(Profile.username == "privateuser").first()
    assert profile is not None
    profile.is_public = False
    profile.visibility = "only_me"
    db_session.commit()

    response = _get_taste(client, token_b, username="privateuser")

    assert response.status_code == 404


def test_taste_profile_requires_auth(client: TestClient) -> None:
    """Taste endpoints require a valid JWT."""
    assert client.get("/api/v1/profile/me/taste").status_code == 401
    assert client.get("/api/v1/profile/someuser/taste").status_code == 401


def test_taste_profile_by_bucket_avg_score(client: TestClient) -> None:
    """by_bucket sections each carry their own avg_score."""
    token, _ = _register(client, "bucketavg@example.com", "bucketavguser")
    _rate(client, token, deezer_id=1, artist="Artist A", bucket="like")
    _rate(client, token, deezer_id=2, artist="Artist B", bucket="alright")
    _rate(client, token, deezer_id=3, artist="Artist C", bucket="dislike")

    response = _get_taste(client, token)

    data = response.json()
    assert data["by_bucket"]["like"]["avg_score"] is not None
    assert data["by_bucket"]["okay"]["avg_score"] is not None
    assert data["by_bucket"]["dislike"]["avg_score"] is not None
    assert data["by_bucket"]["like"]["avg_score"] > data["by_bucket"]["dislike"]["avg_score"]


def test_harshness_present_and_forming_for_new_user(client: TestClient) -> None:
    """The taste response always carries harshness; a lone user is still 'forming'."""
    token, _ = _register(client, "harshforming@example.com", "harshforming")
    _rate(client, token, deezer_id=1, artist="Artist A", bucket="like", genre_deezer="Rock")

    data = _get_taste(client, token).json()

    assert data["harshness"]["status"] == "forming"
    assert data["harshness"]["percentile"] is None


def test_harshness_forming_when_few_own_ratings() -> None:
    """Under the own-ratings floor, harshness is 'forming' without touching the population."""
    from src.crud.taste import TasteRow
    from src.services import taste as taste_service

    rows = [
        TasteRow(bucket="like", score=8.0, genres_mb=None, genre_deezer="Rock", artist="A")
        for _ in range(3)
    ]

    result = taste_service._compute_harshness(None, 1, rows)

    assert result.status == "forming"
    assert result.percentile is None


def test_harshness_forming_when_small_population(monkeypatch) -> None:
    """Enough own ratings but too few peers still yields 'forming'."""
    from src.crud.taste import TasteRow
    from src.services import taste as taste_service

    rows = [
        TasteRow(bucket="like", score=8.0, genres_mb=None, genre_deezer="Rock", artist="A")
        for _ in range(10)
    ]
    monkeypatch.setattr(taste_service, "get_population_like_shares", lambda *a, **k: [0.5, 0.6])

    result = taste_service._compute_harshness(None, 1, rows)

    assert result.status == "forming"
    assert result.percentile is None


def test_harshness_percentile_ranks_against_population(monkeypatch) -> None:
    """A user harsher than most of the population gets a high percentile."""
    from src.crud.taste import TasteRow
    from src.services import taste as taste_service

    # 3 of 10 ratings are likes -> like-share 0.3 (fairly harsh).
    rows = [
        TasteRow(
            bucket="like" if i < 3 else "dislike",
            score=5.0,
            genres_mb=None,
            genre_deezer="Rock",
            artist="A",
        )
        for i in range(10)
    ]
    # 8 of 10 peers are more generous (like-share > 0.3).
    population = [0.1, 0.2, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1.0]
    monkeypatch.setattr(taste_service, "get_population_like_shares", lambda *a, **k: population)

    result = taste_service._compute_harshness(None, 1, rows)

    assert result.status == "ready"
    assert result.percentile == 80
