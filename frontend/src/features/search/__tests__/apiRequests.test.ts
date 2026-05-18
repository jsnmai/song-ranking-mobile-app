// Tests for the search API request wrapper.
// These verify the frontend calls LISTn's backend endpoint, not Deezer directly.
import { searchSongs } from "../apiRequests"

const mockGet = jest.fn()

jest.mock("../../../api/client", () => ({
    apiClient: {
        get: (...args: unknown[]) => mockGet(...args),
    },
}))

beforeEach(() => {
    jest.resetAllMocks()
})

describe("searchSongs", () => {
    it("encodes the query and sends the auth token to the backend search endpoint", async () => {
        mockGet.mockResolvedValue({ results: [] })

        const response = await searchSongs("frank ocean", "test-token")

        expect(response).toEqual({ results: [] })
        expect(mockGet).toHaveBeenCalledWith("/api/v1/search/songs?q=frank%20ocean", "test-token")
    })
})
