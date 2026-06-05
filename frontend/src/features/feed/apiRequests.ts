// API functions for the Feed tab.
import { apiClient } from "../../api/client"
import { ProfileReportRequest, ProfileReportResponse } from "../profile/types"
import { FeedListResponse } from "./types"

// Calls GET /api/v1/feed
// The backend reads rating_events from users the current user follows.
export async function listMyFeed(
    token: string,
    cursor?: string,
): Promise<FeedListResponse> {
    const path = cursor ? `/api/v1/feed?cursor=${encodeURIComponent(cursor)}` : "/api/v1/feed"
    return apiClient.get<FeedListResponse>(path, token)
}

// Calls POST /api/v1/rating-events/{id}/report
// Reports a visible rating event or note as a private safety record.
export async function reportRatingEvent(
    ratingEventId: number,
    data: ProfileReportRequest,
    token: string,
): Promise<ProfileReportResponse> {
    return apiClient.post<ProfileReportResponse>(`/api/v1/rating-events/${ratingEventId}/report`, data, token)
}
