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

// Consensus: how the viewer's friends (mutual follows) collectively scored one song —
// friend average, friend count, and a 10-bin score distribution. The viewer is never included.
export type ConsensusModule = {
    song: PersistedSong;
    average_score: number;
    contributor_count: number;
    distribution: number[];   // always 10 bins, scores [0,1)…[9,10]
}

// Disagreement Spotlight: the song where YOUR score diverges most from your friends' average.
// friends = mutual follows (viewer excluded from friends_average). gap = abs(your − friends).
export type DisagreementModule = {
    song: PersistedSong;
    your_score: number;
    friends_average: number;
    friends_count: number;
    gap: number;
    direction: "viewer_higher" | "friends_higher";
}

// Bundled Feed module aggregates (GET /api/v1/feed/modules). Re-rate Radar, Consensus, and
// Disagreement Spotlight are live; the rest are reserved and null until each ships. Mirrors
// backend/src/pydantic_schemas/feed.py::FeedModulesResponse.
export type FeedModulesResponse = {
    rerate_radar: RerateRadarItem | null;
    consensus: ConsensusModule | null;
    disagreement_spotlight: DisagreementModule | null;
    split_decision: null;
    match_moment: null;
}
