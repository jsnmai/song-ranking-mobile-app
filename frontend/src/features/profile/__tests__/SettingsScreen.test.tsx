// Tests for account-level Settings controls.
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import SettingsScreen from "../SettingsScreen"
import { Profile } from "../types"

const mockGoBack = jest.fn()
const mockLogout = jest.fn()
const mockGetMyProfile = jest.fn()
const mockGetBlockedProfiles = jest.fn()
const mockUpdateMyVisibility = jest.fn()
const mockUnblockUser = jest.fn()

jest.mock("../../auth/AuthContext", () => ({
    useAuth: () => ({
        token: "test-token",
        logout: mockLogout,
    }),
}))

jest.mock("../apiRequests", () => ({
    getMyProfile: (...args: unknown[]) => mockGetMyProfile(...args),
    getBlockedProfiles: (...args: unknown[]) => mockGetBlockedProfiles(...args),
    updateMyVisibility: (...args: unknown[]) => mockUpdateMyVisibility(...args),
    unblockUser: (...args: unknown[]) => mockUnblockUser(...args),
}))

const profile: Profile = {
    id: 1,
    user_id: 1,
    username: "demo_power",
    display_name: "Demo Power",
    is_public: true,
    visibility: "public",
    created_at: "2026-01-01T00:00:00Z",
    follower_count: 4,
    following_count: 8,
    is_following: false,
    is_own_profile: true,
    can_view_taste: true,
    is_blocked: false,
}

const blockedProfile: Profile = {
    ...profile,
    id: 2,
    user_id: 2,
    username: "demo_blocked",
    display_name: "Demo Blocked",
    is_own_profile: false,
}

const navigationProp = {
    goBack: mockGoBack,
} as never

beforeEach(() => {
    jest.resetAllMocks()
    mockGetMyProfile.mockResolvedValue(profile)
    mockGetBlockedProfiles.mockResolvedValue({ profiles: [blockedProfile] })
    mockUpdateMyVisibility.mockResolvedValue({ ...profile, visibility: "friends_only" })
    mockUnblockUser.mockResolvedValue({ ...blockedProfile, is_blocked: false })
})

describe("SettingsScreen", () => {
    it("renders privacy and blocked user controls", async () => {
        render(<SettingsScreen navigation={navigationProp} route={{} as never} />)

        await waitFor(() => {
            expect(screen.getByText("PRIVACY")).toBeTruthy()
            expect(screen.getByText("BLOCKED USERS")).toBeTruthy()
            expect(screen.getByText("Demo Blocked")).toBeTruthy()
        })
    })

    it("updates profile visibility", async () => {
        render(<SettingsScreen navigation={navigationProp} route={{} as never} />)

        await waitFor(() => {
            expect(screen.getByText("Friends only")).toBeTruthy()
        })
        fireEvent.press(screen.getByText("Friends only"))

        await waitFor(() => {
            expect(mockUpdateMyVisibility).toHaveBeenCalledWith("friends_only", "test-token")
        })
    })

    it("unblocks a user", async () => {
        render(<SettingsScreen navigation={navigationProp} route={{} as never} />)

        await waitFor(() => {
            expect(screen.getByText("Unblock")).toBeTruthy()
        })
        fireEvent.press(screen.getByText("Unblock"))

        await waitFor(() => {
            expect(mockUnblockUser).toHaveBeenCalledWith("demo_blocked", "test-token")
            expect(screen.queryByText("Demo Blocked")).toBeNull()
        })
    })
})
