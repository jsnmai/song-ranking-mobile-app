import { apiClient } from "../../api/client"
import { SongSearchResult } from "../search/types"
import {
    Bookmark,
    BookmarkListResponse,
    BookmarkRemoveResponse,
    BookmarkSource,
    BookmarkStatusResponse,
} from "./types"

export async function listMyBookmarks(token: string): Promise<BookmarkListResponse> {
    return apiClient.get<BookmarkListResponse>("/api/v1/bookmarks", token)
}

export async function getBookmarkStatus(
    deezerId: number,
    token: string,
): Promise<BookmarkStatusResponse> {
    return apiClient.get<BookmarkStatusResponse>(`/api/v1/bookmarks/by-deezer/${deezerId}`, token)
}

export async function bookmarkSong(
    song: SongSearchResult,
    source: BookmarkSource,
    token: string,
): Promise<Bookmark> {
    return apiClient.post<Bookmark>("/api/v1/bookmarks", { song, source }, token)
}

export async function removeBookmark(
    songId: number,
    token: string,
): Promise<BookmarkRemoveResponse> {
    return apiClient.delete<BookmarkRemoveResponse>(`/api/v1/bookmarks/${songId}`, token)
}
