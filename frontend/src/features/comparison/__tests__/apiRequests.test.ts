// Tests for the comparison/rating API request wrappers.
import {
    cancelComparisonSession,
    chooseComparisonWinner,
    finalizeComparisonSession,
    finalizeRating,
    getActiveComparisonSession,
    startComparisonSession,
    undoComparisonChoice,
} from "../apiRequests"
import { SongSearchResult } from "../../search/types"

const mockPost = jest.fn()
const mockGet = jest.fn()
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

describe("comparison API requests", () => {
    it("finalizes ratings through the backend rating endpoint", async () => {
        mockPost.mockResolvedValue({ ranking: {}, rating_event: {} })

        await finalizeRating({ song, bucket: "like" }, "test-token")

        expect(mockPost).toHaveBeenCalledWith(
            "/api/v1/ratings/finalize",
            { song, bucket: "like" },
            "test-token",
        )
    })

    it("does not send Apple preview URLs as durable finalize data", async () => {
        mockPost.mockResolvedValue({ ranking: {}, rating_event: {} })
        const appleSong: SongSearchResult = {
            provider: "apple",
            deezer_id: null,
            isrc: null,
            title: "Nights",
            artist: "Frank Ocean",
            artist_deezer_id: null,
            album: "Blonde",
            cover_url: "https://example.com/cover.jpg",
            preview_url: "https://example.com/apple-preview.m4a",
            apple_track_id: "1440841363",
            storefront: "US",
            apple_view_url: "https://music.apple.com/us/album/nights/1440841363?i=1440841363",
            preview_available: true,
        }

        await finalizeRating({ song: appleSong, bucket: "like" }, "test-token")

        expect(mockPost).toHaveBeenCalledWith(
            "/api/v1/ratings/finalize",
            { song: { ...appleSong, preview_url: null }, bucket: "like" },
            "test-token",
        )
    })

    it("starts comparison sessions through the backend", async () => {
        mockPost.mockResolvedValue({ session_uuid: "abc" })

        await startComparisonSession({ song, bucket: "like" }, "test-token")

        expect(mockPost).toHaveBeenCalledWith(
            "/api/v1/comparison-sessions",
            { song, bucket: "like" },
            "test-token",
        )
    })

    it("records comparison choices through the backend", async () => {
        mockPost.mockResolvedValue({ session_uuid: "abc" })

        await chooseComparisonWinner("abc", "target", "test-token", 912)

        expect(mockPost).toHaveBeenCalledWith(
            "/api/v1/comparison-sessions/abc/choices",
            {
                winner: "target",
                decision_duration_ms: 912,
            },
            "test-token",
        )
    })

    it("fetches the active comparison session for resume through the backend", async () => {
        mockGet.mockResolvedValue(null)

        await getActiveComparisonSession("test-token")

        expect(mockGet).toHaveBeenCalledWith(
            "/api/v1/comparison-sessions/active",
            "test-token",
        )
    })

    it("undoes the latest comparison choice through the backend", async () => {
        mockPost.mockResolvedValue({ session_uuid: "abc" })

        await undoComparisonChoice("abc", "test-token", 2)

        expect(mockPost).toHaveBeenCalledWith(
            "/api/v1/comparison-sessions/abc/undo",
            {
                expected_comparison_count: 2,
            },
            "test-token",
        )
    })

    it("finalizes comparison sessions through the backend", async () => {
        mockPost.mockResolvedValue({ result: {} })

        await finalizeComparisonSession("abc", "test-token")

        expect(mockPost).toHaveBeenCalledWith(
            "/api/v1/comparison-sessions/abc/finalize",
            {},
            "test-token",
        )
    })

    it("cancels comparison sessions through the backend", async () => {
        mockDelete.mockResolvedValue({ session_uuid: "abc", canceled: true })

        await cancelComparisonSession("abc", "test-token")

        expect(mockDelete).toHaveBeenCalledWith("/api/v1/comparison-sessions/abc", "test-token")
    })
})
