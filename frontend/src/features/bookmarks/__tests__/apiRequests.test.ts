import {
    getBookmarkStatus,
    getBookmarkStatusBySongId,
    listMyBookmarks,
    removeBookmark,
    bookmarkSong,
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

describe("Bookmarks API requests", () => {
    it("lists the current user's Bookmarks", async () => {
        mockGet.mockResolvedValue({ bookmarks: [] })

        await listMyBookmarks("test-token")

        expect(mockGet).toHaveBeenCalledWith("/api/v1/bookmarks", "test-token")
    })

    it("gets bookmark state by Deezer ID", async () => {
        mockGet.mockResolvedValue({ is_bookmarked: false, bookmark: null })

        await getBookmarkStatus(123, "test-token")

        expect(mockGet).toHaveBeenCalledWith("/api/v1/bookmarks/by-deezer/123", "test-token")
    })

    it("gets bookmark state by LISTn song ID", async () => {
        mockGet.mockResolvedValue({ is_bookmarked: false, bookmark: null })

        await getBookmarkStatusBySongId(42, "test-token")

        expect(mockGet).toHaveBeenCalledWith("/api/v1/bookmarks/by-song/42", "test-token")
    })

    it("bookmarks a song with its source", async () => {
        mockPost.mockResolvedValue({ id: 1 })

        await bookmarkSong(song, "song_detail", "test-token")

        expect(mockPost).toHaveBeenCalledWith(
            "/api/v1/bookmarks",
            { song, source: "song_detail" },
            "test-token",
        )
    })

    it("removes a bookmark by LISTn song ID", async () => {
        mockDelete.mockResolvedValue({ song_id: 42, removed: true })

        await removeBookmark(42, "test-token")

        expect(mockDelete).toHaveBeenCalledWith("/api/v1/bookmarks/42", "test-token")
    })
})
