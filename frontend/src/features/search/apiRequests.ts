// API functions for song search.
// Discover calls these instead of calling apiClient directly.

import { apiClient } from "../../api/client"
import { upsizeCoverArt } from "../../utils/artwork"
import { AppleSearchAnnotationRequest, AppleSearchAnnotationResponse, SongSearchResponse, SongSearchResult } from "./types"

const APPLE_SEARCH_URL = "https://itunes.apple.com/search"
const APPLE_STOREFRONT = "US"
// Apple's public search API doesn't support offset-based pagination (verified: an offset
// param is silently ignored), so "load more" is client-side over one larger fetched batch
// rather than a second network request. Capped at 50 to match the backend annotation
// endpoint's per-request item limit (AppleSearchAnnotationRequest.results, max_length=50).
const APPLE_SEARCH_LIMIT = 50

type AppleSearchPayload = {
    results?: AppleSearchRow[];
}

type AppleSearchRow = {
    trackId?: number;
    trackName?: string;
    artistName?: string;
    collectionName?: string;
    artworkUrl100?: string;
    previewUrl?: string;
    trackViewUrl?: string;
    primaryGenreName?: string;
    trackTimeMillis?: number;
    releaseDate?: string;
    artistId?: number;
    collectionId?: number;
    country?: string;
}

// Client-direct Apple Search for launch S1. Durable writes still go through LISTn backend finalize.
export async function searchSongs(query: string, token: string): Promise<SongSearchResponse> {
    const encodedQuery = encodeURIComponent(query)
    const response = await fetch(
        `${APPLE_SEARCH_URL}?term=${encodedQuery}&media=music&entity=song&country=${APPLE_STOREFRONT}&limit=${APPLE_SEARCH_LIMIT}`,
    )
    if (!response.ok) {
        throw new Error("Song search is temporarily unavailable.")
    }
    const payload = await response.json() as AppleSearchPayload
    const mapped = (payload.results ?? [])
        .map(mapAppleSearchRow)
        .filter((song): song is SongSearchResult => song !== null)
    const annotations = await annotateAppleSearchResults(mapped, token)
    return { results: mergeAppleAnnotations(mapped, annotations) }
}

async function annotateAppleSearchResults(
    songs: SongSearchResult[],
    token: string,
): Promise<AppleSearchAnnotationResponse> {
    if (songs.length === 0) {
        return { results: [] }
    }
    // apple_track_id is typed optional on SongSearchResult (shared with non-Apple providers)
    // but every `song` here came through mapAppleSearchRow, which never omits it.
    return apiClient.post<AppleSearchAnnotationResponse>(
        "/api/v1/search/apple/annotations",
        {
            results: songs.map((song) => ({
                apple_track_id: song.apple_track_id as string,
                storefront: song.storefront ?? APPLE_STOREFRONT,
                title: song.title,
                artist: song.artist,
                album: song.album,
            })),
        } satisfies AppleSearchAnnotationRequest,
        token,
    )
}

function mergeAppleAnnotations(
    songs: SongSearchResult[],
    annotations: AppleSearchAnnotationResponse,
): SongSearchResult[] {
    const byIdentity = new Map(
        annotations.results.map((item) => [`${item.apple_track_id}:${item.storefront}`, item]),
    )
    return songs.map((song) => {
        const annotation = byIdentity.get(`${song.apple_track_id}:${song.storefront ?? APPLE_STOREFRONT}`)
        if (annotation === undefined) {
            return song
        }
        return {
            ...song,
            song_id: annotation.song_id,
            my_bucket: annotation.my_bucket,
            my_score: annotation.my_score,
        }
    })
}

function mapAppleSearchRow(row: AppleSearchRow): SongSearchResult | null {
    if (row.trackId == null || row.trackName == null || row.artistName == null) {
        return null
    }
    const artworkUrl = upsizeCoverArt(row.artworkUrl100 ?? "")
    const releaseYear = releaseYearFromDate(row.releaseDate)
    return {
        provider: "apple",
        deezer_id: null,
        isrc: null,
        title: row.trackName,
        artist: row.artistName,
        artist_deezer_id: null,
        album: row.collectionName ?? "Unknown Album",
        cover_url: artworkUrl,
        artwork_url: artworkUrl,
        preview_url: row.previewUrl ?? null,
        apple_track_id: String(row.trackId),
        storefront: row.country ?? APPLE_STOREFRONT,
        apple_view_url: row.trackViewUrl ?? null,
        apple_artist_id: row.artistId != null ? String(row.artistId) : null,
        apple_album_id: row.collectionId != null ? String(row.collectionId) : null,
        duration_ms: row.trackTimeMillis ?? null,
        genre: row.primaryGenreName ?? null,
        release_year: releaseYear,
        preview_available: row.previewUrl != null,
        my_bucket: null,
        my_score: null,
    }
}


function releaseYearFromDate(value?: string): number | null {
    if (value == null || value.length < 4) {
        return null
    }
    const year = Number(value.slice(0, 4))
    return Number.isFinite(year) ? year : null
}
