// Tests for the Privacy visibility-level selector.
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import PrivacyScreen from "../PrivacyScreen"
import { Profile } from "../types"

const mockGoBack = jest.fn()
const mockGetMyProfile = jest.fn()
const mockUpdateMyVisibility = jest.fn()

jest.mock("../../auth/AuthContext", () => ({
    useAuth: () => ({ token: "test-token" }),
}))

jest.mock("../apiRequests", () => ({
    getMyProfile: (...args: unknown[]) => mockGetMyProfile(...args),
    updateMyVisibility: (...args: unknown[]) => mockUpdateMyVisibility(...args),
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
    is_followed_by: false,
    is_own_profile: true,
    can_view_taste: true,
    is_blocked: false,
    user_stats: null,
}

const navigationProp = { goBack: mockGoBack } as never

beforeEach(() => {
    jest.resetAllMocks()
    mockGetMyProfile.mockResolvedValue(profile)
    mockUpdateMyVisibility.mockResolvedValue({ ...profile, visibility: "friends_only" })
})

describe("PrivacyScreen", () => {
    it("renders the three visibility levels", async () => {
        render(<PrivacyScreen navigation={navigationProp} route={{} as never} />)

        await waitFor(() => {
            expect(screen.getByText("Public")).toBeTruthy()
        })
        expect(screen.getByText("Friends only")).toBeTruthy()
        expect(screen.getByText("Only me")).toBeTruthy()
    })

    it("updates visibility when a level is selected", async () => {
        render(<PrivacyScreen navigation={navigationProp} route={{} as never} />)

        await waitFor(() => expect(screen.getByText("Friends only")).toBeTruthy())
        fireEvent.press(screen.getByText("Friends only"))

        await waitFor(() => {
            expect(mockUpdateMyVisibility).toHaveBeenCalledWith("friends_only", "test-token")
        })
    })

    it("does not re-save the already-selected level", async () => {
        render(<PrivacyScreen navigation={navigationProp} route={{} as never} />)

        await waitFor(() => expect(screen.getByText("Public")).toBeTruthy())
        fireEvent.press(screen.getByText("Public"))

        expect(mockUpdateMyVisibility).not.toHaveBeenCalled()
    })
})
