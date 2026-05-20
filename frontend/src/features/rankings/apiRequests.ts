// API functions for the Rankings tab.

import { apiClient } from "../../api/client"
import { RankingListResponse } from "../comparison/types"

export async function listMyRankings(
    token: string,
    cursor?: string,
): Promise<RankingListResponse> {
    const path = cursor ? `/api/v1/rankings/me?cursor=${encodeURIComponent(cursor)}` : "/api/v1/rankings/me"
    return apiClient.get<RankingListResponse>(path, token)
}
