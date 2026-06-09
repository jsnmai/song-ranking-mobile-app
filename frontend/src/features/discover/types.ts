import { PersistedSong } from "../comparison/types"

export type SocialDiscoveryContributor = {
    user_id: number;
    username: string;
    display_name: string;
    score: number;
}

export type FriendsNineItem = {
    song: PersistedSong;
    visible_high_score_friend_count: number;
    average_visible_friend_score: number;
    latest_visible_rating_at: string;
    contributors: SocialDiscoveryContributor[];
    is_bookmarked: boolean;
}

export type CoSignItem = {
    song: PersistedSong;
    co_sign_count: number;
    average_visible_friend_score: number;
    latest_visible_rating_at: string;
    contributors: SocialDiscoveryContributor[];
    is_bookmarked: boolean;
}

export type FriendsNinesResponse = {
    items: FriendsNineItem[];
}

export type CoSignsResponse = {
    items: CoSignItem[];
}
