// Tests for MostCompatibleScreen — full ranked list of compatible users.
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import MostCompatibleScreen from "../MostCompatibleScreen"
import { MostCompatibleItem, MostCompatibleResponse } from "../types"

// ── Navigation mocks ─────────────────────────────────────────────────────────

const mockNavigate = jest.fn()
const mockGoBack = jest.fn()

jest.mock("@react-navigation/native", () => ({
    ...jest.requireActual("@react-navigation/native"),
    useNavigation: () => ({ navigate: mockNavigate }),
}))

// ── Auth mock ────────────────────────────────────────────────────────────────

jest.mock("../../auth/AuthContext", () => ({
    useAuth: () => ({ token: "test-token" }),
}))

// ── API mock ─────────────────────────────────────────────────────────────────

const mockGetMostCompatible = jest.fn()

jest.mock("../apiRequests", () => ({
    getMostCompatible: (...args: unknown[]) => mockGetMostCompatible(...args),
}))

// ── Fixtures ─────────────────────────────────────────────────────────────────

const userA: MostCompatibleItem = {
    username: "maya",
    display_name: "Maya",
    similarity_score: 0.87,
    shared_song_count: 14,
    explanation: "Both love Frank Ocean",
    computed_at: "2026-06-01T00:00:00Z",
}

const userB: MostCompatibleItem = {
    username: "alex",
    display_name: "Alex",
    similarity_score: 0.72,
    shared_song_count: 8,
    explanation: "You both rate Hip-Hop highly",
    computed_at: "2026-06-01T00:00:00Z",
}

const twoUsers: MostCompatibleResponse = { users: [userA, userB] }
const emptyResponse: MostCompatibleResponse = { users: [] }

// ── Helpers ───────────────────────────────────────────────────────────────────

const navigationProp = { navigate: mockNavigate, goBack: mockGoBack } as never
const routeProp = { params: undefined } as never

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("MostCompatibleScreen", () => {
    beforeEach(() => {
        jest.resetAllMocks()
        mockGetMostCompatible.mockResolvedValue(twoUsers)
    })

    it("renders user rows with match percentage and shared count", async () => {
        render(<MostCompatibleScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            expect(screen.getByTestId("most-compatible-row-maya")).toBeTruthy()
            expect(screen.getByText("87% match")).toBeTruthy()
            expect(screen.getByText("Based on 14 shared ratings")).toBeTruthy()
        })
    })

    it("renders all compatible users in the list", async () => {
        render(<MostCompatibleScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            expect(screen.getByTestId("most-compatible-row-maya")).toBeTruthy()
            expect(screen.getByTestId("most-compatible-row-alex")).toBeTruthy()
        })
    })

    it("renders explanation phrase for each user", async () => {
        render(<MostCompatibleScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            expect(screen.getByText("Both love Frank Ocean")).toBeTruthy()
        })
    })

    it("tapping a user row navigates to OtherProfile", async () => {
        render(<MostCompatibleScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            expect(screen.getByTestId("most-compatible-row-maya")).toBeTruthy()
        })
        fireEvent.press(screen.getByTestId("most-compatible-row-maya"))

        expect(mockNavigate).toHaveBeenCalledWith("OtherProfile", { username: "maya" })
    })

    it("renders empty state when no compatible users", async () => {
        mockGetMostCompatible.mockResolvedValue(emptyResponse)

        render(<MostCompatibleScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            expect(screen.getByText("Rate more songs to find compatible listeners.")).toBeTruthy()
        })
    })

    it("renders error state when fetch fails", async () => {
        mockGetMostCompatible.mockRejectedValue(new Error("Network error"))

        render(<MostCompatibleScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            expect(screen.getByText("Network error")).toBeTruthy()
        })
    })

    it("back button calls goBack", async () => {
        render(<MostCompatibleScreen navigation={navigationProp} route={routeProp} />)

        fireEvent.press(screen.getByText("Back"))

        expect(mockGoBack).toHaveBeenCalled()
    })
})
