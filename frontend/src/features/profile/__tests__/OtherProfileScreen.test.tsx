// Tests for the compatibility card on OtherProfileScreen.
import { render, screen, waitFor } from "@testing-library/react-native"

import { ApiError } from "../../../api/client"
import OtherProfileScreen from "../OtherProfileScreen"
import { CompatibilityResponse, Profile } from "../types"

const mockGoBack = jest.fn()
const mockNavigate = jest.fn()

const mockGetProfileByUsername = jest.fn()
const mockGetCompatibility = jest.fn()
const mockGetUserTasteProfile = jest.fn()
const mockFollowUser = jest.fn()
const mockUnfollowUser = jest.fn()

jest.mock("../../auth/AuthContext", () => ({
    useAuth: () => ({
        token: "test-token",
    }),
}))

jest.mock("../apiRequests", () => ({
    getProfileByUsername: (...args: unknown[]) => mockGetProfileByUsername(...args),
    getCompatibility: (...args: unknown[]) => mockGetCompatibility(...args),
    getUserTasteProfile: (...args: unknown[]) => mockGetUserTasteProfile(...args),
    followUser: (...args: unknown[]) => mockFollowUser(...args),
    unfollowUser: (...args: unknown[]) => mockUnfollowUser(...args),
}))

const profile: Profile = {
    id: 3,
    user_id: 4,
    username: "maya",
    display_name: "Maya",
    is_public: true,
    created_at: "2026-01-01T00:00:00Z",
    follower_count: 12,
    following_count: 8,
    is_following: false,
    is_own_profile: false,
}

const compatOverlap: CompatibilityResponse = {
    has_overlap: true,
    similarity_score: 0.78,
    shared_song_count: 9,
    explanation: "Both love Frank Ocean",
    is_plus: false,
}

const compatNoOverlap: CompatibilityResponse = {
    has_overlap: false,
    similarity_score: null,
    shared_song_count: 0,
    explanation: "Not enough overlap yet · Rate more songs to compare",
    is_plus: false,
}

const navigationProp = {
    navigate: mockNavigate,
    goBack: mockGoBack,
} as never

const routeProp = {
    params: { username: "maya" },
} as never

beforeEach(() => {
    jest.resetAllMocks()
    mockGetProfileByUsername.mockResolvedValue(profile)
    mockGetCompatibility.mockResolvedValue(compatNoOverlap)
})

describe("OtherProfileScreen compatibility card", () => {
    it("shows score and explanation phrase when has_overlap is true", async () => {
        mockGetCompatibility.mockResolvedValue(compatOverlap)

        render(<OtherProfileScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            expect(screen.getByText(/78% taste match/)).toBeTruthy()
            expect(screen.getByText(/Both love Frank Ocean/)).toBeTruthy()
        })
    })

    it("shows not-enough-overlap text when has_overlap is false", async () => {
        render(<OtherProfileScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            expect(screen.getByText(/Not enough overlap yet/)).toBeTruthy()
        })
    })

    it("does not render a compat card when the compatibility request returns 404", async () => {
        mockGetCompatibility.mockRejectedValue(new ApiError(404, "Profile not found.", null))

        render(<OtherProfileScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            // Profile should still render
            expect(screen.getByText("Maya")).toBeTruthy()
        })
        // Neither compat phrase should appear
        expect(screen.queryByText(/taste match/)).toBeNull()
        expect(screen.queryByText(/Not enough overlap/)).toBeNull()
    })

    it("does not block profile from rendering while compat is loading", async () => {
        // Compatibility never resolves during this test
        mockGetCompatibility.mockReturnValue(new Promise(() => {}))

        render(<OtherProfileScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            expect(screen.getByText("Maya")).toBeTruthy()
            expect(screen.getByText("@maya")).toBeTruthy()
        })
    })

    it("profile and taste tabs remain accessible when compatibility is loaded", async () => {
        mockGetCompatibility.mockResolvedValue(compatOverlap)

        render(<OtherProfileScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            // Both tab labels should be present alongside the compat card
            expect(screen.getByText("Profile")).toBeTruthy()
            expect(screen.getByText("Taste")).toBeTruthy()
            expect(screen.getByText(/78% taste match/)).toBeTruthy()
        })
    })
})
