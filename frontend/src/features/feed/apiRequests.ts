// API functions for the Feed tab.
import { apiClient } from "../../api/client"
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
