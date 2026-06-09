import { PersistedSong, RankingResponse } from "../comparison/types"

export type BookmarkSource = "search" | "song_detail" | "feed" | "rankings" | "discovery" | "manual" | "unknown"

export type Bookmark = {
    id: number;
    source: BookmarkSource | null;
    bookmarked_at: string;
    song: PersistedSong;
    ranking: RankingResponse | null;
}

export type BookmarkListResponse = {
    bookmarks: Bookmark[];
}

export type BookmarkStatusResponse = {
    is_bookmarked: boolean;
    bookmark: Bookmark | null;
}

export type BookmarkRemoveResponse = {
    song_id: number;
    removed: boolean;
}
