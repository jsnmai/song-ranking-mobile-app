import { getCircleMostRated, getCircleTrending, listCoSigns } from "../apiRequests"

const mockGet = jest.fn()

jest.mock("../../../api/client", () => ({
    apiClient: {
        get: (...args: unknown[]) => mockGet(...args),
    },
}))

beforeEach(() => {
    jest.resetAllMocks()
})

describe("social discovery API requests", () => {
    it("loads Co-Signs for the current user", async () => {
        mockGet.mockResolvedValue({ items: [] })

        await listCoSigns("test-token")

        expect(mockGet).toHaveBeenCalledWith("/api/v1/discover/co-signs", "test-token")
    })

    it("loads Trending in your circle", async () => {
        mockGet.mockResolvedValue({ items: [], window_days: 7 })

        await getCircleTrending("test-token")

        expect(mockGet).toHaveBeenCalledWith("/api/v1/discover/circle/trending", "test-token")
    })

    it("loads Most-rated in your circle", async () => {
        mockGet.mockResolvedValue({ items: [] })

        await getCircleMostRated("test-token")

        expect(mockGet).toHaveBeenCalledWith("/api/v1/discover/circle/most-rated", "test-token")
    })
})
