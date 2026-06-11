import { apiClient } from "../../api/client"
import { CoSignsResponse } from "./types"

export async function listCoSigns(token: string): Promise<CoSignsResponse> {
    return apiClient.get<CoSignsResponse>("/api/v1/discover/co-signs", token)
}
