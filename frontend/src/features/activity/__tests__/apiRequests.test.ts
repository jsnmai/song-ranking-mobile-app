// Tests for activity like API request wrappers.
import {
    getActivityLikers,
    likeActivity,
    unlikeActivity,
    updateLikePrivacy,
} from "../apiRequests"

const mockGet = jest.fn()
const mockPost = jest.fn()
const mockPut = jest.fn()
const mockDelete = jest.fn()

jest.mock("../../../api/client", () => ({
    apiClient: {
        get: (...args: unknown[]) => mockGet(...args),
        post: (...args: unknown[]) => mockPost(...args),
        put: (...args: unknown[]) => mockPut(...args),
        delete: (...args: unknown[]) => mockDelete(...args),
    },
}))

beforeEach(() => {
    jest.resetAllMocks()
})

describe("activity API requests", () => {
    it("likes and unlikes activity", async () => {
        mockPost.mockResolvedValue({ rating_event_id: 42, like_count: 1, liked_by_viewer: true })
        mockDelete.mockResolvedValue({ rating_event_id: 42, like_count: 0, liked_by_viewer: false })

        await likeActivity(42, "test-token")
        await unlikeActivity(42, "test-token")

        expect(mockPost).toHaveBeenCalledWith("/api/v1/activity/42/likes", {}, "test-token")
        expect(mockDelete).toHaveBeenCalledWith("/api/v1/activity/42/likes", "test-token")
    })

    it("gets activity likers", async () => {
        mockGet.mockResolvedValue({ profiles: [] })

        await getActivityLikers(42, "test-token")

        expect(mockGet).toHaveBeenCalledWith("/api/v1/activity/42/likes", "test-token")
    })

    it("updates like privacy", async () => {
        mockPut.mockResolvedValue({ hide_like_counts: true })

        await updateLikePrivacy(true, "test-token")

        expect(mockPut).toHaveBeenCalledWith(
            "/api/v1/profile/me/like-privacy",
            { hide_like_counts: true },
            "test-token",
        )
    })
})
