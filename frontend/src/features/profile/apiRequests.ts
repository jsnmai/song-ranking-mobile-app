// API functions for the profile feature.
// Called by screens in features/profile/ — never call apiClient directly from a screen.

import { apiClient } from "../../api/client"
import {
    AuxstrologyResponse,
    BlockedProfileListResponse,
    CompatibilityResponse,
    MostCompatibleResponse,
    Profile,
    ProfileBase,
    ProfileEditRequest,
    ProfileListResponse,
    ProfileActivityResponse,
    ProfileReportRequest,
    ProfileReportResponse,
    ProfileSearchResponse,
    ProfileSetupRequest,
    ProfileVisibility,
    RecentRatingsResponse,
    TasteProfileResponse,
} from "./types"
import { RankingAnchorsResponse, RankingListResponse } from "../comparison/types"
import { BookmarkListResponse } from "../bookmarks/types"

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

// Calls PUT /api/v1/profile/me/visibility
export async function updateMyVisibility(
    visibility: ProfileVisibility,
    token: string,
): Promise<Profile> {
    return apiClient.put<Profile>("/api/v1/profile/me/visibility", { visibility }, token)
}

// Calls PATCH /api/v1/profile/me
// Partial update of the user's own display name, username, and/or avatar color.
export async function updateMyProfile(
    data: ProfileEditRequest,
    token: string,
): Promise<Profile> {
    return apiClient.patch<Profile>("/api/v1/profile/me", data, token)
}

// Calls GET /api/v1/profile/me/blocked
export async function getBlockedProfiles(token: string): Promise<BlockedProfileListResponse> {
    return apiClient.get<BlockedProfileListResponse>("/api/v1/profile/me/blocked", token)
}

// Calls POST /api/v1/profile/{username}/block
export async function blockUser(username: string, token: string): Promise<Profile> {
    return apiClient.post<Profile>(`/api/v1/profile/${username}/block`, {}, token)
}

// Calls DELETE /api/v1/profile/{username}/block
export async function unblockUser(username: string, token: string): Promise<Profile> {
    return apiClient.delete<Profile>(`/api/v1/profile/${username}/block`, token)
}

// Calls POST /api/v1/profile/{username}/report
export async function reportUser(
    username: string,
    data: ProfileReportRequest,
    token: string,
): Promise<ProfileReportResponse> {
    return apiClient.post<ProfileReportResponse>(`/api/v1/profile/${username}/report`, data, token)
}

// Calls GET /api/v1/profile/me/taste
export async function getMyTasteProfile(token: string): Promise<TasteProfileResponse> {
    return apiClient.get<TasteProfileResponse>("/api/v1/profile/me/taste", token)
}

// Calls GET /api/v1/profile/{username}/taste
export async function getUserTasteProfile(username: string, token: string): Promise<TasteProfileResponse> {
    return apiClient.get<TasteProfileResponse>(`/api/v1/profile/${username}/taste`, token)
}

// Calls GET /api/v1/profile/me/auxstrology
export async function getMyAuxstrology(token: string): Promise<AuxstrologyResponse> {
    return apiClient.get<AuxstrologyResponse>("/api/v1/profile/me/auxstrology", token)
}

// Calls GET /api/v1/profile/{username}/auxstrology
export async function getUserAuxstrology(username: string, token: string): Promise<AuxstrologyResponse> {
    return apiClient.get<AuxstrologyResponse>(`/api/v1/profile/${username}/auxstrology`, token)
}

// Calls GET /api/v1/profile/{username}/compatibility
export async function getCompatibility(username: string, token: string): Promise<CompatibilityResponse> {
    return apiClient.get<CompatibilityResponse>(`/api/v1/profile/${username}/compatibility`, token)
}

// Calls GET /api/v1/profile/me/recent-ratings
export async function getMyRecentRatings(token: string): Promise<RecentRatingsResponse> {
    return apiClient.get<RecentRatingsResponse>("/api/v1/profile/me/recent-ratings", token)
}

// Calls GET /api/v1/profile/{username}/recent-ratings
export async function getProfileRecentRatings(
    username: string,
    token: string,
): Promise<RecentRatingsResponse> {
    return apiClient.get<RecentRatingsResponse>(`/api/v1/profile/${username}/recent-ratings`, token)
}

// Calls GET /api/v1/profile/{username}/activity — paginated full activity ("view all").
export async function getProfileActivity(
    username: string,
    token: string,
    cursor?: string,
): Promise<ProfileActivityResponse> {
    const path = cursor
        ? `/api/v1/profile/${username}/activity?cursor=${encodeURIComponent(cursor)}`
        : `/api/v1/profile/${username}/activity`
    return apiClient.get<ProfileActivityResponse>(path, token)
}

// Calls GET /api/v1/profile/{username}/rankings
export async function getProfileRankings(
    username: string,
    token: string,
    cursor?: string,
): Promise<RankingListResponse> {
    const path = cursor
        ? `/api/v1/profile/${username}/rankings?cursor=${encodeURIComponent(cursor)}`
        : `/api/v1/profile/${username}/rankings`
    return apiClient.get<RankingListResponse>(path, token)
}

// Calls GET /api/v1/profile/{username}/bookmarks
export async function getProfileBookmarks(
    username: string,
    token: string,
): Promise<BookmarkListResponse> {
    return apiClient.get<BookmarkListResponse>(`/api/v1/profile/${username}/bookmarks`, token)
}

// Calls GET /api/v1/profile/me/most-compatible
export async function getMostCompatible(token: string): Promise<MostCompatibleResponse> {
    return apiClient.get<MostCompatibleResponse>("/api/v1/profile/me/most-compatible", token)
}

// Calls GET /api/v1/profile/{username}/rankings/anchors
export async function getProfileAnchors(username: string, token: string): Promise<RankingAnchorsResponse> {
    return apiClient.get<RankingAnchorsResponse>(`/api/v1/profile/${username}/rankings/anchors`, token)
}
