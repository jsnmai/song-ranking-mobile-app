// Tests for the feed API request wrapper.
import { listMyFeed } from "../apiRequests"

const mockGet = jest.fn()

jest.mock("../../../api/client", () => ({
    apiClient: {
        get: (...args: unknown[]) => mockGet(...args),
    },
}))

beforeEach(() => {
    jest.resetAllMocks()
})

describe("feed API requests", () => {
    it("lists the current user's feed", async () => {
        mockGet.mockResolvedValue({ events: [], next_cursor: null })

        await listMyFeed("test-token")

        expect(mockGet).toHaveBeenCalledWith("/api/v1/feed", "test-token")
    })

    it("lists the current user's feed with a cursor", async () => {
        mockGet.mockResolvedValue({ events: [], next_cursor: null })

        await listMyFeed("test-token", "2026-01-01T00:00:00+00:00|7")

        expect(mockGet).toHaveBeenCalledWith(
            "/api/v1/feed?cursor=2026-01-01T00%3A00%3A00%2B00%3A00%7C7",
            "test-token",
        )
    })
})
