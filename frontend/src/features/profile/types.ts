// TypeScript types for the profile feature.
// These mirror the Pydantic schemas in backend/src/pydantic_schemas/profile.py.

// Mirrors ProfileResponse in backend/src/pydantic_schemas/profile.py
export type ProfileVisibility = "public" | "friends_only" | "only_me"

export type ProfileBase = {
    id: number;
    user_id: number;
    username: string;
    display_name: string;
    is_public: boolean;
    visibility: ProfileVisibility;
    created_at: string;
}

// Mirrors ProfileSummaryResponse in backend/src/pydantic_schemas/profile.py
export type Profile = ProfileBase & {
    follower_count: number;
    following_count: number;
    is_following: boolean;
    is_own_profile: boolean;
    can_view_taste: boolean;
    is_blocked: boolean;
}

// Mirrors ProfileSearchResponse in backend/src/pydantic_schemas/profile.py
export type ProfileSearchResponse = {
    results: Profile[];
}

// Mirrors ProfileListResponse in backend/src/pydantic_schemas/profile.py
export type ProfileListResponse = {
    profiles: Profile[];
}

export type BlockedProfileListResponse = {
    profiles: Profile[];
}

// Mirrors ProfileSetup in backend/src/pydantic_schemas/profile.py
export type ProfileSetupRequest = {
    display_name: string;
    username: string;
}

// Mirrors TasteGenreItem in backend/src/pydantic_schemas/profile.py
export type TasteGenreItem = {
    name: string;
    count: number;
    percentage: number;
}

// Mirrors TasteArtistItem in backend/src/pydantic_schemas/profile.py
export type TasteArtistItem = {
    name: string;
    count: number;
}

// Mirrors TasteSection in backend/src/pydantic_schemas/profile.py
export type TasteSection = {
    genres: TasteGenreItem[];
    top_artists: TasteArtistItem[];
}

// Mirrors TasteBucketSection in backend/src/pydantic_schemas/profile.py
export type TasteBucketSection = TasteSection & {
    avg_score: number | null;
    count: number;
}

// Mirrors TasteBucketBreakdown in backend/src/pydantic_schemas/profile.py
export type TasteBucketBreakdown = {
    like: number;
    okay: number;
    dislike: number;
}

// Mirrors TasteProfileResponse in backend/src/pydantic_schemas/profile.py
export type TasteProfileResponse = {
    total_rated: number;
    avg_score: number | null;
    bucket_breakdown: TasteBucketBreakdown;
    overall: TasteSection;
    by_bucket: {
        like: TasteBucketSection;
        okay: TasteBucketSection;
        dislike: TasteBucketSection;
    };
}

// Mirrors CompatibilityResponse in backend/src/pydantic_schemas/profile.py
export type CompatibilityResponse = {
    has_overlap: boolean;
    similarity_score: number | null;
    shared_song_count: number;
    explanation: string;
    is_plus: boolean;
}
