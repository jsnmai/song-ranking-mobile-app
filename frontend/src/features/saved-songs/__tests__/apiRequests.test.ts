import {
    getSavedSongStatus,
    listMySavedSongs,
    removeSavedSong,
    saveSong,
} from "../apiRequests"
import { SongSearchResult } from "../../search/types"

const mockGet = jest.fn()
const mockPost = jest.fn()
const mockDelete = jest.fn()

jest.mock("../../../api/client", () => ({
    apiClient: {
        get: (...args: unknown[]) => mockGet(...args),
        post: (...args: unknown[]) => mockPost(...args),
        delete: (...args: unknown[]) => mockDelete(...args),
    },
}))

const song: SongSearchResult = {
    deezer_id: 123,
    isrc: "USUG11900842",
    title: "Nights",
    artist: "Frank Ocean",
    artist_deezer_id: 456,
    album: "Blonde",
    cover_url: "https://example.com/cover.jpg",
    preview_url: "https://example.com/preview.mp3",
}

beforeEach(() => {
    jest.resetAllMocks()
})

describe("Saved Songs API requests", () => {
    it("lists the current user's Saved Songs", async () => {
        mockGet.mockResolvedValue({ saves: [] })

        await listMySavedSongs("test-token")

        expect(mockGet).toHaveBeenCalledWith("/api/v1/saved-songs", "test-token")
    })

    it("gets saved state by Deezer ID", async () => {
        mockGet.mockResolvedValue({ is_saved: false, save: null })

        await getSavedSongStatus(123, "test-token")

        expect(mockGet).toHaveBeenCalledWith("/api/v1/saved-songs/by-deezer/123", "test-token")
    })

    it("saves a song with its source", async () => {
        mockPost.mockResolvedValue({ id: 1 })

        await saveSong(song, "song_detail", "test-token")

        expect(mockPost).toHaveBeenCalledWith(
            "/api/v1/saved-songs",
            { song, source: "song_detail" },
            "test-token",
        )
    })

    it("removes a saved song by LISTn song ID", async () => {
        mockDelete.mockResolvedValue({ song_id: 42, removed: true })

        await removeSavedSong(42, "test-token")

        expect(mockDelete).toHaveBeenCalledWith("/api/v1/saved-songs/42", "test-token")
    })
})
