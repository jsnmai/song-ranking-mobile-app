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
}
