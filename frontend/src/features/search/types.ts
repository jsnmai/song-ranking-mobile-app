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
}

// Mirrors SongSearchResponse.
export type SongSearchResponse = {
    results: SongSearchResult[];
}
