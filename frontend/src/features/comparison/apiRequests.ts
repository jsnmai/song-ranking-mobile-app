// API functions for Phase 5 rating and comparison flows.

import { apiClient } from "../../api/client"
import { SongSearchResult } from "../search/types"
import {
    BucketName,
    ComparisonSessionCancelResponse,
    ComparisonSessionFinalizeResponse,
    ComparisonSessionResponse,
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

export async function startComparisonSession(
    request: ComparisonSessionStartRequest,
    token: string,
): Promise<ComparisonSessionResponse> {
    return apiClient.post<ComparisonSessionResponse>("/api/v1/comparison-sessions", request, token)
}

export async function getActiveComparisonSession(
    token: string,
): Promise<ComparisonSessionResponse | null> {
    return apiClient.get<ComparisonSessionResponse | null>(
        "/api/v1/comparison-sessions/active",
        token,
    )
}

export async function chooseComparisonWinner(
    sessionUuid: string,
    winner: "target" | "candidate",
    token: string,
    decisionDurationMs: number | null,
): Promise<ComparisonSessionResponse> {
    return apiClient.post<ComparisonSessionResponse>(
        `/api/v1/comparison-sessions/${sessionUuid}/choices`,
        {
            winner,
            decision_duration_ms: decisionDurationMs,
        },
        token,
    )
}

export async function undoComparisonChoice(
    sessionUuid: string,
    token: string,
    expectedComparisonCount: number,
): Promise<ComparisonSessionResponse> {
    return apiClient.post<ComparisonSessionResponse>(
        `/api/v1/comparison-sessions/${sessionUuid}/undo`,
        {
            expected_comparison_count: expectedComparisonCount,
        },
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
