// Tests for the profile API request wrappers.
import {
    followUser,
    getFollowers,
    getFollowing,
    getMyProfile,
    getProfileByUsername,
    searchProfiles,
    setupProfile,
    unfollowUser,
} from "../apiRequests"

const mockGet = jest.fn()
const mockPost = jest.fn()
const mockDelete = jest.fn()

jest.mock("../../../api/client", () => ({
    apiClient: {
        get: (...args: unknown[]) => mockGet(...args),
        post: (...args: unknown[]) => mockPost(...args),
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
})
