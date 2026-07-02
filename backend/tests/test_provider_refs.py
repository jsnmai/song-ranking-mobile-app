# Integration tests for Slice 1 provider refs and Apple finalize behavior.
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.song import Song
from src.sqlalchemy_tables.song_provider_ref import SongProviderRef


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
