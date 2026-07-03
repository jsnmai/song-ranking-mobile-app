// Tests for NotificationsScreen — the in-app notifications list (follows + likes).
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import NotificationsScreen from "../NotificationsScreen"

const mockNavigate = jest.fn()
const mockGoBack = jest.fn()
const mockGetNotifications = jest.fn()
const mockMarkRead = jest.fn()

jest.mock("../apiRequests", () => ({
    getNotifications: (...args: unknown[]) => mockGetNotifications(...args),
    markNotificationsRead: (...args: unknown[]) => mockMarkRead(...args),
}))

jest.mock("../../auth/AuthContext", () => ({
    useAuth: () => ({ token: "test-token" }),
}))

jest.mock("../../../utils/formatRelativeTime", () => ({
    formatRelativeTime: () => "3 hrs ago",
}))

const actor = {
    id: 1,
    user_id: 7,
    username: "maya",
    display_name: "Maya",
    avatar_color: "accent",
    timezone: null,
    is_public: true,
    visibility: "public",
    created_at: "2026-01-01T00:00:00Z",
}

const followNotification = {
    id: 1,
    type: "follow",
    actor,
    song: null,
    rating_event_id: null,
    created_at: "2026-05-01T10:00:00Z",
    read: false,
}

const likeNotification = {
    id: 2,
    type: "like",
    actor,
    song: {
        id: 10,
        deezer_id: 123,
        title: "Redbone",
        artist: "Childish Gambino",
        album: "Awaken, My Love!",
        cover_url: "https://example.com/cover.jpg",
        preview_url: null,
    },
    rating_event_id: 99,
    created_at: "2026-05-01T09:00:00Z",
    read: true,
}

const navigationProp = { navigate: mockNavigate, goBack: mockGoBack } as never
const routeProp = { params: {} } as never

beforeEach(() => {
    jest.resetAllMocks()
    mockMarkRead.mockResolvedValue({ unread_count: 0 })
})

describe("NotificationsScreen", () => {
    it("renders follow and like notifications and marks them read on mount", async () => {
        mockGetNotifications.mockResolvedValue({ items: [followNotification, likeNotification], next_cursor: null })

        render(<NotificationsScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            expect(screen.getByTestId("notification-1")).toBeTruthy()
        })
        expect(screen.getByText("started following you", { exact: false })).toBeTruthy()
        expect(screen.getByText("liked your rating of Redbone", { exact: false })).toBeTruthy()
        // Opening the screen clears the unread badge in the background.
        expect(mockMarkRead).toHaveBeenCalledWith("test-token")
    })

    it("opens the activity card when a like notification body is tapped", async () => {
        mockGetNotifications.mockResolvedValue({ items: [likeNotification], next_cursor: null })

        render(<NotificationsScreen navigation={navigationProp} route={routeProp} />)
        await waitFor(() => expect(screen.getByTestId("notification-2")).toBeTruthy())

        fireEvent.press(screen.getByTestId("notification-2"))
        expect(mockNavigate).toHaveBeenCalledWith("SingleActivity", { ratingEventId: 99 })
    })

    it("opens the follower's profile when a follow notification body is tapped", async () => {
        mockGetNotifications.mockResolvedValue({ items: [followNotification], next_cursor: null })

        render(<NotificationsScreen navigation={navigationProp} route={routeProp} />)
        await waitFor(() => expect(screen.getByTestId("notification-1")).toBeTruthy())

        fireEvent.press(screen.getByTestId("notification-1"))
        expect(mockNavigate).toHaveBeenCalledWith("OtherProfile", { username: "maya" })
    })

    it("opens the actor's profile when their avatar is tapped", async () => {
        mockGetNotifications.mockResolvedValue({ items: [likeNotification], next_cursor: null })

        render(<NotificationsScreen navigation={navigationProp} route={routeProp} />)
        await waitFor(() => expect(screen.getByTestId("notification-actor-2")).toBeTruthy())

        fireEvent.press(screen.getByTestId("notification-actor-2"))
        expect(mockNavigate).toHaveBeenCalledWith("OtherProfile", { username: "maya" })
    })

    it("clears a row's unread dot immediately when it is tapped", async () => {
        mockGetNotifications.mockResolvedValue({ items: [followNotification], next_cursor: null })

        render(<NotificationsScreen navigation={navigationProp} route={routeProp} />)
        await waitFor(() => expect(screen.getByTestId("notification-unread-1")).toBeTruthy())

        fireEvent.press(screen.getByTestId("notification-1"))

        // Returning from the pushed screen must not show the orange dot on a row already visited.
        expect(screen.queryByTestId("notification-unread-1")).toBeNull()
    })

    it("shows an empty state when there are no notifications", async () => {
        mockGetNotifications.mockResolvedValue({ items: [], next_cursor: null })

        render(<NotificationsScreen navigation={navigationProp} route={routeProp} />)
        await waitFor(() => expect(screen.getByText("No notifications yet.")).toBeTruthy())
    })
})
