import { listCoSigns } from "../apiRequests"

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
})
