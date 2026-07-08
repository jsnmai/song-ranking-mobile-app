# Conservative identity matching against a user's own rated songs.
#
# Apple's iTunes Search/Lookup API never returns ISRC, so a search result surfaced through
# Apple has no cross-provider key to compare against a song the user rated before the
# Deezer->Apple migration. This module matches on normalized title/artist/album, scoped
# strictly to one user's own rated songs so a match can never reattach a rating to a song
# some other user rated.
import re
import unicodedata
from dataclasses import dataclass

from sqlalchemy.orm import Session

from src.crud.rating import RankingRow, list_all_user_rankings_with_songs
from src.sqlalchemy_tables.ranking import Ranking
from src.sqlalchemy_tables.song import Song

_NON_MATCH_CHARS = re.compile(r"[^a-z0-9\s]")
_WHITESPACE = re.compile(r"\s+")


def normalize_match_text(value: str | None) -> str:
    """Fold a title/artist/album string to a case- and punctuation-insensitive key."""
    if not value:
        return ""
    decomposed = unicodedata.normalize("NFKD", value)
    ascii_only = decomposed.encode("ascii", "ignore").decode("ascii")
    folded = ascii_only.casefold()
    stripped = _NON_MATCH_CHARS.sub(" ", folded)
    return _WHITESPACE.sub(" ", stripped).strip()


@dataclass(frozen=True)
class MatchCandidate:
    """One of a user's rated songs, pre-normalized for repeated matching."""

    ranking: Ranking
    song: Song
    normalized_title: str
    normalized_artist: str
    normalized_album: str


def build_match_candidates(rows: list[RankingRow]) -> list[MatchCandidate]:
    """Pre-normalize a user's rated songs once so many items can be matched against them."""
    return [
        MatchCandidate(
            ranking=row.ranking,
            song=row.song,
            normalized_title=normalize_match_text(row.song.title),
            normalized_artist=normalize_match_text(row.song.artist),
            normalized_album=normalize_match_text(row.song.album),
        )
        for row in rows
    ]


def _is_self_titled_container(normalized_album: str, normalized_title: str) -> bool:
    """Whether an album is Apple's single/EP container named after the track itself.

    Apple names those releases "<Title> - Single" / "<Title> - EP", which normalization
    folds to "<title> single" / "<title> ep". Such an album restates the track's own name,
    so it carries no discriminating information about WHICH song this is — requiring album
    agreement against it can only block a legitimate match (rated the single, later saw the
    album cut of the same recording), never prevent a collision.
    """
    return normalized_album in (f"{normalized_title} single", f"{normalized_title} ep")


def match_candidate(
    candidates: list[MatchCandidate],
    title: str,
    artist: str,
    album: str | None = None,
) -> RankingRow | None:
    """
    Return the one candidate matching title+artist+album, or None if there is no confident match.

    Apple search returns many same-title/same-artist rows for compilations, singles, and
    remixes. Album agreement is required even when the user has only one rated song with
    that title+artist, since misattaching someone's rating to the wrong song is worse than
    leaving one song un-deduplicated. The one exception: a self-titled single/EP container
    ("<Title> - Single") names the track, not a real album, so when either side's album is
    that container and exactly one candidate matches title+artist, the match holds — this is
    what lets a rating made on the single follow the same recording onto its album release
    (and vice versa) instead of the album cut showing unrated or forking a duplicate song.
    Two disagreeing REAL albums still refuse to match.
    """
    normalized_title = normalize_match_text(title)
    normalized_artist = normalize_match_text(artist)
    normalized_album = normalize_match_text(album)
    if not normalized_title or not normalized_artist or not normalized_album:
        return None

    title_artist_matches = [
        candidate
        for candidate in candidates
        if candidate.normalized_title == normalized_title
        and candidate.normalized_artist == normalized_artist
    ]
    album_matches = [
        candidate
        for candidate in title_artist_matches
        if candidate.normalized_album == normalized_album
    ]
    if len(album_matches) == 1:
        return RankingRow(ranking=album_matches[0].ranking, song=album_matches[0].song)
    if len(album_matches) == 0 and len(title_artist_matches) == 1:
        only = title_artist_matches[0]
        if (
            _is_self_titled_container(normalized_album, normalized_title)
            or _is_self_titled_container(only.normalized_album, only.normalized_title)
        ):
            return RankingRow(ranking=only.ranking, song=only.song)

    return None


def find_users_rated_song_match(
    db: Session,
    user_id: int,
    title: str,
    artist: str,
    album: str | None = None,
) -> RankingRow | None:
    """Single-call convenience wrapper for call sites that match at most once per request."""
    candidates = build_match_candidates(list_all_user_rankings_with_songs(db, user_id))
    return match_candidate(candidates, title, artist, album)
