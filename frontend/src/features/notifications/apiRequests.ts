// API helpers for in-app notifications.
import { apiClient } from "../../api/client"
import { NotificationListResponse, UnreadCountResponse } from "./types"

// Calls GET /api/v1/notifications
export async function getNotifications(token: string, cursor?: string): Promise<NotificationListResponse> {
    const path = cursor
        ? `/api/v1/notifications?cursor=${encodeURIComponent(cursor)}`
        : "/api/v1/notifications"
    return apiClient.get<NotificationListResponse>(path, token)
}

// Calls GET /api/v1/notifications/unread-count
export async function getUnreadCount(token: string): Promise<UnreadCountResponse> {
    return apiClient.get<UnreadCountResponse>("/api/v1/notifications/unread-count", token)
}

// Calls POST /api/v1/notifications/read — marks all the user's notifications read.
export async function markNotificationsRead(token: string): Promise<UnreadCountResponse> {
    return apiClient.post<UnreadCountResponse>("/api/v1/notifications/read", {}, token)
}
