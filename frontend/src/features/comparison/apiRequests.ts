// API functions for Phase 5 rating and comparison flows.

import { apiClient } from "../../api/client"
import { SongSearchResult } from "../search/types"
import {
    BucketName,
    ComparisonSessionCancelResponse,
    ComparisonSessionFinalizeResponse,
    ComparisonSessionResponse,
    RankingListResponse,
    RatingFinalizeResponse,
} from "./types"

type RatingFinalizeRequest = {
    song: SongSearchResult;
    bucket: BucketName;
    position?: number;
    note?: string;
}

type ComparisonSessionStartRequest = {
    song: SongSearchResult;
    bucket: BucketName;
    note?: string;
}

export async function finalizeRating(
    request: RatingFinalizeRequest,
    token: string,
): Promise<RatingFinalizeResponse> {
    return apiClient.post<RatingFinalizeResponse>("/api/v1/ratings/finalize", request, token)
}

export async function listMyRankings(
    token: string,
    cursor?: string,
): Promise<RankingListResponse> {
    const path = cursor ? `/api/v1/rankings/me?cursor=${encodeURIComponent(cursor)}` : "/api/v1/rankings/me"
    return apiClient.get<RankingListResponse>(path, token)
}

export async function startComparisonSession(
    request: ComparisonSessionStartRequest,
    token: string,
): Promise<ComparisonSessionResponse> {
    return apiClient.post<ComparisonSessionResponse>("/api/v1/comparison-sessions", request, token)
}

export async function chooseComparisonWinner(
    sessionUuid: string,
    winner: "target" | "candidate",
    token: string,
): Promise<ComparisonSessionResponse> {
    return apiClient.post<ComparisonSessionResponse>(
        `/api/v1/comparison-sessions/${sessionUuid}/choices`,
        { winner },
        token,
    )
}

export async function finalizeComparisonSession(
    sessionUuid: string,
    token: string,
): Promise<ComparisonSessionFinalizeResponse> {
    return apiClient.post<ComparisonSessionFinalizeResponse>(
        `/api/v1/comparison-sessions/${sessionUuid}/finalize`,
        {},
        token,
    )
}

export async function cancelComparisonSession(
    sessionUuid: string,
    token: string,
): Promise<ComparisonSessionCancelResponse> {
    return apiClient.delete<ComparisonSessionCancelResponse>(`/api/v1/comparison-sessions/${sessionUuid}`, token)
}
