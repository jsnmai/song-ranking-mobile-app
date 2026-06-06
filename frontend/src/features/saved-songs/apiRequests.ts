import { apiClient } from "../../api/client"
import { SongSearchResult } from "../search/types"
import {
    SavedSongListResponse,
    SavedSongRemoveResponse,
    SavedSong,
    SavedSongSource,
    SavedSongStatusResponse,
} from "./types"

export async function listMySavedSongs(token: string): Promise<SavedSongListResponse> {
    return apiClient.get<SavedSongListResponse>("/api/v1/saved-songs", token)
}

export async function getSavedSongStatus(
    deezerId: number,
    token: string,
): Promise<SavedSongStatusResponse> {
    return apiClient.get<SavedSongStatusResponse>(`/api/v1/saved-songs/by-deezer/${deezerId}`, token)
}

export async function saveSong(
    song: SongSearchResult,
    source: SavedSongSource,
    token: string,
): Promise<SavedSong> {
    return apiClient.post<SavedSong>("/api/v1/saved-songs", { song, source }, token)
}

export async function removeSavedSong(
    songId: number,
    token: string,
): Promise<SavedSongRemoveResponse> {
    return apiClient.delete<SavedSongRemoveResponse>(`/api/v1/saved-songs/${songId}`, token)
}
