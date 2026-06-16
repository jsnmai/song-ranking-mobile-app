import { apiClient } from "../../api/client"
import { CircleMostRatedResponse, CircleTrendingResponse, CoSignsResponse } from "./types"

export async function listCoSigns(token: string): Promise<CoSignsResponse> {
    return apiClient.get<CoSignsResponse>("/api/v1/discover/co-signs", token)
}

export async function getCircleTrending(token: string): Promise<CircleTrendingResponse> {
    return apiClient.get<CircleTrendingResponse>("/api/v1/discover/circle/trending", token)
}

export async function getCircleMostRated(token: string): Promise<CircleMostRatedResponse> {
    return apiClient.get<CircleMostRatedResponse>("/api/v1/discover/circle/most-rated", token)
}
