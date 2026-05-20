import { apiClient } from "../../api/client"

type PreviewUrlResponse = {
    preview_url: string | null;
}

// The backend refreshes stale Deezer preview URLs before returning this value.
export async function fetchPreviewUrl(deezerId: number, token: string): Promise<string | null> {
    const response = await apiClient.get<PreviewUrlResponse>(
        `/api/v1/songs/${deezerId}/preview-url`,
        token,
    )
    return response.preview_url
}
