# Integration tests for Slice 1 provider refs and Apple finalize behavior.
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.crud.song_provider_ref import get_song_provider_ref
from src.sqlalchemy_tables.ranking import Ranking
from src.sqlalchemy_tables.song import Song
from src.sqlalchemy_tables.song_provider_ref import SongProviderRef
from src.sqlalchemy_tables.user import User


class MockAppleResponse:
    """Small httpx.Response stand-in for Apple lookup tests."""

    def __init__(
        self,
        payload: dict,
    ) -> None:
        self.payload = payload

    def raise_for_status(self) -> None:
        """Match the httpx response API used by the service."""
        return None

    def json(self) -> dict:
        """Return the mocked Apple payload."""
        return self.payload


def _register_payload(
    email: str,
    username: str,
) -> dict:
    """Return a valid register payload with caller-provided identity fields."""
    return {
        "email": email,
        "password": "password123",
        "birthdate": "2000-01-01",
        "display_name": username.title(),
        "username": username,
    }


def _get_token(
    client: TestClient,
    email: str = "provider@example.com",
    username: str = "provider",
) -> str:
    """Register a user and return the JWT from the register response."""
    response = client.post(
        "/api/v1/auth/register",
        json=_register_payload(email, username),
    )
    assert response.status_code == 201
    return response.json()["access_token"]


def _apple_payload(
    apple_track_id: str = "1440841363",
    title: str = "Nights Search",
) -> dict:
    """Return a finalize-rating payload shaped like an Apple search result."""
    return {
        "song": {
            "provider": "apple",
            "apple_track_id": apple_track_id,
            "storefront": "US",
            "title": title,
            "artist": "Frank Ocean",
            "album": "Blonde",
            "cover_url": "https://is1-ssl.mzstatic.com/image/thumb/Music/cover/100x100bb.jpg",
            "artwork_url": "https://is1-ssl.mzstatic.com/image/thumb/Music/cover/600x600bb.jpg",
            "preview_url": "https://audio-ssl.itunes.apple.com/apple-preview.m4a",
            "apple_view_url": "https://music.apple.com/us/album/nights/1440841363?i=1440841363",
            "apple_artist_id": "442122051",
            "apple_album_id": "1440840117",
            "duration_ms": 307151,
            "genre": "R&B/Soul",
            "release_year": 2016,
            "preview_available": True,
        },
        "bucket": "like",
    }


def _deezer_payload() -> dict:
    """Return a finalize-rating payload shaped like a legacy Deezer song."""
    return {
        "song": {
            "deezer_id": 123,
            "isrc": "USUG11900842",
            "title": "Nights",
            "artist": "Frank Ocean",
            "artist_deezer_id": 456,
            "album": "Blonde",
            "cover_url": "https://example.com/cover.jpg",
            "preview_url": "https://example.com/preview.mp3",
            "genre_deezer": None,
        },
        "bucket": "like",
    }


def _finalize(
    client: TestClient,
    token: str,
    payload: dict,
) -> dict:
    """Finalize a rating and return the response body."""
    response = client.post(
        "/api/v1/ratings/finalize",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    return response.json()


def _bookmark(
    client: TestClient,
    token: str,
    payload: dict,
) -> dict:
    """Bookmark a provider song and return the response body."""
    response = client.post(
        "/api/v1/bookmarks",
        json={
            "song": payload["song"],
            "source": "song_detail",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    return response.json()


def _seed_legacy_song_and_ranking(
    db_session: Session,
    user_id: int,
    *,
    deezer_id: int,
    title: str,
    artist: str,
    album: str,
    bucket: str = "like",
) -> int:
    """Directly seed a legacy-rated song (deezer_legacy ref, no Apple ref) and return its id."""
    song = Song(
        deezer_id=deezer_id,
        title=title,
        artist=artist,
        artist_deezer_id=None,
        album=album,
        cover_url="https://example.com/cover.jpg",
    )
    db_session.add(song)
    db_session.flush()
    db_session.add(
        SongProviderRef(
            song_id=song.id,
            provider="deezer_legacy",
            provider_track_id=str(deezer_id),
            storefront="global",
        )
    )
    db_session.add(
        Ranking(
            user_id=user_id,
            song_id=song.id,
            bucket=bucket,
            position=1,
            score=7.0,
        )
    )
    db_session.commit()
    return song.id


def _seed_apple_song_and_legacy_conflict(
    client: TestClient,
    monkeypatch,
    *,
    apple_track_id: str,
    owner_bucket: str = "dislike",
) -> dict:
    """
    Seed a conflicting-identity scenario for the fallback-override tests.

    `owner` finalizes an Apple-sourced rating (song X, gets the Apple ref). `other`
    separately finalizes a legacy Deezer rating for the same title/artist/album (song
    Y), with no Apple ref at all. Returns other's token and both song ids.
    """
    monkeypatch.setattr(
        "src.services.provider_catalog.httpx.get",
        lambda *args, **kwargs: MockAppleResponse({"results": []}),
    )
    owner_token = _get_token(client, email="conflict-owner@example.com", username="conflictowner")
    owner_payload = _apple_payload(apple_track_id=apple_track_id, title="Nights")
    owner_payload["bucket"] = owner_bucket
    owner_response = _finalize(client, owner_token, owner_payload)

    other_token = _get_token(client, email="conflict-other@example.com", username="conflictother")
    other_response = _finalize(client, other_token, _deezer_payload())

    return {
        "other_token": other_token,
        "song_x_id": owner_response["ranking"]["song_id"],
        "song_y_id": other_response["ranking"]["song_id"],
    }


def test_provider_refs_uniqueness_and_storefront_required(db_session: Session):
    """Provider refs enforce a storefront-qualified unique provider identity."""
    song = Song(
        deezer_id=None,
        title="Unique Song",
        artist="Artist",
        artist_deezer_id=None,
        album="Album",
        cover_url="https://example.com/cover.jpg",
    )
    db_session.add(song)
    db_session.flush()
    db_session.add(
        SongProviderRef(
            song_id=song.id,
            provider="apple",
            provider_track_id="1",
            storefront="US",
        )
    )
    db_session.add(
        SongProviderRef(
            song_id=song.id,
            provider="apple",
            provider_track_id="1",
            storefront="GB",
        )
    )
    db_session.commit()

    db_session.add(
        SongProviderRef(
            song_id=song.id,
            provider="apple",
            provider_track_id="1",
            storefront="US",
        )
    )
    try:
        db_session.commit()
    except IntegrityError:
        db_session.rollback()
    else:
        raise AssertionError("Duplicate provider ref should violate uniqueness.")


def test_deezer_finalize_backfills_legacy_provider_ref(
    client: TestClient,
    db_session: Session,
):
    """Existing Deezer behavior still writes the song and records a legacy provider ref."""
    token = _get_token(client)
    response = _finalize(client, token, _deezer_payload())

    provider_ref = db_session.execute(
        select(SongProviderRef)
        .where(SongProviderRef.provider == "deezer_legacy")
        .where(SongProviderRef.provider_track_id == "123")
        .where(SongProviderRef.storefront == "global")
    ).scalar_one()
    assert provider_ref.song_id == response["ranking"]["song_id"]
    assert provider_ref.preview_available is True


def test_deezer_bookmark_backfills_legacy_provider_ref(
    client: TestClient,
    db_session: Session,
):
    """Bookmark-only Deezer songs still record their legacy provider identity."""
    token = _get_token(client)
    response = _bookmark(client, token, _deezer_payload())

    provider_ref = db_session.execute(
        select(SongProviderRef)
        .where(SongProviderRef.provider == "deezer_legacy")
        .where(SongProviderRef.provider_track_id == "123")
        .where(SongProviderRef.storefront == "global")
    ).scalar_one()
    assert provider_ref.song_id == response["song"]["id"]
    assert provider_ref.provider_artist_id == "456"
    assert provider_ref.artwork_url == "https://example.com/cover.jpg"
    assert provider_ref.preview_available is True


def test_rankings_prefer_previewable_apple_ref_when_duplicate_refs_exist(
    client: TestClient,
    db_session: Session,
):
    """A later fallback Apple ref must not hide a known-previewable Apple ref."""
    email = "duplicate-apple@example.com"
    token = _get_token(
        client,
        email=email,
        username="duplicateapple",
    )
    user = db_session.execute(
        select(User).where(User.email == email)
    ).scalar_one()
    song = Song(
        deezer_id=None,
        isrc="USAT22602481",
        title="Smoke",
        artist="Skrillex, ISOxo, Cristale & TeeZandos",
        artist_deezer_id=None,
        album="SOMA",
        cover_url="https://example.com/smoke.jpg",
    )
    db_session.add(song)
    db_session.flush()
    now = datetime.now(timezone.utc)
    db_session.add_all(
        [
            SongProviderRef(
                song_id=song.id,
                provider="apple",
                provider_track_id="previewable-track",
                storefront="US",
                url="https://music.apple.com/us/album/smoke/1?i=previewable-track",
                preview_available=True,
                confidence="apple_lookup",
                matched_at=now - timedelta(minutes=5),
            ),
            SongProviderRef(
                song_id=song.id,
                provider="apple",
                provider_track_id="fallback-track",
                storefront="US",
                url=None,
                preview_available=None,
                confidence="apple_legacy_fallback_match",
                matched_at=now,
            ),
            Ranking(
                user_id=user.id,
                song_id=song.id,
                bucket="like",
                position=1,
                score=10.0,
            ),
        ]
    )
    db_session.commit()

    selected_ref = get_song_provider_ref(
        db_session,
        song.id,
        "apple",
    )
    assert selected_ref is not None
    assert selected_ref.provider_track_id == "previewable-track"

    response = client.get(
        "/api/v1/rankings/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    response_song = response.json()["rankings"][0]["song"]
    assert response_song["title"] == "Smoke"
    assert response_song["preview_url"] is None
    assert response_song["preview_available"] is True
    assert response_song["apple_view_url"] == "https://music.apple.com/us/album/smoke/1?i=previewable-track"


def test_untrusted_search_fallback_ref_is_ignored_for_preview_selection(
    client: TestClient,
    db_session: Session,
    monkeypatch,
):
    """Search-written fallback refs without provider facts cannot drive preview lookup."""
    token = _get_token(
        client,
        email="unsafe-fallback@example.com",
        username="unsafefallback",
    )
    user = db_session.execute(
        select(User).where(User.email == "unsafe-fallback@example.com")
    ).scalar_one()
    song = Song(
        deezer_id=9100,
        isrc="USAT22602482",
        title="Smoke",
        artist="Skrillex, ISOxo, Cristale & TeeZandos",
        artist_deezer_id=None,
        album="SOMA",
        cover_url="https://example.com/smoke.jpg",
        preview_url="https://e-cdns-preview.dzcdn.net/stream/smoke?exp=9999999999&hdnea=token",
        preview_url_expires_at=datetime.now(timezone.utc) + timedelta(days=365),
    )
    db_session.add(song)
    db_session.flush()
    db_session.add_all(
        [
            SongProviderRef(
                song_id=song.id,
                provider="apple",
                provider_track_id="junk-compilation-track",
                storefront="US",
                url=None,
                preview_available=None,
                confidence="apple_legacy_fallback_match",
            ),
            Ranking(
                user_id=user.id,
                song_id=song.id,
                bucket="like",
                position=1,
                score=10.0,
            ),
        ]
    )
    db_session.commit()

    selected_ref = get_song_provider_ref(
        db_session,
        song.id,
        "apple",
    )
    assert selected_ref is None

    def fail_apple_lookup(*args, **kwargs):
        raise AssertionError("Unsafe fallback ref must not trigger Apple lookup.")

    monkeypatch.setattr("src.services.song.lookup_apple_song", fail_apple_lookup)

    response = client.get(
        f"/api/v1/songs/by-id/{song.id}/preview-url",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "preview_url": "https://e-cdns-preview.dzcdn.net/stream/smoke?exp=9999999999&hdnea=token",
        "apple_view_url": None,
        "provider": "deezer",
    }


def test_apple_bookmark_creates_song_and_provider_ref(
    client: TestClient,
    db_session: Session,
    monkeypatch,
):
    """Apple search results bookmark through the same canonicalization path as finalize."""
    token = _get_token(client)

    def mock_get(
        url: str,
        params: dict,
        timeout: float,
    ) -> MockAppleResponse:
        return MockAppleResponse(
            {
                "results": [
                    {
                        "trackId": 1440841363,
                        "trackName": "Nights",
                        "artistName": "Frank Ocean",
                        "collectionName": "Blonde",
                        "artworkUrl100": "https://is1-ssl.mzstatic.com/image/thumb/Music/cover/100x100bb.jpg",
                        "trackViewUrl": "https://music.apple.com/us/album/nights/1440841363?i=1440841363",
                        "previewUrl": "https://audio-ssl.itunes.apple.com/apple-preview.m4a",
                    }
                ]
            }
        )

    monkeypatch.setattr("src.services.provider_catalog.httpx.get", mock_get)
    response = _bookmark(client, token, _apple_payload(title="Client Title"))

    song = db_session.get(Song, response["song"]["id"])
    assert song.title == "Nights"
    assert song.preview_url is None
    provider_ref = db_session.execute(
        select(SongProviderRef).where(SongProviderRef.song_id == song.id)
    ).scalar_one()
    assert provider_ref.provider == "apple"
    assert provider_ref.provider_track_id == "1440841363"
    assert provider_ref.confidence == "apple_lookup"

    status_response = client.get(
        f"/api/v1/bookmarks/by-song/{song.id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert status_response.status_code == 200
    assert status_response.json()["is_bookmarked"] is True


def test_bookmark_status_by_song_id_is_user_scoped(
    client: TestClient,
):
    """The by-song status route reports only the current user's bookmark state."""
    owner_token = _get_token(client)
    response = _bookmark(client, owner_token, _deezer_payload())
    song_id = response["song"]["id"]

    other_token = _get_token(
        client,
        email="other@example.com",
        username="otheruser",
    )
    other_status = client.get(
        f"/api/v1/bookmarks/by-song/{song_id}",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert other_status.status_code == 200
    assert other_status.json()["is_bookmarked"] is False
    assert other_status.json()["bookmark"] is None


def test_listn_bookmark_reuses_durable_song_without_provider_calls(
    client: TestClient,
    monkeypatch,
):
    """A durable song bookmarks by LISTn id alone, with no Apple or Deezer lookup."""
    token = _get_token(client)
    finalize_response = _finalize(client, token, _deezer_payload())
    song_id = finalize_response["ranking"]["song_id"]

    def fail_lookup(*args, **kwargs):
        raise AssertionError("Bookmarking by LISTn id must not call a provider.")

    monkeypatch.setattr("src.services.provider_catalog.httpx.get", fail_lookup)
    response = client.post(
        "/api/v1/bookmarks",
        json={
            "song": {
                "id": song_id,
                "provider": "listn",
                "title": "Nights",
                "artist": "Frank Ocean",
                "album": "Blonde",
                "cover_url": "https://example.com/cover.jpg",
            },
            "source": "song_detail",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert response.json()["song"]["id"] == song_id


def test_apple_lookup_creates_song_and_provider_ref(
    client: TestClient,
    db_session: Session,
    monkeypatch,
):
    """New Apple songs are created from lookup facts and never persist preview_url."""
    token = _get_token(client)
    calls = []

    def mock_get(
        url: str,
        params: dict,
        timeout: float,
    ) -> MockAppleResponse:
        calls.append((url, params, timeout))
        return MockAppleResponse(
            {
                "results": [
                    {
                        "trackId": 1440841363,
                        "trackName": "Nights",
                        "artistName": "Frank Ocean",
                        "collectionName": "Blonde",
                        "artworkUrl100": "https://is1-ssl.mzstatic.com/image/thumb/Music/cover/100x100bb.jpg",
                        "trackViewUrl": "https://music.apple.com/us/album/nights/1440841363?i=1440841363",
                        "artistId": 442122051,
                        "collectionId": 1440840117,
                        "primaryGenreName": "R&B/Soul",
                        "trackTimeMillis": 307151,
                        "releaseDate": "2016-08-20T07:00:00Z",
                        "previewUrl": "https://audio-ssl.itunes.apple.com/apple-preview.m4a",
                    }
                ]
            }
        )

    monkeypatch.setattr("src.services.provider_catalog.httpx.get", mock_get)
    response = _finalize(client, token, _apple_payload(title="Client Title"))

    assert calls == [
        (
            "https://itunes.apple.com/lookup",
            {"id": "1440841363", "country": "US"},
            5.0,
        )
    ]
    song = db_session.get(Song, response["ranking"]["song_id"])
    assert song.title == "Nights"
    assert song.preview_url is None
    assert song.release_year == 2016
    provider_ref = db_session.execute(
        select(SongProviderRef).where(SongProviderRef.song_id == song.id)
    ).scalar_one()
    assert provider_ref.provider == "apple"
    assert provider_ref.provider_track_id == "1440841363"
    assert provider_ref.storefront == "US"
    assert provider_ref.confidence == "apple_lookup"
    assert provider_ref.preview_available is True
    assert response["ranking"]["song"]["preview_available"] is True
    assert response["ranking"]["song"]["apple_view_url"] == "https://music.apple.com/us/album/nights/1440841363?i=1440841363"


def test_existing_apple_provider_ref_reuses_song_without_lookup(
    client: TestClient,
    db_session: Session,
    monkeypatch,
):
    """Rating the same Apple track twice reuses the provider-ref song and skips Apple lookup."""
    token = _get_token(client, "first@example.com", "first")
    monkeypatch.setattr(
        "src.services.provider_catalog.httpx.get",
        lambda *args, **kwargs: MockAppleResponse({"results": []}),
    )
    first = _finalize(client, token, _apple_payload(title="Fallback One"))

    def fail_lookup(*args, **kwargs):
        raise AssertionError("Existing provider ref should not call Apple lookup.")

    monkeypatch.setattr("src.services.provider_catalog.httpx.get", fail_lookup)
    second_payload = _apple_payload(title="Fallback Two")
    second_payload["bucket"] = "dislike"
    second = _finalize(client, token, second_payload)

    assert second["ranking"]["song_id"] == first["ranking"]["song_id"]
    count = db_session.execute(select(SongProviderRef)).scalars().all()
    assert len(count) == 1


def test_apple_lookup_failure_falls_back_to_sanitized_client_payload(
    client: TestClient,
    db_session: Session,
    monkeypatch,
):
    """Apple lookup failure still lets rating succeed using safe client search facts."""
    token = _get_token(client)

    def mock_get(*args, **kwargs):
        raise RuntimeError("network unavailable")

    monkeypatch.setattr("src.services.provider_catalog.httpx.get", mock_get)
    response = _finalize(
        client,
        token,
        _apple_payload(
            apple_track_id="555",
            title="  Client Song  ",
        ),
    )

    song = db_session.get(Song, response["ranking"]["song_id"])
    assert song.title == "Client Song"
    assert song.preview_url is None
    provider_ref = db_session.execute(
        select(SongProviderRef).where(SongProviderRef.song_id == song.id)
    ).scalar_one()
    assert provider_ref.confidence == "apple_client_search"
    assert provider_ref.url == "https://music.apple.com/us/album/nights/1440841363?i=1440841363"


def test_apple_lookup_mismatched_track_falls_back_to_client_payload(
    client: TestClient,
    db_session: Session,
    monkeypatch,
):
    """Lookup rows for a different Apple track ID are not treated as authoritative."""
    token = _get_token(client)

    def mock_get(*args, **kwargs):
        return MockAppleResponse(
            {
                "results": [
                    {
                        "trackId": 999,
                        "trackName": "Wrong Lookup Song",
                        "artistName": "Wrong Artist",
                        "trackViewUrl": "https://music.apple.com/us/album/wrong/999?i=999",
                    }
                ]
            }
        )

    monkeypatch.setattr("src.services.provider_catalog.httpx.get", mock_get)
    response = _finalize(
        client,
        token,
        _apple_payload(
            apple_track_id="555",
            title="Client Fallback",
        ),
    )

    song = db_session.get(Song, response["ranking"]["song_id"])
    assert song.title == "Client Fallback"
    assert song.preview_url is None
    provider_ref = db_session.execute(
        select(SongProviderRef).where(SongProviderRef.song_id == song.id)
    ).scalar_one()
    assert provider_ref.provider_track_id == "555"
    assert provider_ref.confidence == "apple_client_search"


def test_saved_apple_song_preview_by_id_returns_live_preview_without_persisting(
    client: TestClient,
    db_session: Session,
    monkeypatch,
):
    """The durable by-song preview endpoint looks up Apple lazily and never stores preview_url."""
    token = _get_token(client)
    monkeypatch.setattr(
        "src.services.provider_catalog.httpx.get",
        lambda *args, **kwargs: MockAppleResponse({"results": []}),
    )
    finalized = _finalize(
        client,
        token,
        _apple_payload(
            apple_track_id="4242",
            title="Saved Apple",
        ),
    )
    song_id = finalized["ranking"]["song_id"]

    calls = []

    def mock_get(
        url: str,
        params: dict,
        timeout: float,
    ) -> MockAppleResponse:
        calls.append((url, params, timeout))
        return MockAppleResponse(
            {
                "results": [
                    {
                        "trackId": 4242,
                        "trackName": "Saved Apple",
                        "artistName": "Frank Ocean",
                        "trackViewUrl": "https://music.apple.com/us/album/saved/4242?i=4242",
                        "previewUrl": "https://audio-ssl.itunes.apple.com/live-preview.m4a",
                    }
                ]
            }
        )

    monkeypatch.setattr("src.services.provider_catalog.httpx.get", mock_get)

    response = client.get(
        f"/api/v1/songs/by-id/{song_id}/preview-url",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "preview_url": "https://audio-ssl.itunes.apple.com/live-preview.m4a",
        "apple_view_url": "https://music.apple.com/us/album/nights/1440841363?i=1440841363",
        "provider": "apple",
    }
    assert calls == [
        (
            "https://itunes.apple.com/lookup",
            {"id": "4242", "country": "US"},
            5.0,
        )
    ]
    db_session.expire_all()
    song = db_session.get(Song, song_id)
    assert song.preview_url is None


def test_saved_apple_song_preview_by_id_ignores_mismatched_lookup(
    client: TestClient,
    monkeypatch,
):
    """Apple lookup rows for the wrong track never produce a playable preview for the saved song."""
    token = _get_token(client)
    monkeypatch.setattr(
        "src.services.provider_catalog.httpx.get",
        lambda *args, **kwargs: MockAppleResponse({"results": []}),
    )
    finalized = _finalize(client, token, _apple_payload(apple_track_id="5150", title="Saved Apple"))

    monkeypatch.setattr(
        "src.services.provider_catalog.httpx.get",
        lambda *args, **kwargs: MockAppleResponse(
            {
                "results": [
                    {
                        "trackId": 999,
                        "trackName": "Wrong Song",
                        "artistName": "Wrong Artist",
                        "trackViewUrl": "https://music.apple.com/us/album/wrong/999?i=999",
                        "previewUrl": "https://audio-ssl.itunes.apple.com/wrong-preview.m4a",
                    }
                ]
            }
        ),
    )

    response = client.get(
        f"/api/v1/songs/by-id/{finalized['ranking']['song_id']}/preview-url",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["preview_url"] is None
    assert response.json()["apple_view_url"] == "https://music.apple.com/us/album/nights/1440841363?i=1440841363"


def test_saved_apple_payload_exposes_preview_available_without_live_lookup(
    client: TestClient,
    monkeypatch,
):
    """Saved Apple ranking payloads expose local preview availability without calling Apple."""
    token = _get_token(client)
    monkeypatch.setattr(
        "src.services.provider_catalog.httpx.get",
        lambda *args, **kwargs: MockAppleResponse({"results": []}),
    )
    finalized = _finalize(client, token, _apple_payload(apple_track_id="6161", title="Saved Apple"))

    def fail_lookup(*args, **kwargs):
        raise AssertionError("Ranking reads must not call Apple lookup.")

    monkeypatch.setattr("src.services.provider_catalog.httpx.get", fail_lookup)

    response = client.get(
        f"/api/v1/rankings/me/by-song/{finalized['ranking']['song_id']}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["song"]["preview_available"] is True
    assert response.json()["song"]["preview_url"] is None
    assert response.json()["song"]["provider"] is None


def test_ranking_lists_batch_saved_apple_preview_hints(
    client: TestClient,
    monkeypatch,
):
    """Ranking list surfaces load Apple preview hints once per response, not once per row."""
    token = _get_token(client)
    monkeypatch.setattr(
        "src.services.provider_catalog.httpx.get",
        lambda *args, **kwargs: MockAppleResponse({"results": []}),
    )
    first = _finalize(
        client,
        token,
        _apple_payload(
            apple_track_id="7171",
            title="Apple Like",
        ),
    )
    second_payload = _apple_payload(
        apple_track_id="8181",
        title="Apple Dislike",
    )
    second_payload["bucket"] = "dislike"
    second = _finalize(client, token, second_payload)

    import src.services.rating as rating_service

    actual_batch_helper = rating_service.list_apple_provider_refs_for_songs
    calls = []

    def spy_batch_helper(db, song_ids):
        calls.append(list(song_ids))
        return actual_batch_helper(db, song_ids)

    monkeypatch.setattr(
        "src.services.rating.list_apple_provider_refs_for_songs",
        spy_batch_helper,
    )

    response = client.get(
        "/api/v1/rankings/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert len(calls) == 1
    assert set(calls[0]) == {
        first["ranking"]["song_id"],
        second["ranking"]["song_id"],
    }

    calls.clear()
    response = client.get(
        "/api/v1/rankings/me/bucket/like",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert calls == [[first["ranking"]["song_id"]]]


def test_song_without_provider_ref_or_deezer_id_returns_null_preview(
    client: TestClient,
    db_session: Session,
):
    """Provider-neutral preview lookup safely returns nulls for songs without preview providers."""
    token = _get_token(client)
    song = Song(
        deezer_id=None,
        title="Providerless",
        artist="Artist",
        artist_deezer_id=None,
        album="Album",
        cover_url="https://example.com/cover.jpg",
    )
    db_session.add(song)
    db_session.commit()

    response = client.get(
        f"/api/v1/songs/by-id/{song.id}/preview-url",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "preview_url": None,
        "apple_view_url": None,
        "provider": None,
    }


def test_apple_lookup_missing_required_fields_falls_back_to_client_payload(
    client: TestClient,
    db_session: Session,
    monkeypatch,
):
    """Malformed matching lookup rows are ignored instead of creating bad durable rows."""
    token = _get_token(client)

    def mock_get(*args, **kwargs):
        return MockAppleResponse(
            {
                "results": [
                    {
                        "trackId": 555,
                        "trackName": "Missing Artist",
                        "trackViewUrl": "https://music.apple.com/us/album/missing/555?i=555",
                    }
                ]
            }
        )

    monkeypatch.setattr("src.services.provider_catalog.httpx.get", mock_get)
    response = _finalize(
        client,
        token,
        _apple_payload(
            apple_track_id="555",
            title="Client Fallback",
        ),
    )

    song = db_session.get(Song, response["ranking"]["song_id"])
    assert song.title == "Client Fallback"
    assert song.artist == "Frank Ocean"
    assert song.preview_url is None
    provider_ref = db_session.execute(
        select(SongProviderRef).where(SongProviderRef.song_id == song.id)
    ).scalar_one()
    assert provider_ref.confidence == "apple_client_search"


def test_apple_provider_ref_conflict_reuses_existing_song(
    client: TestClient,
    db_session: Session,
    monkeypatch,
):
    """A race-lost provider ref insert re-queries and reuses the winning durable song."""
    token = _get_token(client)
    winning_song = Song(
        deezer_id=None,
        title="Winning Song",
        artist="Winning Artist",
        artist_deezer_id=None,
        album="Winning Album",
        cover_url="https://example.com/winning.jpg",
    )
    db_session.add(winning_song)
    db_session.flush()
    db_session.add(
        SongProviderRef(
            song_id=winning_song.id,
            provider="apple",
            provider_track_id="race",
            storefront="US",
        )
    )
    db_session.commit()

    import src.services.provider_catalog as provider_catalog

    actual_get_song = provider_catalog.get_song_by_provider_track
    get_calls = 0

    def race_get_song(*args, **kwargs):
        nonlocal get_calls
        get_calls += 1
        if get_calls == 1:
            return None
        return actual_get_song(*args, **kwargs)

    def raise_conflict(*args, **kwargs):
        raise IntegrityError("insert provider ref", {}, Exception("duplicate provider ref"))

    monkeypatch.setattr("src.services.provider_catalog.get_song_by_provider_track", race_get_song)
    monkeypatch.setattr("src.services.provider_catalog.create_provider_ref", raise_conflict)
    monkeypatch.setattr(
        "src.services.provider_catalog.httpx.get",
        lambda *args, **kwargs: MockAppleResponse({"results": []}),
    )

    response = _finalize(
        client,
        token,
        _apple_payload(
            apple_track_id="race",
            title="Race Client",
        ),
    )

    assert response["ranking"]["song_id"] == winning_song.id
    assert get_calls >= 2


def test_apple_annotation_returns_song_and_current_user_rating(
    client: TestClient,
):
    """Annotation resolves Apple track/storefront to song_id and my rating state."""
    token = _get_token(client)
    _finalize(client, token, _apple_payload(apple_track_id="777", title="Known Apple"))

    response = client.post(
        "/api/v1/search/apple/annotations",
        json={
            "results": [
                {"apple_track_id": "777", "storefront": "US"},
                {"apple_track_id": "888", "storefront": "US"},
            ]
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["results"][0]["song_id"] is not None
    assert body["results"][0]["my_bucket"] == "like"
    assert body["results"][0]["already_rated"] is True
    assert body["results"][1] == {
        "apple_track_id": "888",
        "storefront": "US",
        "song_id": None,
        "my_bucket": None,
        "my_score": None,
        "already_rated": False,
    }


def test_apple_annotation_resolves_and_normalizes_three_letter_country_storefront(
    client: TestClient,
):
    """iTunes returns `country` as a 3-letter code ("USA"), which clients send as the storefront.

    The request schema normalizes it to the stored 2-letter form ("US"), so the direct rating
    lookup resolves AND the echoed storefront comes back "US". The client must key its rows by the
    same "US" (not "USA") to merge the rating in — the frontend bug this guards against. Title/
    artist are omitted so the fuzzy fallback can't mask the direct-hit path.
    """
    token = _get_token(client)
    payload = _apple_payload(apple_track_id="999", title="Country Apple")
    payload["song"]["storefront"] = "USA"
    _finalize(client, token, payload)

    response = client.post(
        "/api/v1/search/apple/annotations",
        json={"results": [{"apple_track_id": "999", "storefront": "USA"}]},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    result = response.json()["results"][0]
    assert result["already_rated"] is True
    assert result["my_bucket"] == "like"
    assert result["song_id"] is not None
    # Echoed as the normalized 2-letter storefront — the client must key its row by "US" to match.
    assert result["storefront"] == "US"


def test_saved_apple_song_can_rerate_by_listn_song_id(
    client: TestClient,
):
    """Persisted Apple songs can be rerated from Rankings/Song Detail by durable song id."""
    token = _get_token(client)
    finalized = _finalize(client, token, _apple_payload(apple_track_id="999", title="Saved Apple"))
    saved_song = finalized["ranking"]["song"]
    saved_song["provider"] = None
    saved_song["apple_track_id"] = None

    rerated = _finalize(
        client,
        token,
        {
            "song": saved_song,
            "bucket": "dislike",
        },
    )

    assert rerated["ranking"]["song_id"] == finalized["ranking"]["song_id"]
    assert rerated["ranking"]["bucket"] == "dislike"


def test_saved_apple_song_does_not_compare_against_itself(
    client: TestClient,
):
    """Starting a comparison rerate for a saved Apple song excludes its own ranking."""
    token = _get_token(client)
    finalized = _finalize(client, token, _apple_payload(apple_track_id="1000", title="Saved Apple"))
    saved_song = finalized["ranking"]["song"]

    response = client.post(
        "/api/v1/comparison-sessions",
        json={
            "song": saved_song,
            "bucket": "like",
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Comparison session is not required for an empty bucket."


def test_ranking_by_song_and_legacy_by_deezer_both_work(client: TestClient):
    """New by-song lookup coexists with the legacy by-deezer route."""
    token = _get_token(client)
    finalized = _finalize(client, token, _deezer_payload())
    song_id = finalized["ranking"]["song_id"]

    by_song = client.get(
        f"/api/v1/rankings/me/by-song/{song_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    by_deezer = client.get(
        "/api/v1/rankings/me/by-deezer/123",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert by_song.status_code == 200
    assert by_deezer.status_code == 200
    assert by_song.json()["song_id"] == by_deezer.json()["song_id"]


# --- Legacy-song fallback matching (songs rated before the Apple search migration) --------


def test_apple_annotation_fallback_matches_legacy_song_without_writing_ref(
    client: TestClient,
    db_session: Session,
):
    """A song rated before the Apple migration can annotate safely without mutating identity."""
    token = _get_token(client)
    finalized = _finalize(client, token, _deezer_payload())
    legacy_song_id = finalized["ranking"]["song_id"]

    response = client.post(
        "/api/v1/search/apple/annotations",
        json={
            "results": [
                {
                    "apple_track_id": "3001",
                    "storefront": "US",
                    "title": "Nights",
                    "artist": "Frank Ocean",
                    "album": "Blonde",
                }
            ]
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    result = response.json()["results"][0]
    assert result["song_id"] == legacy_song_id
    assert result["my_bucket"] == "like"
    assert result["already_rated"] is True

    provider_refs = db_session.execute(
        select(SongProviderRef)
        .where(SongProviderRef.provider == "apple")
        .where(SongProviderRef.provider_track_id == "3001")
    ).scalars().all()
    assert provider_refs == []

    # Annotation is intentionally read-only: without match fields, there is no direct hit.
    follow_up = client.post(
        "/api/v1/search/apple/annotations",
        json={"results": [{"apple_track_id": "3001", "storefront": "US"}]},
        headers={"Authorization": f"Bearer {token}"},
    )
    follow_up_result = follow_up.json()["results"][0]
    assert follow_up_result["song_id"] is None
    assert follow_up_result["already_rated"] is False


def test_apple_annotation_fallback_requires_album_match_for_single_candidate(
    client: TestClient,
    db_session: Session,
):
    """Same-title/same-artist Apple rows from other albums stay unrated."""
    token = _get_token(client)
    legacy_payload = _deezer_payload()
    legacy_payload["song"]["deezer_id"] = 8300
    legacy_payload["song"]["isrc"] = "USAT22602481"
    legacy_payload["song"]["title"] = "Smoke"
    legacy_payload["song"]["artist"] = "Skrillex, ISOxo, Cristale & TeeZandos"
    legacy_payload["song"]["artist_deezer_id"] = 8301
    legacy_payload["song"]["album"] = "SOMA"
    finalized = _finalize(client, token, legacy_payload)
    legacy_song_id = finalized["ranking"]["song_id"]

    response = client.post(
        "/api/v1/search/apple/annotations",
        json={
            "results": [
                {
                    "apple_track_id": "8302",
                    "storefront": "US",
                    "title": "Smoke",
                    "artist": "Skrillex, ISOxo, Cristale & TeeZandos",
                    "album": "VIP Club Music",
                }
            ]
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    result = response.json()["results"][0]
    assert result["song_id"] is None
    assert result["my_bucket"] is None
    assert result["already_rated"] is False

    refs = db_session.execute(
        select(SongProviderRef)
        .where(SongProviderRef.provider == "apple")
        .where(SongProviderRef.provider_track_id == "8302")
    ).scalars().all()
    assert refs == []

    ranking = db_session.execute(
        select(Ranking).where(Ranking.song_id == legacy_song_id)
    ).scalar_one()
    assert ranking.song_id == legacy_song_id


def test_apple_finalize_fallback_reuses_legacy_song_without_apple_lookup(
    client: TestClient,
    db_session: Session,
    monkeypatch,
):
    """Finalize reuses a legacy-rated song by title/artist/album match instead of creating a duplicate."""
    token = _get_token(client)
    finalized = _finalize(client, token, _deezer_payload())
    legacy_song_id = finalized["ranking"]["song_id"]

    def fail_lookup(*args, **kwargs):
        raise AssertionError("Legacy fallback match must short-circuit before any Apple lookup.")

    monkeypatch.setattr("src.services.provider_catalog.httpx.get", fail_lookup)

    response = _finalize(
        client,
        token,
        _apple_payload(apple_track_id="3002", title="Nights"),
    )

    assert response["ranking"]["song_id"] == legacy_song_id

    songs = db_session.execute(select(Song)).scalars().all()
    assert len(songs) == 1

    rankings = db_session.execute(
        select(Ranking).where(Ranking.song_id == legacy_song_id)
    ).scalars().all()
    assert len(rankings) == 1

    provider_ref = db_session.execute(
        select(SongProviderRef)
        .where(SongProviderRef.provider == "apple")
        .where(SongProviderRef.provider_track_id == "3002")
    ).scalar_one()
    assert provider_ref.song_id == legacy_song_id


def test_apple_finalize_fallback_requires_album_match_for_single_candidate(
    client: TestClient,
    db_session: Session,
    monkeypatch,
):
    """Rating a same-title/same-artist Apple track from another album creates a new song."""
    token = _get_token(client)
    legacy_payload = _deezer_payload()
    legacy_payload["song"]["deezer_id"] = 8400
    legacy_payload["song"]["isrc"] = "USAT22602481"
    legacy_payload["song"]["title"] = "Smoke"
    legacy_payload["song"]["artist"] = "Skrillex, ISOxo, Cristale & TeeZandos"
    legacy_payload["song"]["artist_deezer_id"] = 8401
    legacy_payload["song"]["album"] = "SOMA"
    legacy = _finalize(client, token, legacy_payload)
    legacy_song_id = legacy["ranking"]["song_id"]

    monkeypatch.setattr(
        "src.services.provider_catalog.httpx.get",
        lambda *args, **kwargs: MockAppleResponse({"results": []}),
    )

    apple_payload = _apple_payload(apple_track_id="8402", title="Smoke")
    apple_payload["song"]["artist"] = "Skrillex, ISOxo, Cristale & TeeZandos"
    apple_payload["song"]["album"] = "VIP Club Music"
    apple_payload["song"]["apple_view_url"] = (
        "https://music.apple.com/us/album/smoke/8402?i=8402"
    )
    apple_payload["song"]["apple_album_id"] = "84020"
    apple_payload["song"]["isrc"] = None
    apple_payload["bucket"] = "dislike"
    response = _finalize(client, token, apple_payload)

    assert response["ranking"]["song_id"] != legacy_song_id

    songs = db_session.execute(select(Song)).scalars().all()
    assert len(songs) == 2

    provider_ref = db_session.execute(
        select(SongProviderRef)
        .where(SongProviderRef.provider == "apple")
        .where(SongProviderRef.provider_track_id == "8402")
    ).scalar_one()
    assert provider_ref.song_id == response["ranking"]["song_id"]
    assert provider_ref.song_id != legacy_song_id


def test_apple_finalize_reclaims_untrusted_search_fallback_ref_for_new_song(
    client: TestClient,
    db_session: Session,
    monkeypatch,
):
    """A real finalize action can replace a stale search-written fallback identity."""
    token = _get_token(client)
    legacy_payload = _deezer_payload()
    legacy_payload["song"]["deezer_id"] = 8500
    legacy_payload["song"]["isrc"] = "USAT22602481"
    legacy_payload["song"]["title"] = "Smoke"
    legacy_payload["song"]["artist"] = "Skrillex, ISOxo, Cristale & TeeZandos"
    legacy_payload["song"]["artist_deezer_id"] = 8501
    legacy_payload["song"]["album"] = "SOMA"
    legacy = _finalize(client, token, legacy_payload)
    legacy_song_id = legacy["ranking"]["song_id"]
    legacy_song = db_session.get(Song, legacy_song_id)
    assert legacy_song is not None
    db_session.add(
        SongProviderRef(
            song_id=legacy_song_id,
            provider="apple",
            provider_track_id="8502",
            storefront="US",
            url=None,
            preview_available=None,
            confidence="apple_legacy_fallback_match",
        )
    )
    db_session.commit()

    monkeypatch.setattr(
        "src.services.provider_catalog.httpx.get",
        lambda *args, **kwargs: MockAppleResponse({"results": []}),
    )

    apple_payload = _apple_payload(apple_track_id="8502", title="Smoke")
    apple_payload["song"]["artist"] = "Skrillex, ISOxo, Cristale & TeeZandos"
    apple_payload["song"]["album"] = "VIP Club Music"
    apple_payload["song"]["apple_view_url"] = (
        "https://music.apple.com/us/album/smoke/8502?i=8502"
    )
    apple_payload["song"]["apple_album_id"] = "85020"
    apple_payload["song"]["isrc"] = None
    apple_payload["bucket"] = "dislike"
    response = _finalize(client, token, apple_payload)

    new_song_id = response["ranking"]["song_id"]
    assert new_song_id != legacy_song_id

    provider_ref = db_session.execute(
        select(SongProviderRef)
        .where(SongProviderRef.provider == "apple")
        .where(SongProviderRef.provider_track_id == "8502")
    ).scalar_one()
    assert provider_ref.song_id == new_song_id
    assert provider_ref.confidence == "apple_client_search"


def test_apple_annotation_fallback_overrides_conflicting_apple_ref(
    client: TestClient,
    db_session: Session,
    monkeypatch,
):
    """A user's legacy rating still shows as rated even when the Apple ref points elsewhere."""
    seed = _seed_apple_song_and_legacy_conflict(
        client,
        monkeypatch,
        apple_track_id="9001",
        owner_bucket="dislike",
    )

    response = client.post(
        "/api/v1/search/apple/annotations",
        json={
            "results": [
                {
                    "apple_track_id": "9001",
                    "storefront": "US",
                    "title": "Nights",
                    "artist": "Frank Ocean",
                    "album": "Blonde",
                }
            ]
        },
        headers={"Authorization": f"Bearer {seed['other_token']}"},
    )

    result = response.json()["results"][0]
    assert result["already_rated"] is True
    assert result["song_id"] == seed["song_y_id"]
    assert result["my_bucket"] == "like"

    refs = db_session.execute(
        select(SongProviderRef)
        .where(SongProviderRef.provider == "apple")
        .where(SongProviderRef.provider_track_id == "9001")
    ).scalars().all()
    assert len(refs) == 1
    assert refs[0].song_id == seed["song_x_id"]


def test_apple_finalize_fallback_updates_existing_ranking_despite_conflicting_ref(
    client: TestClient,
    db_session: Session,
    monkeypatch,
):
    """Finalize reuses the user's own legacy song/ranking instead of creating a second one."""
    seed = _seed_apple_song_and_legacy_conflict(
        client,
        monkeypatch,
        apple_track_id="9002",
        owner_bucket="like",
    )

    other_payload = _apple_payload(apple_track_id="9002", title="Nights")
    other_payload["bucket"] = "dislike"
    response = _finalize(client, seed["other_token"], other_payload)

    assert response["ranking"]["song_id"] == seed["song_y_id"]
    assert response["ranking"]["bucket"] == "dislike"

    rankings = db_session.execute(
        select(Ranking).where(Ranking.song_id == seed["song_y_id"])
    ).scalars().all()
    assert len(rankings) == 1

    songs = db_session.execute(select(Song)).scalars().all()
    assert {song.id for song in songs} == {seed["song_x_id"], seed["song_y_id"]}


def test_apple_finalize_no_fallback_match_reuses_existing_apple_song(
    client: TestClient,
    db_session: Session,
    monkeypatch,
):
    """A second, unrelated user rating the same Apple track attaches normally (no conflict)."""
    monkeypatch.setattr(
        "src.services.provider_catalog.httpx.get",
        lambda *args, **kwargs: MockAppleResponse({"results": []}),
    )
    owner_token = _get_token(client, email="shared-owner@example.com", username="sharedowner")
    owner_response = _finalize(
        client,
        owner_token,
        _apple_payload(apple_track_id="9500", title="Nights"),
    )
    song_x_id = owner_response["ranking"]["song_id"]

    other_token = _get_token(client, email="shared-other@example.com", username="sharedother")
    other_response = _finalize(
        client,
        other_token,
        _apple_payload(apple_track_id="9500", title="Nights"),
    )

    assert other_response["ranking"]["song_id"] == song_x_id
    songs = db_session.execute(select(Song)).scalars().all()
    assert len(songs) == 1


def test_apple_annotation_fallback_no_match_stays_unrated(
    client: TestClient,
    db_session: Session,
):
    """Unrelated title/artist falls through to today's unrated behavior, no ref written."""
    token = _get_token(client)
    _finalize(client, token, _deezer_payload())

    response = client.post(
        "/api/v1/search/apple/annotations",
        json={
            "results": [
                {
                    "apple_track_id": "5001",
                    "storefront": "US",
                    "title": "Completely Different Song",
                    "artist": "Someone Else",
                    "album": "Nowhere",
                }
            ]
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    result = response.json()["results"][0]
    assert result["already_rated"] is False
    assert result["song_id"] is None

    refs = db_session.execute(
        select(SongProviderRef).where(SongProviderRef.provider == "apple")
    ).scalars().all()
    assert refs == []


def test_apple_annotation_fallback_ambiguous_tie_stays_unrated(
    client: TestClient,
    db_session: Session,
):
    """Two of the user's own songs sharing title+artist, with no disambiguating album, never guess."""
    token = _get_token(client)
    _finalize(client, token, _deezer_payload())
    user_id = db_session.execute(
        select(User).where(User.email == "provider@example.com")
    ).scalar_one().id
    _seed_legacy_song_and_ranking(
        db_session,
        user_id,
        deezer_id=6001,
        title="Nights",
        artist="Frank Ocean",
        album="Endless",
    )

    response = client.post(
        "/api/v1/search/apple/annotations",
        json={
            "results": [
                {
                    "apple_track_id": "6002",
                    "storefront": "US",
                    "title": "Nights",
                    "artist": "Frank Ocean",
                }
            ]
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    result = response.json()["results"][0]
    assert result["already_rated"] is False
    assert result["song_id"] is None


def test_apple_annotation_fallback_album_breaks_tie(
    client: TestClient,
    db_session: Session,
):
    """A disambiguating album isolates the correct song among title+artist ties."""
    token = _get_token(client)
    finalized = _finalize(client, token, _deezer_payload())
    blonde_song_id = finalized["ranking"]["song_id"]
    user_id = db_session.execute(
        select(User).where(User.email == "provider@example.com")
    ).scalar_one().id
    _seed_legacy_song_and_ranking(
        db_session,
        user_id,
        deezer_id=7001,
        title="Nights",
        artist="Frank Ocean",
        album="Endless",
    )

    response = client.post(
        "/api/v1/search/apple/annotations",
        json={
            "results": [
                {
                    "apple_track_id": "7002",
                    "storefront": "US",
                    "title": "Nights",
                    "artist": "Frank Ocean",
                    "album": "Blonde",
                }
            ]
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    result = response.json()["results"][0]
    assert result["already_rated"] is True
    assert result["song_id"] == blonde_song_id


def test_apple_annotation_and_finalize_fallback_scoped_to_requesting_user(
    client: TestClient,
    db_session: Session,
):
    """One user's rated song never matches a different user's identically-titled search."""
    owner_token = _get_token(client, email="scope-owner@example.com", username="scopeowner")
    owner_finalized = _finalize(client, owner_token, _deezer_payload())
    owner_song_id = owner_finalized["ranking"]["song_id"]

    other_token = _get_token(client, email="scope-other@example.com", username="scopeother")

    annotate_response = client.post(
        "/api/v1/search/apple/annotations",
        json={
            "results": [
                {
                    "apple_track_id": "8001",
                    "storefront": "US",
                    "title": "Nights",
                    "artist": "Frank Ocean",
                    "album": "Blonde",
                }
            ]
        },
        headers={"Authorization": f"Bearer {other_token}"},
    )
    result = annotate_response.json()["results"][0]
    assert result["already_rated"] is False
    assert result["song_id"] is None

    finalize_response = _finalize(
        client,
        other_token,
        _apple_payload(apple_track_id="8001", title="Nights"),
    )
    assert finalize_response["ranking"]["song_id"] != owner_song_id

    refs = db_session.execute(
        select(SongProviderRef).where(SongProviderRef.provider == "apple")
    ).scalars().all()
    assert len(refs) == 1
    assert refs[0].song_id != owner_song_id
