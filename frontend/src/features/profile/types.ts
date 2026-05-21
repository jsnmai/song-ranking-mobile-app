// TypeScript types for the profile feature.
// These mirror the Pydantic schemas in backend/src/pydantic_schemas/profile.py.

// Mirrors ProfileResponse in backend/src/pydantic_schemas/profile.py
export type ProfileBase = {
    id: number;
    user_id: number;
    username: string;
    display_name: string;
    is_public: boolean;
    created_at: string;
}

// Mirrors ProfileSummaryResponse in backend/src/pydantic_schemas/profile.py
export type Profile = ProfileBase & {
    follower_count: number;
    following_count: number;
    is_following: boolean;
    is_own_profile: boolean;
}

// Mirrors ProfileSearchResponse in backend/src/pydantic_schemas/profile.py
export type ProfileSearchResponse = {
    results: Profile[];
}

// Mirrors ProfileListResponse in backend/src/pydantic_schemas/profile.py
export type ProfileListResponse = {
    profiles: Profile[];
}

// Mirrors ProfileSetup in backend/src/pydantic_schemas/profile.py
export type ProfileSetupRequest = {
    display_name: string;
    username: string;
}
