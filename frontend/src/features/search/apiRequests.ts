// API functions for song search.
// Discover calls these instead of calling apiClient directly.

import { apiClient } from "../../api/client"
import { SongSearchResponse } from "./types"

// Calls GET /api/v1/search/songs?q=...
// The backend talks to Deezer; the frontend never calls Deezer directly.
export async function searchSongs(query: string, token: string): Promise<SongSearchResponse> {
    const encodedQuery = encodeURIComponent(query)
    return apiClient.get<SongSearchResponse>(`/api/v1/search/songs?q=${encodedQuery}`, token)
}
