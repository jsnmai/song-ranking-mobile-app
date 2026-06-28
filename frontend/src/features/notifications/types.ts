// TypeScript types for in-app notifications.
// These mirror backend/src/pydantic_schemas/notification.py.
import { ProfileBase, RecentRatingSong } from "../profile/types"

export type NotificationType = "follow" | "like"

export type NotificationItem = {
    id: number;
    type: NotificationType;
    // Who caused it (the follower / the liker).
    actor: ProfileBase;
    // The liked song for "like" notifications; null for "follow".
    song: RecentRatingSong | null;
    // The liked activity card for "like" notifications; null for "follow".
    rating_event_id: number | null;
    created_at: string;
    read: boolean;
}

export type NotificationListResponse = {
    items: NotificationItem[];
    next_cursor: string | null;
}

export type UnreadCountResponse = {
    unread_count: number;
}
