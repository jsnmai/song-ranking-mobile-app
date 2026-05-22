// API functions for the profile feature.
// Called by screens in features/profile/ — never call apiClient directly from a screen.

import { apiClient } from "../../api/client"
import { CompatibilityResponse, Profile, ProfileBase, ProfileListResponse, ProfileSearchResponse, ProfileSetupRequest, TasteProfileResponse } from "./types"

// Calls GET /api/v1/profile/me
// Returns the authenticated user's own profile.
export async function getMyProfile(token: string): Promise<Profile> {
    return apiClient.get<Profile>("/api/v1/profile/me", token)
}

// Calls GET /api/v1/profile/search?q=...
// Discover uses this when the user switches from song search to user search.
export async function searchProfiles(query: string, token: string): Promise<ProfileSearchResponse> {
    const encodedQuery = encodeURIComponent(query)
    return apiClient.get<ProfileSearchResponse>(`/api/v1/profile/search?q=${encodedQuery}`, token)
}

// Calls GET /api/v1/profile/{username}
// Returns another user's profile plus current follow state.
export async function getProfileByUsername(username: string, token: string): Promise<Profile> {
    return apiClient.get<Profile>(`/api/v1/profile/${username}`, token)
}

// Calls POST /api/v1/profile/{username}/follow
export async function followUser(username: string, token: string): Promise<Profile> {
    return apiClient.post<Profile>(`/api/v1/profile/${username}/follow`, {}, token)
}

// Calls DELETE /api/v1/profile/{username}/follow
export async function unfollowUser(username: string, token: string): Promise<Profile> {
    return apiClient.delete<Profile>(`/api/v1/profile/${username}/follow`, token)
}

// Calls GET /api/v1/profile/{username}/followers
export async function getFollowers(username: string, token: string): Promise<ProfileListResponse> {
    return apiClient.get<ProfileListResponse>(`/api/v1/profile/${username}/followers`, token)
}

// Calls GET /api/v1/profile/{username}/following
export async function getFollowing(username: string, token: string): Promise<ProfileListResponse> {
    return apiClient.get<ProfileListResponse>(`/api/v1/profile/${username}/following`, token)
}

// Calls POST /api/v1/profile/setup
// Requires a JWT token — user must be registered and logged in first.
// Returns the newly created profile.
export async function setupProfile(data: ProfileSetupRequest, token: string): Promise<ProfileBase> {
    return apiClient.post<ProfileBase>("/api/v1/profile/setup", data, token)
}

// Calls GET /api/v1/profile/me/taste
export async function getMyTasteProfile(token: string): Promise<TasteProfileResponse> {
    return apiClient.get<TasteProfileResponse>("/api/v1/profile/me/taste", token)
}

// Calls GET /api/v1/profile/{username}/taste
export async function getUserTasteProfile(username: string, token: string): Promise<TasteProfileResponse> {
    return apiClient.get<TasteProfileResponse>(`/api/v1/profile/${username}/taste`, token)
}

// Calls GET /api/v1/profile/{username}/compatibility
export async function getCompatibility(username: string, token: string): Promise<CompatibilityResponse> {
    return apiClient.get<CompatibilityResponse>(`/api/v1/profile/${username}/compatibility`, token)
}
