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
