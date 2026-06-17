// API helpers for rating-event activity likes.
import { apiClient } from "../../api/client"
import { ProfileListResponse, Profile } from "../profile/types"

export type ActivityLikeResponse = {
    rating_event_id: number;
    like_count: number | null;
    liked_by_viewer: boolean;
}

// Calls POST /api/v1/activity/{rating_event_id}/likes
export async function likeActivity(ratingEventId: number, token: string): Promise<ActivityLikeResponse> {
    return apiClient.post<ActivityLikeResponse>(`/api/v1/activity/${ratingEventId}/likes`, {}, token)
}

// Calls DELETE /api/v1/activity/{rating_event_id}/likes
export async function unlikeActivity(ratingEventId: number, token: string): Promise<ActivityLikeResponse> {
    return apiClient.delete<ActivityLikeResponse>(`/api/v1/activity/${ratingEventId}/likes`, token)
}

// Calls GET /api/v1/activity/{rating_event_id}/likes
export async function getActivityLikers(ratingEventId: number, token: string): Promise<ProfileListResponse> {
    return apiClient.get<ProfileListResponse>(`/api/v1/activity/${ratingEventId}/likes`, token)
}

// Calls PUT /api/v1/profile/me/like-privacy
export async function updateLikePrivacy(hideLikeCounts: boolean, token: string): Promise<Profile> {
    return apiClient.put<Profile>("/api/v1/profile/me/like-privacy", { hide_like_counts: hideLikeCounts }, token)
}
