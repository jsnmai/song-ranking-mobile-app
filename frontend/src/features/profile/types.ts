// TypeScript types for the profile feature.
// These mirror the Pydantic schemas in backend/src/pydantic_schemas/profile.py.

// Mirrors ProfileResponse in backend/src/pydantic_schemas/profile.py
export type Profile = {
    id: number;
    user_id: number;
    username: string;
    display_name: string;
    is_public: boolean;
    created_at: string;
}

// Mirrors ProfileSetup in backend/src/pydantic_schemas/profile.py
export type ProfileSetupRequest = {
    display_name: string;
    username: string;
}
