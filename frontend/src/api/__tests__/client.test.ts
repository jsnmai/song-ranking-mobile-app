// Tests for shared API client error handling.
import { ApiError, apiClient, setUnauthorizedHandler } from "../client"

const mockFetch = jest.fn()

beforeEach(() => {
    jest.resetAllMocks()
    setUnauthorizedHandler(null)
    globalThis.fetch = mockFetch as unknown as typeof fetch
})

describe("apiClient", () => {
    it("throws string detail errors as ApiError detail", async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            status: 401,
            headers: {
                get: () => null,
            },
            json: async () => ({ detail: "Invalid credentials." }),
        })

        await expect(apiClient.post("/api/v1/auth/login", {}, undefined)).rejects.toMatchObject({
            detail: "Invalid credentials.",
        })
    })

    it("normalizes FastAPI validation errors before screens render them", async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            status: 422,
            headers: {
                get: () => null,
            },
            json: async () => ({
                detail: [
                    {
                        type: "value_error",
                        loc: ["body", "email"],
                        msg: "value is not a valid email address",
                        input: "test",
                        ctx: {},
                    },
                ],
            }),
        })

        await expect(apiClient.post("/api/v1/auth/login", {}, undefined)).rejects.toMatchObject({
            detail: "value is not a valid email address",
        })
    })

    it("uses a safe fallback for unknown error body shapes", async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            status: 500,
            headers: {
                get: () => null,
            },
            json: async () => ({ detail: { unexpected: true } }),
        })

        await expect(apiClient.get("/api/v1/unknown")).rejects.toBeInstanceOf(ApiError)
        await expect(apiClient.get("/api/v1/unknown")).rejects.toMatchObject({
            detail: "An error occurred.",
        })
    })
})
