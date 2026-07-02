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
    low_score: number;        // lowest friend score — spread bar's left endpoint
    high_score: number;       // highest friend score — spread bar's right endpoint
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

// Split Decision: a song where two people the viewer follows are far apart (viewer not involved).
export type SplitPerson = {
    profile: ProfileBase;
    score: number;
}

export type SplitDecisionModule = {
    song: PersistedSong;
    high: SplitPerson;   // higher scorer
    low: SplitPerson;    // lower scorer
    gap: number;
}

// Match Moment: a recent finalized head-to-head pick by someone the viewer follows — the actor
// chose `winner` over `loser` in the ranking flow. Audience = people you follow (one-way), viewer
// excluded. decision_duration_ms is how long the pick took (null for legacy rows).
export type MatchMomentModule = {
    actor_profile: ProfileBase;
    winner: PersistedSong;
    loser: PersistedSong;
    decision_duration_ms: number | null;
    created_at: string;
}

export type ThisOrThatOption = {
    ranking_id: number;
    song: PersistedSong;
    bucket: Bucket;
    position: number;
    score: number;
}

export type ThisOrThatModule = {
    left: ThisOrThatOption;
    right: ThisOrThatOption;
    bucket: Bucket;
}

export type ThisOrThatChoiceResponse = {
    recorded: boolean;
    swapped: boolean;
    winner_song_id: number;
    comparison_session_uuid: string;
}

export type ThisOrThatDismissResponse = {
    dismissed: boolean;
}

export type ThisOrThatUndoResponse = {
    undone: boolean;
}

// Bundled Feed module aggregates (GET /api/v1/feed/modules). Every module is live; a module with no
// data is null (its card stays locked). Mirrors backend/src/pydantic_schemas/feed.py::FeedModulesResponse.
export type FeedModulesResponse = {
    this_or_that: ThisOrThatModule | null;
    // Set only when this_or_that is null specifically because of the post-action cooldown — lets
    // the Feed show the right resting card even on a fresh app load, with no memory of which
    // action (a pick or a dismiss) just happened.
    this_or_that_cooldown_until: string | null;
    this_or_that_cooldown_reason: "chosen" | "dismissed" | null;
    rerate_radar: RerateRadarItem | null;
    consensus: ConsensusModule | null;
    disagreement_spotlight: DisagreementModule | null;
    split_decision: SplitDecisionModule | null;
    match_moment: MatchMomentModule | null;
}
