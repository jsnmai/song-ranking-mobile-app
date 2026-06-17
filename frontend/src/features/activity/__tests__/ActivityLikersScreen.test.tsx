// Tests for the activity likers list surface.
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import ActivityLikersScreen from "../ActivityLikersScreen"

const mockNavigate = jest.fn()
const mockGoBack = jest.fn()
const mockGetActivityLikers = jest.fn()

jest.mock("../../auth/AuthContext", () => ({
    useAuth: () => ({ token: "test-token" }),
}))

jest.mock("../apiRequests", () => ({
    getActivityLikers: (...args: unknown[]) => mockGetActivityLikers(...args),
}))

const route = { params: { ratingEventId: 42 } } as never
const navigation = { navigate: mockNavigate, goBack: mockGoBack } as never

const liker = {
    id: 3,
    user_id: 4,
    username: "maya",
    display_name: "Maya",
    avatar_color: null,
    timezone: null,
    is_public: true,
    visibility: "public",
    created_at: "2026-01-01T00:00:00Z",
    follower_count: 12,
    following_count: 8,
    is_following: false,
    is_followed_by: false,
    is_own_profile: false,
    can_view_taste: true,
    is_blocked: false,
    hide_like_counts: false,
    user_stats: null,
}

beforeEach(() => {
    jest.resetAllMocks()
    mockGetActivityLikers.mockResolvedValue({ profiles: [liker] })
})

describe("ActivityLikersScreen", () => {
    it("fetches likers and opens a liker profile", async () => {
        render(<ActivityLikersScreen navigation={navigation} route={route} />)

        await waitFor(() => {
            expect(mockGetActivityLikers).toHaveBeenCalledWith(42, "test-token")
            expect(screen.getByText("Maya")).toBeTruthy()
        })
        fireEvent.press(screen.getByTestId("activity-liker-maya"))

        expect(mockNavigate).toHaveBeenCalledWith("OtherProfile", { username: "maya" })
    })

    it("shows an empty state when there are no visible likers", async () => {
        mockGetActivityLikers.mockResolvedValue({ profiles: [] })

        render(<ActivityLikersScreen navigation={navigation} route={route} />)

        await waitFor(() => {
            expect(screen.getByText("No likes yet.")).toBeTruthy()
        })
    })
})
