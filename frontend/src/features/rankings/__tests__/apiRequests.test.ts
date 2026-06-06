// Tests for the rankings API request wrappers.
import {
    getMyRankingAnchors,
    getMyRankingByDeezerId,
    listMyRankings,
    removeRating,
    reorderRankings,
} from "../apiRequests"

const mockGet = jest.fn()
const mockPut = jest.fn()
const mockDelete = jest.fn()

jest.mock("../../../api/client", () => ({
    apiClient: {
        get: (...args: unknown[]) => mockGet(...args),
        put: (...args: unknown[]) => mockPut(...args),
        delete: (...args: unknown[]) => mockDelete(...args),
    },
}))

beforeEach(() => {
    jest.resetAllMocks()
})

describe("rankings API requests", () => {
    it("lists current rankings through the backend", async () => {
        mockGet.mockResolvedValue({ rankings: [], next_cursor: null })

        await listMyRankings("test-token")

        expect(mockGet).toHaveBeenCalledWith("/api/v1/rankings/me", "test-token")
    })

    it("lists current rankings through the backend with a cursor", async () => {
        mockGet.mockResolvedValue({ rankings: [], next_cursor: null })

        await listMyRankings("test-token", "8.75:1")

        expect(mockGet).toHaveBeenCalledWith("/api/v1/rankings/me?cursor=8.75%3A1", "test-token")
    })

    it("gets one current ranking by Deezer ID through the backend", async () => {
        mockGet.mockResolvedValue({ id: 7 })

        await getMyRankingByDeezerId(123, "test-token")

        expect(mockGet).toHaveBeenCalledWith("/api/v1/rankings/me/by-deezer/123", "test-token")
    })

    it("gets current user's ranking anchors through the backend", async () => {
        mockGet.mockResolvedValue({ top_like: null, median_okay: null, lowest_dislike: null })

        await getMyRankingAnchors("test-token")

        expect(mockGet).toHaveBeenCalledWith("/api/v1/rankings/me/anchors", "test-token")
    })

    it("removes ratings through the backend rating endpoint", async () => {
        mockDelete.mockResolvedValue({ rating_event: {} })

        await removeRating(42, "test-token")

        expect(mockDelete).toHaveBeenCalledWith("/api/v1/ratings/42", "test-token")
    })

    it("saves reordered rankings through the backend", async () => {
        const rankings = [
            { song_id: 42, bucket: "like" as const },
            { song_id: 43, bucket: "alright" as const },
        ]
        mockPut.mockResolvedValue({ rankings: [], rating_events: [] })

        await reorderRankings(rankings, "test-token")

        expect(mockPut).toHaveBeenCalledWith(
            "/api/v1/rankings/reorder",
            { rankings },
            "test-token",
        )
    })
})
