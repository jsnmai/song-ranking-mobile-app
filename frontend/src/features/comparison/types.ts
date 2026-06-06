// TypeScript types for Phase 5 rating and comparison flows.
// These mirror backend/src/pydantic_schemas/rating.py and comparison.py.

import { SongSearchResult } from "../search/types"

export type BucketName = "like" | "alright" | "dislike"

export type PersistedSong = SongSearchResult & {
    id: number;
    genre_deezer: string | null;
    musicbrainz_id: string | null;
    genres_mb: string[] | null;
    release_year: number | null;
    spotify_energy: number | null;
    spotify_valence: number | null;
    spotify_tempo: number | null;
    spotify_danceability: number | null;
    metadata_enriched_at: string | null;
    spotify_enriched_at: string | null;
    global_avg_score: number | null;
    global_rating_count: number;
    created_at: string;
}

export type RankingResponse = {
    id: number;
    song_id: number;
    bucket: BucketName;
    position: number;
    score: number;
    created_at: string;
    updated_at: string;
    song: PersistedSong;
}

export type RatingEventResponse = {
    id: number;
    song_id: number;
    event_type: "rated" | "rerated" | "removed" | "reordered";
    previous_bucket: BucketName | null;
    new_bucket: BucketName | null;
    previous_position: number | null;
    new_position: number | null;
    previous_score: number | null;
    new_score: number | null;
    note: string | null;
    source: "direct" | "comparison" | "remove" | "reorder" | null;
    comparison_session_uuid: string | null;
    event_metadata: Record<string, unknown> | null;
    created_at: string;
}

export type RatingFinalizeResponse = {
    ranking: RankingResponse;
    rating_event: RatingEventResponse;
}

export type RatingRemoveResponse = {
    rating_event: RatingEventResponse;
}

export type RankingListResponse = {
    rankings: RankingResponse[];
    next_cursor: string | null;
}

export type RankingAnchorsResponse = {
    top_like: RankingResponse | null;
    median_okay: RankingResponse | null;
    lowest_dislike: RankingResponse | null;
}

export type RankingReorderItem = {
    song_id: number;
    bucket: BucketName;
}

export type RankingReorderResponse = {
    rankings: RankingResponse[];
    rating_events: RatingEventResponse[];
}

export type ComparisonBucketRankingItem = {
    song_id: number;
    title: string;
}

export type ComparisonSessionResponse = {
    session_uuid: string;
    bucket: BucketName;
    status: "active" | "ready_to_finalize";
    target_song: SongSearchResult;
    candidate: RankingResponse | null;
    final_position: number | null;
    comparison_count: number;
    low_index: number;
    high_index: number;
    candidate_index: number | null;
    total_in_bucket: number;
    current_bucket_rankings: ComparisonBucketRankingItem[];
    created_at: string;
}

export type ComparisonSessionFinalizeResponse = {
    result: RatingFinalizeResponse;
}

export type ComparisonSessionCancelResponse = {
    session_uuid: string;
    canceled: boolean;
}
