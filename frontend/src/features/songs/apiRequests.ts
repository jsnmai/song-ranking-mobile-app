import { apiClient } from "../../api/client"

type PreviewUrlResponse = {
    preview_url: string | null;
}

export type SavedSongPreviewUrlResponse = {
    preview_url: string | null;
    apple_view_url: string | null;
    // Provider the preview came from, independent of apple_view_url: Apple
    // previews need iTunes attribution even when the store link is missing.
    provider: "apple" | "deezer" | null;
}

// The backend refreshes stale Deezer preview URLs before returning this value.
export async function fetchPreviewUrl(deezerId: number, token: string): Promise<string | null> {
    const response = await apiClient.get<PreviewUrlResponse>(
        `/api/v1/songs/${deezerId}/preview-url`,
        token,
    )
    return response.preview_url
}

export async function fetchPreviewUrlBySongId(
    songId: number,
    token: string,
): Promise<SavedSongPreviewUrlResponse> {
    return apiClient.get<SavedSongPreviewUrlResponse>(
        `/api/v1/songs/by-id/${songId}/preview-url`,
        token,
    )
}
