// TypeScript types for song search.
// These mirror backend/src/pydantic_schemas/search.py.

// Mirrors SongSearchResult.
export type SongSearchResult = {
    deezer_id: number;
    isrc: string | null;
    title: string;
    artist: string;
    artist_deezer_id: number;
    album: string;
    cover_url: string;
    preview_url: string | null;
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
