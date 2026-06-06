// API functions for the Rankings tab.

import { apiClient } from "../../api/client"
import {
    RankingAnchorsResponse,
    RankingListResponse,
    RankingReorderItem,
    RankingReorderResponse,
    RankingResponse,
    RatingRemoveResponse,
} from "../comparison/types"

export async function listMyRankings(
    token: string,
    cursor?: string,
): Promise<RankingListResponse> {
    const path = cursor ? `/api/v1/rankings/me?cursor=${encodeURIComponent(cursor)}` : "/api/v1/rankings/me"
    return apiClient.get<RankingListResponse>(path, token)
}

export async function getMyRankingAnchors(token: string): Promise<RankingAnchorsResponse> {
    return apiClient.get<RankingAnchorsResponse>("/api/v1/rankings/me/anchors", token)
}

export async function getMyRankingByDeezerId(
    deezerId: number,
    token: string,
): Promise<RankingResponse> {
    return apiClient.get<RankingResponse>(`/api/v1/rankings/me/by-deezer/${deezerId}`, token)
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
