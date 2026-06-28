// Tests for UserActivityScreen — the "view all" paginated activity list.
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import UserActivityScreen from "../UserActivityScreen"

const mockNavigate = jest.fn()
const mockGoBack = jest.fn()
const mockGetProfileActivity = jest.fn()
const mockGetMyRankingByDeezerId = jest.fn()
const mockLikeActivity = jest.fn()
const mockUnlikeActivity = jest.fn()

jest.mock("../apiRequests", () => ({
    getProfileActivity: (...args: unknown[]) => mockGetProfileActivity(...args),
}))

jest.mock("../../rankings/apiRequests", () => ({
    getMyRankingByDeezerId: (...args: unknown[]) => mockGetMyRankingByDeezerId(...args),
}))

jest.mock("../../auth/AuthContext", () => ({
    useAuth: () => ({ token: "test-token" }),
}))

jest.mock("../../activity/apiRequests", () => ({
    likeActivity: (...args: unknown[]) => mockLikeActivity(...args),
    unlikeActivity: (...args: unknown[]) => mockUnlikeActivity(...args),
}))

jest.mock("../../../utils/formatRelativeTime", () => ({
    formatRelativeTime: () => "3 hrs ago",
}))

const baseSong = {
    id: 10,
    deezer_id: 123,
    title: "Redbone",
    artist: "Childish Gambino",
    album: "Awaken, My Love!",
    cover_url: "https://example.com/cover.jpg",
    preview_url: null,
}

const item = (id: number, title: string) => ({
    rating_event_id: id,
    song: { ...baseSong, title },
    bucket: "like",
    score: 9.2,
    note: "love the bassline",
    like_count: 2,
    liked_by_viewer: false,
    created_at: "2026-05-01T10:00:00Z",
})

const navigationProp = { navigate: mockNavigate, goBack: mockGoBack } as never
const routeProp = { params: { username: "maya" } } as never

beforeEach(() => {
    jest.resetAllMocks()
})

describe("UserActivityScreen", () => {
    it("loads and renders the user's activity cards", async () => {
        mockGetProfileActivity.mockResolvedValue({ items: [item(42, "Redbone")], next_cursor: null })

        render(<UserActivityScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            expect(screen.getByTestId("activity-card-42")).toBeTruthy()
        })
        expect(screen.getByText("Redbone")).toBeTruthy()
        expect(mockGetProfileActivity).toHaveBeenCalledWith("maya", "test-token", undefined)
    })

    it("opens Song Detail as a re-rate when the viewer has rated the song", async () => {
        mockGetProfileActivity.mockResolvedValue({ items: [item(42, "Redbone")], next_cursor: null })
        const ranking = { id: 7, song_id: 10, bucket: "like", position: 1, score: 9.2 }
        mockGetMyRankingByDeezerId.mockResolvedValue(ranking)

        render(<UserActivityScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            expect(screen.getByTestId("activity-card-42")).toBeTruthy()
        })
        fireEvent.press(screen.getByTestId("activity-card-42"))

        await waitFor(() => {
            expect(mockGetMyRankingByDeezerId).toHaveBeenCalledWith(123, "test-token")
            expect(mockNavigate).toHaveBeenCalledWith("SongDetail", { ranking })
        })
    })

    it("falls back to the unrated song view when the viewer has not rated it", async () => {
        mockGetProfileActivity.mockResolvedValue({ items: [item(42, "Redbone")], next_cursor: null })
        mockGetMyRankingByDeezerId.mockRejectedValue(new Error("404"))

        render(<UserActivityScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            expect(screen.getByTestId("activity-card-42")).toBeTruthy()
        })
        fireEvent.press(screen.getByTestId("activity-card-42"))

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith(
                "SongDetail",
                { song: expect.objectContaining({ title: "Redbone" }) },
            )
        })
    })

    it("shows the empty state when there is no visible activity", async () => {
        mockGetProfileActivity.mockResolvedValue({ items: [], next_cursor: null })

        render(<UserActivityScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            expect(screen.getByText("No visible activity yet.")).toBeTruthy()
        })
    })
})
