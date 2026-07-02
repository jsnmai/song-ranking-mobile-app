// Tests for the feed API request wrapper.
import { chooseThisOrThat, dismissThisOrThat, listMyFeed, reportRatingEvent } from "../apiRequests"

const mockGet = jest.fn()
const mockPost = jest.fn()

jest.mock("../../../api/client", () => ({
    apiClient: {
        get: (...args: unknown[]) => mockGet(...args),
        post: (...args: unknown[]) => mockPost(...args),
    },
}))

beforeEach(() => {
    jest.resetAllMocks()
})

describe("feed API requests", () => {
    it("lists the current user's feed", async () => {
        mockGet.mockResolvedValue({ events: [], next_cursor: null })

        await listMyFeed("test-token")

        expect(mockGet).toHaveBeenCalledWith("/api/v1/feed", "test-token")
    })

    it("lists the current user's feed with a cursor", async () => {
        mockGet.mockResolvedValue({ events: [], next_cursor: null })

        await listMyFeed("test-token", "2026-01-01T00:00:00+00:00|7")

        expect(mockGet).toHaveBeenCalledWith(
            "/api/v1/feed?cursor=2026-01-01T00%3A00%3A00%2B00%3A00%7C7",
            "test-token",
        )
    })

    it("reports a visible rating note", async () => {
        mockPost.mockResolvedValue({ id: 1, status: "open" })

        await reportRatingEvent(
            9,
            {
                target_type: "rating_note",
                reason: "spam",
                details: "Repeated spam.",
            },
            "test-token",
        )

        expect(mockPost).toHaveBeenCalledWith(
            "/api/v1/rating-events/9/report",
            {
                target_type: "rating_note",
                reason: "spam",
                details: "Repeated spam.",
            },
            "test-token",
        )
    })

    it("records a This-or-That choice", async () => {
        mockPost.mockResolvedValue({ recorded: true, swapped: true, winner_song_id: 43 })

        await chooseThisOrThat(42, 43, 43, "test-token")

        expect(mockPost).toHaveBeenCalledWith(
            "/api/v1/feed/this-or-that/choice",
            {
                left_song_id: 42,
                right_song_id: 43,
                winner_song_id: 43,
            },
            "test-token",
        )
    })

    it("dismisses a This-or-That prompt", async () => {
        mockPost.mockResolvedValue({ dismissed: true })

        await dismissThisOrThat(42, 43, "test-token")

        expect(mockPost).toHaveBeenCalledWith(
            "/api/v1/feed/this-or-that/dismiss",
            {
                left_song_id: 42,
                right_song_id: 43,
            },
            "test-token",
        )
    })
})
