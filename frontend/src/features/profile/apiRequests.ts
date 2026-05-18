// API functions for the profile feature.
// Called by screens in features/profile/ — never call apiClient directly from a screen.

import { apiClient } from "../../api/client"
import { Profile, ProfileSetupRequest } from "./types"

// Calls GET /api/v1/profile/me
// Returns the authenticated user's own profile.
export async function getMyProfile(token: string): Promise<Profile> {
    return apiClient.get<Profile>("/api/v1/profile/me", token)
}


// Calls POST /api/v1/profile/setup
// Requires a JWT token — user must be registered and logged in first.
// Returns the newly created profile.
export async function setupProfile(data: ProfileSetupRequest, token: string): Promise<Profile> {
    return apiClient.post<Profile>("/api/v1/profile/setup", data, token)
}
