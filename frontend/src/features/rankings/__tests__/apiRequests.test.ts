// Tests for the rankings API request wrappers.
import { listMyRankings, removeRating } from "../apiRequests"

const mockGet = jest.fn()
const mockDelete = jest.fn()

jest.mock("../../../api/client", () => ({
    apiClient: {
        get: (...args: unknown[]) => mockGet(...args),
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

    it("removes ratings through the backend rating endpoint", async () => {
        mockDelete.mockResolvedValue({ rating_event: {} })

        await removeRating(42, "test-token")

        expect(mockDelete).toHaveBeenCalledWith("/api/v1/ratings/42", "test-token")
    })
})
