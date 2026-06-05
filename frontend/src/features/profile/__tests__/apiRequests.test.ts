// Tests for the profile API request wrappers.
import {
    blockUser,
    followUser,
    getBlockedProfiles,
    getFollowers,
    getFollowing,
    getMyProfile,
    getProfileByUsername,
    reportUser,
    searchProfiles,
    setupProfile,
    unblockUser,
    unfollowUser,
    updateMyVisibility,
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

describe("profile API requests", () => {
    it("gets the current user's profile", async () => {
        mockGet.mockResolvedValue({ username: "jasonmai" })

        await getMyProfile("test-token")

        expect(mockGet).toHaveBeenCalledWith("/api/v1/profile/me", "test-token")
    })

    it("searches profiles through the backend", async () => {
        mockGet.mockResolvedValue({ results: [] })

        await searchProfiles("Jason Mai", "test-token")

        expect(mockGet).toHaveBeenCalledWith("/api/v1/profile/search?q=Jason%20Mai", "test-token")
    })

    it("gets a profile by username", async () => {
        mockGet.mockResolvedValue({ username: "jasonmai" })

        await getProfileByUsername("jasonmai", "test-token")

        expect(mockGet).toHaveBeenCalledWith("/api/v1/profile/jasonmai", "test-token")
    })

    it("follows a user", async () => {
        mockPost.mockResolvedValue({ username: "jasonmai" })

        await followUser("jasonmai", "test-token")

        expect(mockPost).toHaveBeenCalledWith("/api/v1/profile/jasonmai/follow", {}, "test-token")
    })

    it("unfollows a user", async () => {
        mockDelete.mockResolvedValue({ username: "jasonmai" })

        await unfollowUser("jasonmai", "test-token")

        expect(mockDelete).toHaveBeenCalledWith("/api/v1/profile/jasonmai/follow", "test-token")
    })

    it("gets followers and following lists", async () => {
        mockGet.mockResolvedValue({ profiles: [] })

        await getFollowers("jasonmai", "test-token")
        await getFollowing("jasonmai", "test-token")

        expect(mockGet).toHaveBeenCalledWith("/api/v1/profile/jasonmai/followers", "test-token")
        expect(mockGet).toHaveBeenCalledWith("/api/v1/profile/jasonmai/following", "test-token")
    })

    it("sets up a new profile", async () => {
        mockPost.mockResolvedValue({ username: "jasonmai" })

        await setupProfile(
            {
                display_name: "Jason Mai",
                username: "jasonmai",
            },
            "test-token",
        )

        expect(mockPost).toHaveBeenCalledWith(
            "/api/v1/profile/setup",
            {
                display_name: "Jason Mai",
                username: "jasonmai",
            },
            "test-token",
        )
    })

    it("updates profile visibility", async () => {
        mockPut.mockResolvedValue({ username: "jasonmai" })

        await updateMyVisibility("friends_only", "test-token")

        expect(mockPut).toHaveBeenCalledWith(
            "/api/v1/profile/me/visibility",
            { visibility: "friends_only" },
            "test-token",
        )
    })

    it("gets blocked profiles and blocks/unblocks users", async () => {
        mockGet.mockResolvedValue({ profiles: [] })
        mockPost.mockResolvedValue({ username: "jasonmai" })
        mockDelete.mockResolvedValue({ username: "jasonmai" })

        await getBlockedProfiles("test-token")
        await blockUser("jasonmai", "test-token")
        await unblockUser("jasonmai", "test-token")

        expect(mockGet).toHaveBeenCalledWith("/api/v1/profile/me/blocked", "test-token")
        expect(mockPost).toHaveBeenCalledWith("/api/v1/profile/jasonmai/block", {}, "test-token")
        expect(mockDelete).toHaveBeenCalledWith("/api/v1/profile/jasonmai/block", "test-token")
    })

    it("reports a user profile", async () => {
        mockPost.mockResolvedValue({ id: 1, status: "open" })

        await reportUser(
            "jasonmai",
            {
                target_type: "profile",
                reason: "spam",
                details: "Suspicious profile activity.",
            },
            "test-token",
        )

        expect(mockPost).toHaveBeenCalledWith(
            "/api/v1/profile/jasonmai/report",
            {
                target_type: "profile",
                reason: "spam",
                details: "Suspicious profile activity.",
            },
            "test-token",
        )
    })
})
