import { PersistedSong, RankingResponse } from "../comparison/types"

export type SavedSongSource = "search" | "song_detail" | "feed" | "rankings" | "discovery" | "manual" | "unknown"

export type SavedSong = {
    id: number;
    source: SavedSongSource | null;
    saved_at: string;
    song: PersistedSong;
    ranking: RankingResponse | null;
}

export type SavedSongListResponse = {
    saves: SavedSong[];
}

export type SavedSongStatusResponse = {
    is_saved: boolean;
    save: SavedSong | null;
}

export type SavedSongRemoveResponse = {
    song_id: number;
    removed: boolean;
}
