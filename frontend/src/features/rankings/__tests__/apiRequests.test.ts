// Tests for the rankings API request wrappers.
import { listMyRankings } from "../apiRequests"

const mockGet = jest.fn()

jest.mock("../../../api/client", () => ({
    apiClient: {
        get: (...args: unknown[]) => mockGet(...args),
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
})
