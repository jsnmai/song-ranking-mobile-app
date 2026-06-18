// TypeScript types for the social feed.
// These mirror backend/src/pydantic_schemas/feed.py.
import { PersistedSong, RatingEventResponse } from "../comparison/types"
import { ProfileBase } from "../profile/types"

export type FeedEvent = {
    id: number;
    event_type: RatingEventResponse["event_type"];
    new_bucket: "like" | "alright" | "dislike";
    new_score: number;
    note: string | null;
    like_count: number | null;
    liked_by_viewer: boolean;
    created_at: string;
    actor_profile: ProfileBase;
    song: PersistedSong;
}

export type FeedListResponse = {
    events: FeedEvent[];
    next_cursor: string | null;
}

// Circle members (mutual follows, visible) who currently rate one song — Recent Verdict avatars.
export type CircleRatersResponse = {
    raters: ProfileBase[];
}

type Bucket = "like" | "alright" | "dislike"

// Re-rate Radar: a followed user's recent score change on a song (the previous → new delta).
export type RerateRadarItem = {
    rating_event_id: number;
    actor_profile: ProfileBase;
    song: PersistedSong;
    previous_bucket: Bucket;
    previous_score: number;
    new_bucket: Bucket;
    new_score: number;
    note: string | null;
    created_at: string;
}

// Bundled Feed module aggregates (GET /api/v1/feed/modules). Only Re-rate Radar is live;
// the other keys are reserved and always null until each module ships. Mirrors
// backend/src/pydantic_schemas/feed.py::FeedModulesResponse.
export type FeedModulesResponse = {
    rerate_radar: RerateRadarItem | null;
    consensus: null;
    disagreement_spotlight: null;
    split_decision: null;
    match_moment: null;
}
