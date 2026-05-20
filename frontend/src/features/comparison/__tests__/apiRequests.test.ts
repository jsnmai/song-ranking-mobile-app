// Tests for the comparison/rating API request wrappers.
import {
    cancelComparisonSession,
    chooseComparisonWinner,
    finalizeComparisonSession,
    finalizeRating,
    removeRating,
    startComparisonSession,
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

    it("starts comparison sessions through the backend", async () => {
        mockPost.mockResolvedValue({ session_uuid: "abc" })

        await startComparisonSession({ song, bucket: "like" }, "test-token")

        expect(mockPost).toHaveBeenCalledWith(
            "/api/v1/comparison-sessions",
            { song, bucket: "like" },
            "test-token",
        )
    })

    it("removes ratings through the backend rating endpoint", async () => {
        mockDelete.mockResolvedValue({ rating_event: {} })

        await removeRating(42, "test-token")

        expect(mockDelete).toHaveBeenCalledWith("/api/v1/ratings/42", "test-token")
    })

    it("records comparison choices through the backend", async () => {
        mockPost.mockResolvedValue({ session_uuid: "abc" })

        await chooseComparisonWinner("abc", "target", "test-token")

        expect(mockPost).toHaveBeenCalledWith(
            "/api/v1/comparison-sessions/abc/choices",
            { winner: "target" },
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
