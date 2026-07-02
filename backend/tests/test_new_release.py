# Tests for the global Discover New Release feed (batch pipeline + endpoint).
# All provider HTTP (ListenBrainz, MusicBrainz, Apple) is mocked; nothing hits the network.
from datetime import date, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.crud.new_release import create_new_release
from src.pydantic_schemas.song import SongCreate
from src.services.new_release import get_new_release, refresh_new_releases_if_stale
from src.services.song import persist_user_touched_song
from src.sqlalchemy_tables.new_release import NewRelease
from src.sqlalchemy_tables.song import Song
from src.sqlalchemy_tables.song_provider_ref import SongProviderRef


class MockJsonResponse:
    """Minimal httpx.Response stand-in."""

    def __init__(
        self,
        payload: dict,
    ) -> None:
        self.payload = payload

    def raise_for_status(self) -> None:
        """Match the httpx response API used by the services."""
        return None

    def json(self) -> dict:
        """Return the mocked payload."""
        return self.payload


def _fresh_release_row(
    release_name: str,
    release_mbid: str,
    release_group_mbid: str,
    released_at: str,
    primary_type: str = "Album",
    caa_id: int | None = 123456,
) -> dict:
    """Return one ListenBrainz fresh-release row."""
    return {
        "release_name": release_name,
        "artist_credit_name": "Frank Ocean",
        "release_mbid": release_mbid,
        "release_group_mbid": release_group_mbid,
        "release_date": released_at,
        "release_group_primary_type": primary_type,
        "caa_id": caa_id,
    }


def _apple_upc_payload(track_id: int) -> dict:
    """Return an Apple UPC lookup payload: collection row plus two track rows."""
    return {
        "results": [
            {
                "wrapperType": "collection",
                "collectionId": 111,
                "collectionName": "Blonde",
            },
            {
                "wrapperType": "track",
                "kind": "song",
                "trackId": track_id,
                "trackNumber": 2,
                "discNumber": 1,
                "trackName": "Ivy",
                "artistName": "Frank Ocean",
                "collectionName": "Blonde",
                "collectionId": 111,
                "artistId": 442122051,
                "artworkUrl100": "https://is1-ssl.mzstatic.com/image/thumb/Music/100x100bb.jpg",
                "trackViewUrl": f"https://music.apple.com/us/album/ivy/{track_id}",
                "previewUrl": "https://audio-ssl.itunes.apple.com/preview.m4a",
                "primaryGenreName": "R&B/Soul",
                "trackTimeMillis": 249000,
            },
            {
                "wrapperType": "track",
                "kind": "song",
                "trackId": track_id + 1,
                "trackNumber": 1,
                "discNumber": 1,
                "trackName": "Nikes",
                "artistName": "Frank Ocean",
                "collectionName": "Blonde",
                "collectionId": 111,
                "artistId": 442122051,
                "artworkUrl100": "https://is1-ssl.mzstatic.com/image/thumb/Music/100x100bb.jpg",
                "trackViewUrl": f"https://music.apple.com/us/album/nikes/{track_id + 1}",
                "previewUrl": "https://audio-ssl.itunes.apple.com/preview2.m4a",
                "primaryGenreName": "R&B/Soul",
                "trackTimeMillis": 314000,
            },
        ]
    }


def _mock_pipeline_http(
    monkeypatch,
    lb_releases: list[dict],
    barcodes: dict[str, str],
    apple_tracks: dict[str, int],
) -> None:
    """
    Wire every provider HTTP surface for a batch run with ONE dispatcher.

    All service modules share the single httpx module object, so patching any
    `<module>.httpx.get` alias patches them all — a per-module patch would just be
    overwritten by the next one. Dispatch by URL instead.
    """

    def fake_httpx_get(url, params=None, headers=None, timeout=None):
        if "listenbrainz" in url:
            return MockJsonResponse({"payload": {"releases": lb_releases}})
        if "musicbrainz.org/ws/2/release/" in url:
            release_mbid = url.rstrip("/").rsplit("/", 1)[-1]
            return MockJsonResponse({"barcode": barcodes.get(release_mbid)})
        if "itunes.apple.com/lookup" in url:
            upc = (params or {}).get("upc")
            if upc in apple_tracks:
                return MockJsonResponse(_apple_upc_payload(apple_tracks[upc]))
            # Covers unresolvable UPCs and the finalize path's authoritative track
            # lookup (which then falls back to the batch-provided payload).
            return MockJsonResponse({"results": []})
        raise AssertionError(f"Unexpected provider URL in batch test: {url}")

    monkeypatch.setattr(
        "src.services.new_release.httpx.get",
        fake_httpx_get,
    )
    monkeypatch.setattr(
        "src.services.new_release.time.sleep",
        lambda seconds: None,
    )
    monkeypatch.setattr(
        "src.services.musicbrainz.time.sleep",
        lambda seconds: None,
    )


def _register(
    client: TestClient,
    email: str = "release@example.com",
    username: str = "releaseuser",
) -> str:
    """Register a user and return the JWT."""
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "password123",
            "birthdate": "2000-01-01",
            "display_name": "Release User",
            "username": username,
        },
    )
    assert response.status_code == 201
    return response.json()["access_token"]


def test_refresh_features_albums_and_skips_singles_and_repeats(
    db_session: Session,
    monkeypatch,
):
    """The batch features Apple-resolvable Albums/EPs and never repeats a release group."""
    lb_releases = [
        _fresh_release_row(
            "Fresh Album",
            release_mbid="release-album",
            release_group_mbid="rg-album",
            released_at="2026-07-01",
        ),
        _fresh_release_row(
            "Fresh Single",
            release_mbid="release-single",
            release_group_mbid="rg-single",
            released_at="2026-07-01",
            primary_type="Single",
        ),
        _fresh_release_row(
            "Already Featured",
            release_mbid="release-repeat",
            release_group_mbid="rg-featured-before",
            released_at="2026-06-30",
        ),
        _fresh_release_row(
            "No Art",
            release_mbid="release-noart",
            release_group_mbid="rg-noart",
            released_at="2026-06-30",
            caa_id=None,
        ),
        _fresh_release_row(
            "Not On Apple",
            release_mbid="release-unresolvable",
            release_group_mbid="rg-unresolvable",
            released_at="2026-06-29",
        ),
    ]
    # Seed a prior batch containing rg-featured-before so the repeat is skipped.
    prior_song = persist_user_touched_song(
        db_session,
        SongCreate(
            deezer_id=770001,
            isrc=None,
            title="Old Feature",
            artist="Artist",
            artist_deezer_id=None,
            album="Old Album",
            cover_url="https://example.com/old.jpg",
            preview_url=None,
            genre_deezer=None,
        ),
    )
    create_new_release(
        db_session,
        song_id=prior_song.id,
        released_at=date(2026, 6, 1),
        release_group_mbid="rg-featured-before",
        batch_date=date(2026, 6, 1),
        rank=0,
    )
    db_session.commit()

    _mock_pipeline_http(
        monkeypatch,
        lb_releases=lb_releases,
        barcodes={
            "release-album": "638647991025",
            "release-repeat": "111111111111",
            "release-unresolvable": "222222222222",
        },
        apple_tracks={"638647991025": 900100},
    )

    featured = refresh_new_releases_if_stale()

    assert featured == 1
    row = db_session.execute(
        select(NewRelease).where(NewRelease.release_group_mbid == "rg-album")
    ).scalar_one()
    song = db_session.get(Song, row.song_id)
    # Track 1 of the collection is the feature, not the first row Apple returned.
    assert song.title == "Nikes"
    assert song.preview_url is None
    provider_ref = db_session.execute(
        select(SongProviderRef)
        .where(SongProviderRef.song_id == song.id)
        .where(SongProviderRef.provider == "apple")
    ).scalar_one()
    assert provider_ref.provider_track_id == "900101"
    assert db_session.execute(
        select(NewRelease).where(NewRelease.release_group_mbid == "rg-single")
    ).scalar_one_or_none() is None
    assert db_session.execute(
        select(NewRelease).where(NewRelease.release_group_mbid == "rg-unresolvable")
    ).scalar_one_or_none() is None


def test_refresh_skips_when_current_batch_is_fresh(
    db_session: Session,
    monkeypatch,
):
    """No provider is called while the newest batch is inside the refresh window."""
    song = persist_user_touched_song(
        db_session,
        SongCreate(
            deezer_id=770002,
            isrc=None,
            title="Recent Feature",
            artist="Artist",
            artist_deezer_id=None,
            album="Recent Album",
            cover_url="https://example.com/recent.jpg",
            preview_url=None,
            genre_deezer=None,
        ),
    )
    create_new_release(
        db_session,
        song_id=song.id,
        released_at=date.today() - timedelta(days=2),
        release_group_mbid="rg-recent",
        batch_date=date.today() - timedelta(days=1),
        rank=0,
    )
    db_session.commit()

    def fail_if_called(*args, **kwargs):
        raise AssertionError("A fresh batch must not trigger provider calls.")

    monkeypatch.setattr(
        "src.services.new_release.httpx.get",
        fail_if_called,
    )

    assert refresh_new_releases_if_stale() == 0


def test_new_release_endpoint_returns_daily_pick(
    client: TestClient,
    db_session: Session,
):
    """The endpoint serves one item from the latest batch with provider hints attached."""
    token = _register(client)
    song = persist_user_touched_song(
        db_session,
        SongCreate(
            deezer_id=770003,
            isrc=None,
            title="Featured Song",
            artist="Fresh Artist",
            artist_deezer_id=None,
            album="Fresh Album",
            cover_url="https://example.com/fresh.jpg",
            preview_url="https://example.com/fresh-preview.mp3",
            genre_deezer=None,
        ),
    )
    create_new_release(
        db_session,
        song_id=song.id,
        released_at=date(2026, 6, 28),
        release_group_mbid="rg-endpoint",
        batch_date=date.today(),
        rank=0,
    )
    db_session.commit()

    response = client.get(
        "/api/v1/discover/new-release",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 1
    assert items[0]["song"]["title"] == "Featured Song"
    assert items[0]["released_at"] == "2026-06-28"


def test_new_release_endpoint_is_empty_before_first_batch(
    client: TestClient,
):
    """Before any batch lands the endpoint returns an empty list, never an error."""
    token = _register(
        client,
        email="empty@example.com",
        username="emptyuser",
    )
    response = client.get(
        "/api/v1/discover/new-release",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert response.json() == {"items": []}


def test_daily_pick_rotates_deterministically(
    db_session: Session,
):
    """The pick is a stable function of today's date across the batch rows."""
    songs = []
    for index in range(2):
        songs.append(
            persist_user_touched_song(
                db_session,
                SongCreate(
                    deezer_id=770010 + index,
                    isrc=None,
                    title=f"Rotation {index}",
                    artist="Artist",
                    artist_deezer_id=None,
                    album="Album",
                    cover_url="https://example.com/rotation.jpg",
                    preview_url=None,
                    genre_deezer=None,
                ),
            )
        )
    for index, song in enumerate(songs):
        create_new_release(
            db_session,
            song_id=song.id,
            released_at=date(2026, 6, 28),
            release_group_mbid=f"rg-rotate-{index}",
            batch_date=date.today(),
            rank=index,
        )
    db_session.commit()

    expected_index = date.today().toordinal() % len(songs)
    first = get_new_release(db_session)
    second = get_new_release(db_session)

    assert first.items[0].song.title == f"Rotation {expected_index}"
    assert second.items[0].song.title == first.items[0].song.title
