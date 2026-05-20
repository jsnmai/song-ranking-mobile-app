// Tests for AuthContext state machine behaviour.
// Mocks expo-secure-store and the API layer so tests run without native modules or a real backend.
import { ReactNode } from "react"
import { renderHook, act, waitFor } from "@testing-library/react-native"
import * as SecureStore from "expo-secure-store"

import { ApiError, apiClient } from "../../../api/client"
import { AuthProvider, useAuth } from "../AuthContext"
import { login as loginRequest, me, register as registerRequest } from "../apiRequests"
import { KEYS } from "../../../constants/keys"

jest.mock("expo-secure-store", () => ({
    getItemAsync: jest.fn(),
    setItemAsync: jest.fn(),
    deleteItemAsync: jest.fn(),
}))

jest.mock("../apiRequests", () => ({
    login: jest.fn(),
    me: jest.fn(),
    register: jest.fn(),
}))

const mockGetItemAsync = jest.mocked(SecureStore.getItemAsync)
const mockSetItemAsync = jest.mocked(SecureStore.setItemAsync)
const mockDeleteItemAsync = jest.mocked(SecureStore.deleteItemAsync)
const mockMe = jest.mocked(me)
const mockRegisterRequest = jest.mocked(registerRequest)
const mockFetch = jest.fn()

const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
)

const MOCK_USER = { id: 1, email: "user@example.com", created_at: "2024-01-01T00:00:00Z" }

beforeEach(() => {
    jest.resetAllMocks()
    globalThis.fetch = mockFetch as unknown as typeof fetch
})

// --- App launch: checkStoredToken ---

describe("app launch — checkStoredToken", () => {
    it("sets user to null and isLoading to false when no token is stored", async () => {
        mockGetItemAsync.mockResolvedValue(null)

        const { result } = renderHook(() => useAuth(), { wrapper })

        await waitFor(() => expect(result.current.isLoading).toBe(false))
        expect(result.current.user).toBeNull()
    })

    it("populates user and sets isLoading to false when a valid token is found", async () => {
        mockGetItemAsync.mockResolvedValue("valid-token")
        mockMe.mockResolvedValue(MOCK_USER)

        const { result } = renderHook(() => useAuth(), { wrapper })

        await waitFor(() => expect(result.current.isLoading).toBe(false))
        expect(result.current.user).toEqual(MOCK_USER)
    })

    it("sets user to null, clears SecureStore, and sets isLoading to false when the stored token is expired", async () => {
        mockGetItemAsync.mockResolvedValue("expired-token")
        mockMe.mockRejectedValue(new Error("401 Unauthorized"))

        const { result } = renderHook(() => useAuth(), { wrapper })

        await waitFor(() => expect(result.current.isLoading).toBe(false))
        expect(result.current.user).toBeNull()
        // The expired token must be removed so the next launch shows the login screen
        expect(mockDeleteItemAsync).toHaveBeenCalledWith(KEYS.JWT_TOKEN)
    })

    it("sets isLoading to false even when me() throws — the finally block always runs", async () => {
        mockGetItemAsync.mockResolvedValue("some-token")
        mockMe.mockRejectedValue(new Error("network error"))

        const { result } = renderHook(() => useAuth(), { wrapper })

        await waitFor(() => expect(result.current.isLoading).toBe(false))
    })
})

// --- logout() ---

describe("logout()", () => {
    it("clears user and token from React state and removes the JWT from SecureStore", async () => {
        mockGetItemAsync.mockResolvedValue("valid-token")
        mockMe.mockResolvedValue(MOCK_USER)

        const { result } = renderHook(() => useAuth(), { wrapper })
        await waitFor(() => expect(result.current.user).not.toBeNull())

        await act(async () => {
            await result.current.logout()
        })

        expect(result.current.user).toBeNull()
        expect(result.current.token).toBeNull()
        expect(mockDeleteItemAsync).toHaveBeenCalledWith(KEYS.JWT_TOKEN)
    })

    it("clears user and token when a protected API request returns 401", async () => {
        mockGetItemAsync.mockResolvedValue("valid-token")
        mockMe.mockResolvedValue(MOCK_USER)
        mockFetch.mockResolvedValue({
            ok: false,
            status: 401,
            headers: {
                get: (name: string) => name === "X-Request-ID" ? "request-123" : null,
            },
            json: async () => ({ detail: "Could not validate credentials." }),
        })

        const { result } = renderHook(() => useAuth(), { wrapper })
        await waitFor(() => expect(result.current.user).toEqual(MOCK_USER))

        await act(async () => {
            await expect(apiClient.get("/api/v1/protected", "valid-token")).rejects.toBeInstanceOf(ApiError)
        })

        expect(result.current.user).toBeNull()
        expect(result.current.token).toBeNull()
        expect(mockDeleteItemAsync).toHaveBeenCalledWith(KEYS.JWT_TOKEN)
    })
})

// --- register() ---

describe("register()", () => {
    it("sets user and token directly from the register response without calling me() or login()", async () => {
        mockGetItemAsync.mockResolvedValue(null)  // no stored token on launch

        const mockResponse = {
            access_token: "new-jwt",
            token_type: "bearer",
            user: MOCK_USER,
        }
        mockRegisterRequest.mockResolvedValue(mockResponse)

        const { result } = renderHook(() => useAuth(), { wrapper })
        await waitFor(() => expect(result.current.isLoading).toBe(false))

        await act(async () => {
            await result.current.register("user@example.com", "password123", "Test User", "testuser")
        })

        expect(result.current.user).toEqual(MOCK_USER)
        // token is readable synchronously after register() resolves — no waitFor, no extra render cycle
        expect(result.current.token).toBe("new-jwt")
        // me() must not be called — the token and user come directly from the register response
        expect(mockMe).not.toHaveBeenCalled()
        // loginRequest must not be called — register returns a token, no separate login needed
        expect(jest.mocked(loginRequest)).not.toHaveBeenCalled()
        expect(mockSetItemAsync).toHaveBeenCalledWith(KEYS.JWT_TOKEN, "new-jwt")
    })
})
