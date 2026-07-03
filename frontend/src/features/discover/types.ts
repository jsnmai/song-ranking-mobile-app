import { PersistedSong } from "../comparison/types"

export type SocialDiscoveryContributor = {
    user_id: number;
    username: string;
    display_name: string;
    score: number;
}

export type CoSignItem = {
    song: PersistedSong;
    co_sign_count: number;
    // API name is legacy: Co-Sign averages visible people the viewer follows.
    average_visible_friend_score: number;
    latest_visible_rating_at: string;
    contributors: SocialDiscoveryContributor[];
    is_bookmarked: boolean;
}

export type CoSignsResponse = {
    items: CoSignItem[];
}

// --- Circle aggregate modules (Trending / Most-rated in your circle) ---

export type CircleContributor = {
    user_id: number;
    username: string;
    display_name: string;
    score: number;
    bucket: string;
}

export type ViewerRating = {
    score: number;
    bucket: string;
}

export type CircleTrendingItem = {
    song: PersistedSong;
    recent_circle_rating_count: number;
    average_circle_score: number;
    contributors: CircleContributor[];
    viewer_rating: ViewerRating | null;
    latest_circle_rating_at: string;
}

export type CircleTrendingResponse = {
    items: CircleTrendingItem[];
    window_days: number;
    // Viewer's visible circle members (mutual follows). Distinguishes "not enough circle"
    // (< 3) from "circle has nothing trending yet" (>= 3 but items empty).
    circle_size: number;
}

export type CircleMostRatedItem = {
    song: PersistedSong;
    circle_rating_count: number;
    average_circle_score: number;
    contributors: CircleContributor[];
    viewer_rating: ViewerRating | null;
    latest_circle_rating_at: string;
}

export type CircleMostRatedResponse = {
    items: CircleMostRatedItem[];
    // Viewer's visible circle members (mutual follows); see CircleTrendingResponse.circle_size.
    circle_size: number;
}

// --- New release (a fresh drop from this week, global for every viewer) ---
// Served by GET /api/v1/discover/new-release: the backend batches the week's fresh
// releases (ListenBrainz -> Apple catalog) into durable songs and rotates one pick
// per day. Empty items means no batch has landed yet; the card shows its placeholder.
export type NewReleaseItem = {
    song: PersistedSong;
    released_at: string;
}

export type NewReleaseResponse = {
    items: NewReleaseItem[];
}

// --- Popular on LISTn (global, anonymous) ---
// "week": items are the songs the most people rated in the last window_days.
// "all_time": the week was too thin, so items are the all-time most-rated songs instead;
// the UI drops the "this week" label so it stays honest.
export type PopularWindow = "week" | "all_time"

export type PopularItem = {
    song: PersistedSong;
    rating_count: number;
}

export type PopularResponse = {
    items: PopularItem[];
    window: PopularWindow;
    window_days: number;
}
