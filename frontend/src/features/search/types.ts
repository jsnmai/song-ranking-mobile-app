// TypeScript types for song search.
// These mirror backend/src/pydantic_schemas/search.py.

// Mirrors SongSearchResult.
export type SongSearchResult = {
    id?: number;
    provider?: "apple" | "deezer_legacy";
    deezer_id: number | null;
    isrc: string | null;
    title: string;
    artist: string;
    artist_deezer_id: number | null;
    album: string;
    cover_url: string;
    preview_url: string | null;
    apple_track_id?: string;
    storefront?: string;
    apple_view_url?: string | null;
    artwork_url?: string | null;
    apple_artist_id?: string | null;
    apple_album_id?: string | null;
    duration_ms?: number | null;
    genre?: string | null;
    release_year?: number | null;
    preview_available?: boolean | null;
    song_id?: number | null;
    // Aggregate fields present when the song is persisted to the DB; absent for raw search results.
    global_avg_score?: number | null;
    global_rating_count?: number;
    // Viewer's existing rating, present on search results so rows can show a rated state.
    my_bucket?: string | null;
    my_score?: number | null;
}

// Mirrors SongSearchResponse.
export type SongSearchResponse = {
    results: SongSearchResult[];
}

export type AppleSearchAnnotationResult = {
    apple_track_id: string;
    storefront: string;
    song_id: number | null;
    my_bucket: string | null;
    my_score: number | null;
    already_rated: boolean;
}

export type AppleSearchAnnotationResponse = {
    results: AppleSearchAnnotationResult[];
}
