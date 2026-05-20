// API functions for the Rankings tab.

import { apiClient } from "../../api/client"
import { RankingListResponse, RankingReorderItem, RankingReorderResponse, RatingRemoveResponse } from "../comparison/types"

export async function listMyRankings(
    token: string,
    cursor?: string,
): Promise<RankingListResponse> {
    const path = cursor ? `/api/v1/rankings/me?cursor=${encodeURIComponent(cursor)}` : "/api/v1/rankings/me"
    return apiClient.get<RankingListResponse>(path, token)
}

export async function removeRating(
    songId: number,
    token: string,
): Promise<RatingRemoveResponse> {
    return apiClient.delete<RatingRemoveResponse>(`/api/v1/ratings/${songId}`, token)
}

export async function reorderRankings(
    rankings: RankingReorderItem[],
    token: string,
): Promise<RankingReorderResponse> {
    return apiClient.put<RankingReorderResponse>("/api/v1/rankings/reorder", { rankings }, token)
}
