import { apiClient } from "../../api/client"
import { CoSignsResponse, FriendsNinesResponse } from "./types"

export async function listFriendsNines(token: string): Promise<FriendsNinesResponse> {
    return apiClient.get<FriendsNinesResponse>("/api/v1/discover/friends-9s", token)
}

export async function listCoSigns(token: string): Promise<CoSignsResponse> {
    return apiClient.get<CoSignsResponse>("/api/v1/discover/co-signs", token)
}
