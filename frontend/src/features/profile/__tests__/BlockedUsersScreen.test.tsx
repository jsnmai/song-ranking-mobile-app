// Tests for the Blocked users management screen.
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import BlockedUsersScreen from "../BlockedUsersScreen"
import { Profile } from "../types"

const mockGoBack = jest.fn()
const mockGetBlockedProfiles = jest.fn()
const mockUnblockUser = jest.fn()

jest.mock("../../auth/AuthContext", () => ({
    useAuth: () => ({ token: "test-token" }),
}))

jest.mock("../apiRequests", () => ({
    getBlockedProfiles: (...args: unknown[]) => mockGetBlockedProfiles(...args),
    unblockUser: (...args: unknown[]) => mockUnblockUser(...args),
}))

const blockedProfile: Profile = {
    id: 2,
    user_id: 2,
    username: "demo_blocked",
    display_name: "Demo Blocked",
    avatar_color: null, timezone: null,
    is_public: true,
    visibility: "public",
    created_at: "2026-01-01T00:00:00Z",
    follower_count: 0,
    following_count: 0,
    is_following: false,
    is_followed_by: false,
    is_own_profile: false,
    can_view_taste: false,
    is_blocked: true,
    hide_like_counts: false,
    user_stats: null,
}

const navigationProp = { goBack: mockGoBack } as never

beforeEach(() => {
    jest.resetAllMocks()
    mockGetBlockedProfiles.mockResolvedValue({ profiles: [blockedProfile] })
    mockUnblockUser.mockResolvedValue({ ...blockedProfile, is_blocked: false })
})

describe("BlockedUsersScreen", () => {
    it("lists blocked users", async () => {
        render(<BlockedUsersScreen navigation={navigationProp} route={{} as never} />)

        await waitFor(() => {
            expect(screen.getByText("Demo Blocked")).toBeTruthy()
        })
        expect(screen.getByText("@demo_blocked")).toBeTruthy()
        expect(screen.getByText("1 BLOCKED")).toBeTruthy()
    })

    it("unblocks a user and removes the row", async () => {
        render(<BlockedUsersScreen navigation={navigationProp} route={{} as never} />)

        await waitFor(() => expect(screen.getByText("Unblock")).toBeTruthy())
        fireEvent.press(screen.getByText("Unblock"))

        await waitFor(
            () => expect(mockUnblockUser).toHaveBeenCalledWith("demo_blocked", "test-token"),
            { timeout: 3000 },
        )
        await waitFor(
            () => expect(screen.queryByText("Demo Blocked")).toBeNull(),
            { timeout: 3000 },
        )
    })

    it("shows an empty state when nobody is blocked", async () => {
        mockGetBlockedProfiles.mockResolvedValue({ profiles: [] })
        render(<BlockedUsersScreen navigation={navigationProp} route={{} as never} />)

        await waitFor(() => {
            expect(screen.getByText("You haven’t blocked anyone.")).toBeTruthy()
        })
    })
})
