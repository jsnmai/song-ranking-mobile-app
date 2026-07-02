// API functions for the Feed tab.
import { apiClient } from "../../api/client"
import { ProfileReportRequest, ProfileReportResponse } from "../profile/types"
import {
    CircleRatersResponse,
    FeedListResponse,
    FeedModulesResponse,
    ThisOrThatChoiceResponse,
    ThisOrThatDismissResponse,
} from "./types"

// Calls GET /api/v1/feed
// The backend reads rating_events from users the current user follows.
export async function listMyFeed(
    token: string,
    cursor?: string,
): Promise<FeedListResponse> {
    const path = cursor ? `/api/v1/feed?cursor=${encodeURIComponent(cursor)}` : "/api/v1/feed"
    return apiClient.get<FeedListResponse>(path, token)
}

// Calls GET /api/v1/feed/modules
// One bundled request for every Feed module card; a module with no data comes back null (stays locked).
export async function getFeedModules(
    token: string,
): Promise<FeedModulesResponse> {
    return apiClient.get<FeedModulesResponse>("/api/v1/feed/modules", token)
}

// Calls POST /api/v1/feed/this-or-that/choice
// Records one inline personal ranking-refinement decision.
export async function chooseThisOrThat(
    leftSongId: number,
    rightSongId: number,
    winnerSongId: number,
    token: string,
): Promise<ThisOrThatChoiceResponse> {
    return apiClient.post<ThisOrThatChoiceResponse>(
        "/api/v1/feed/this-or-that/choice",
        {
            left_song_id: leftSongId,
            right_song_id: rightSongId,
            winner_song_id: winnerSongId,
        },
        token,
    )
}

// Calls POST /api/v1/feed/this-or-that/dismiss
// Records an explicit "not now" on the visible refinement prompt.
export async function dismissThisOrThat(
    leftSongId: number,
    rightSongId: number,
    token: string,
): Promise<ThisOrThatDismissResponse> {
    return apiClient.post<ThisOrThatDismissResponse>(
        "/api/v1/feed/this-or-that/dismiss",
        {
            left_song_id: leftSongId,
            right_song_id: rightSongId,
        },
        token,
    )
}

// Calls GET /api/v1/feed/songs/{songId}/circle-raters
// Circle members (mutual follows, visible) who currently rate the song — Recent Verdict avatars.
export async function getSongCircleRaters(
    songId: number,
    token: string,
): Promise<CircleRatersResponse> {
    return apiClient.get<CircleRatersResponse>(`/api/v1/feed/songs/${songId}/circle-raters`, token)
}

// Calls POST /api/v1/rating-events/{id}/report
// Reports a visible rating event or note as a private safety record.
export async function reportRatingEvent(
    ratingEventId: number,
    data: ProfileReportRequest,
    token: string,
): Promise<ProfileReportResponse> {
    return apiClient.post<ProfileReportResponse>(`/api/v1/rating-events/${ratingEventId}/report`, data, token)
}
