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
    created_at: string;
    actor_profile: ProfileBase;
    song: PersistedSong;
}

export type FeedListResponse = {
    events: FeedEvent[];
    next_cursor: string | null;
}
