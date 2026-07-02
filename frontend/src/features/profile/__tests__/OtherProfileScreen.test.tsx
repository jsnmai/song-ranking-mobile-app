// Tests for the taste-match ("You & them") row on OtherProfileScreen.
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import { ApiError } from "../../../api/client"
import OtherProfileScreen from "../OtherProfileScreen"
import { CompatibilityResponse, Profile } from "../types"

const mockGoBack = jest.fn()
const mockNavigate = jest.fn()

const mockGetProfileByUsername = jest.fn()
const mockGetCompatibility = jest.fn()
const mockGetUserTasteProfile = jest.fn()
const mockGetUserAuxstrology = jest.fn()
const mockGetProfileRecentRatings = jest.fn()
const mockGetProfileRankings = jest.fn()
const mockFollowUser = jest.fn()
const mockUnfollowUser = jest.fn()
const mockBlockUser = jest.fn()
const mockUnblockUser = jest.fn()
const mockReportUser = jest.fn()

jest.mock("../../auth/AuthContext", () => ({
    useAuth: () => ({
        token: "test-token",
    }),
}))

jest.mock("../apiRequests", () => ({
    getProfileByUsername: (...args: unknown[]) => mockGetProfileByUsername(...args),
    getCompatibility: (...args: unknown[]) => mockGetCompatibility(...args),
    getUserTasteProfile: (...args: unknown[]) => mockGetUserTasteProfile(...args),
    getUserAuxstrology: (...args: unknown[]) => mockGetUserAuxstrology(...args),
    getProfileRecentRatings: (...args: unknown[]) => mockGetProfileRecentRatings(...args),
    getProfileRankings: (...args: unknown[]) => mockGetProfileRankings(...args),
    followUser: (...args: unknown[]) => mockFollowUser(...args),
    unfollowUser: (...args: unknown[]) => mockUnfollowUser(...args),
    blockUser: (...args: unknown[]) => mockBlockUser(...args),
    unblockUser: (...args: unknown[]) => mockUnblockUser(...args),
    reportUser: (...args: unknown[]) => mockReportUser(...args),
}))

const profile: Profile = {
    id: 3,
    user_id: 4,
    username: "maya",
    display_name: "Maya",
    avatar_color: null, timezone: null,
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

const compatOverlap: CompatibilityResponse = {
    has_overlap: true,
    similarity_score: 0.78,
    shared_song_count: 9,
    explanation: "Both love Frank Ocean",
    is_plus: false,
}

const compatNoOverlap: CompatibilityResponse = {
    has_overlap: false,
    similarity_score: null,
    shared_song_count: 0,
    explanation: "Not enough overlap yet · Rate more songs to compare",
    is_plus: false,
}

const auxLocked = {
    status: "locked",
    current_ratings: 2,
    required_ratings: 10,
    sign: null,
    caption: null,
    adjectives: [],
    evidence: [],
    axes: {},
}

const auxActive = {
    status: "active",
    current_ratings: 24,
    required_ratings: null,
    sign: { name: "The Late-night Romantic", summary: "Lush, nocturnal, and a little dramatic." },
    caption: "Big choruses and a soft spot for the sad bridge.",
    adjectives: ["Nocturnal", "Lush"],
    evidence: [],
    axes: {},
}

const tasteFixture = {
    total_rated: 24,
    avg_score: 7.1,
    bucket_breakdown: { like: 10, okay: 0, dislike: 0 },
    overall: {
        genres: [{ name: "R&B", count: 9, percentage: 38 }],
        top_artists: [{ name: "Frank Ocean", count: 6 }],
    },
    by_bucket: {
        like: { genres: [], top_artists: [], avg_score: null, count: 0 },
        okay: { genres: [], top_artists: [], avg_score: null, count: 0 },
        dislike: { genres: [], top_artists: [], avg_score: null, count: 0 },
    },
}

const rankingFixture = {
    id: 7,
    song_id: 42,
    bucket: "like",
    position: 1,
    score: 9.4,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    song: {
        id: 42,
        deezer_id: 123,
        isrc: null,
        title: "Nights",
        artist: "Frank Ocean",
        artist_deezer_id: 456,
        album: "Blonde",
        cover_url: "https://example.com/cover.jpg",
        preview_url: null,
        genre_deezer: null,
        musicbrainz_id: null,
        genres_mb: null,
        release_year: null,
        spotify_energy: null,
        spotify_valence: null,
        spotify_tempo: null,
        spotify_danceability: null,
        metadata_enriched_at: null,
        spotify_enriched_at: null,
        global_avg_score: null,
        global_rating_count: 0,
        created_at: "2026-01-01T00:00:00Z",
    },
}

const navigationProp = {
    navigate: mockNavigate,
    goBack: mockGoBack,
} as never

const routeProp = {
    params: { username: "maya" },
} as never

beforeEach(() => {
    jest.resetAllMocks()
    mockGetProfileByUsername.mockResolvedValue(profile)
    mockGetCompatibility.mockResolvedValue(compatNoOverlap)
    mockGetProfileRecentRatings.mockResolvedValue({ items: [] })
    mockGetProfileRankings.mockResolvedValue({ rankings: [], next_cursor: null })
    mockGetUserTasteProfile.mockResolvedValue(tasteFixture)
    mockGetUserAuxstrology.mockResolvedValue(auxLocked)
    mockReportUser.mockResolvedValue({
        id: 1,
        status: "open",
    })
})

describe("OtherProfileScreen taste-match row", () => {
    it("shows the overlap percentage and shared-ratings meta when has_overlap is true", async () => {
        mockGetCompatibility.mockResolvedValue(compatOverlap)

        render(<OtherProfileScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            expect(screen.getByText("78%")).toBeTruthy()
            expect(screen.getByText("OVERLAP")).toBeTruthy()
            expect(screen.getByText("You & Maya")).toBeTruthy()
            expect(screen.getByText(/9 SONGS YOU'VE BOTH RATED/)).toBeTruthy()
        })
    })

    it("shows not-enough-overlap text when has_overlap is false", async () => {
        render(<OtherProfileScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            expect(screen.getByText(/Not enough overlap yet/)).toBeTruthy()
        })
        // No percentage column without overlap.
        expect(screen.queryByText("OVERLAP")).toBeNull()
    })

    it("does not render a taste-match row when the compatibility request returns 404", async () => {
        mockGetCompatibility.mockRejectedValue(new ApiError(404, "Profile not found.", null))

        render(<OtherProfileScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            // Profile should still render
            expect(screen.getByText("Maya")).toBeTruthy()
        })
        // Neither taste-match phrase should appear
        expect(screen.queryByText(/You & Maya/)).toBeNull()
        expect(screen.queryByText(/Not enough overlap/)).toBeNull()
    })

    it("does not block profile from rendering while compat is loading", async () => {
        // Compatibility never resolves during this test
        mockGetCompatibility.mockReturnValue(new Promise(() => {}))

        render(<OtherProfileScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            expect(screen.getByText("Maya")).toBeTruthy()
            expect(screen.getByText("@maya")).toBeTruthy()
        })
    })

    it("renders taste profile, top songs, and genres sections alongside the taste-match row", async () => {
        mockGetCompatibility.mockResolvedValue(compatOverlap)
        mockGetUserTasteProfile.mockResolvedValue(tasteFixture)
        mockGetProfileRankings.mockResolvedValue({ rankings: [rankingFixture], next_cursor: null })

        render(<OtherProfileScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            expect(screen.getByText("78%")).toBeTruthy()
            expect(screen.getByText("TASTE PROFILE")).toBeTruthy()
            expect(screen.getByText("THEIR TOP SONGS")).toBeTruthy()
            expect(screen.getByText("TOP GENRES")).toBeTruthy()
            expect(screen.getByText("TOP ARTIST")).toBeTruthy()
            expect(screen.getByText("RATING SPLIT")).toBeTruthy()
            expect(screen.getByText("AVG SCORE")).toBeTruthy()
        })
    })

    it("renders the Auxstrology card when the user's reading is active", async () => {
        mockGetUserAuxstrology.mockResolvedValue(auxActive)

        render(<OtherProfileScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            expect(screen.getByTestId("other-profile-auxstrology")).toBeTruthy()
            expect(screen.getByText("AUXSTROLOGY")).toBeTruthy()
            expect(screen.getByText(/Late-night Romantic/)).toBeTruthy()
        })
    })

    it("hides the Auxstrology card while the reading is locked", async () => {
        render(<OtherProfileScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            expect(screen.getByText("Maya")).toBeTruthy()
        })
        expect(screen.queryByTestId("other-profile-auxstrology")).toBeNull()
    })

    it("blocks the user from the report panel's block row", async () => {
        mockBlockUser.mockResolvedValue({ ...profile, is_blocked: true, can_view_taste: false })

        render(<OtherProfileScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            expect(screen.getByLabelText("Report user")).toBeTruthy()
        })
        fireEvent.press(screen.getByLabelText("Report user"))
        fireEvent.press(screen.getByText("Block @maya"))

        await waitFor(() => {
            expect(mockBlockUser).toHaveBeenCalledWith("maya", "test-token")
        })
    })

    it("shows a friends-only state when taste is hidden but shell is visible", async () => {
        mockGetProfileByUsername.mockResolvedValue({
            ...profile,
            visibility: "friends_only",
            can_view_taste: false,
        })

        render(<OtherProfileScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            expect(screen.getByText("This user shares taste with friends only.")).toBeTruthy()
            expect(screen.getByText("Follow each other to compare taste.")).toBeTruthy()
        })
        expect(mockGetCompatibility).not.toHaveBeenCalled()
    })

    it("shows Report user on other profiles and submits a report with details", async () => {
        render(<OtherProfileScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            expect(screen.getByLabelText("Report user")).toBeTruthy()
        })
        fireEvent.press(screen.getByLabelText("Report user"))
        fireEvent.press(screen.getByText("Submit report"))
        expect(mockReportUser).not.toHaveBeenCalled()

        fireEvent.press(screen.getByText("Spam"))
        fireEvent.changeText(screen.getByPlaceholderText("Add context for review."), "Repeated promo links.")
        fireEvent.press(screen.getByText("Submit report"))

        await waitFor(() => {
            expect(mockReportUser).toHaveBeenCalledWith(
                "maya",
                {
                    target_type: "profile",
                    reason: "spam",
                    details: "Repeated promo links.",
                },
                "test-token",
            )
            expect(screen.getByText("Thanks. We'll review this report.")).toBeTruthy()
        })
    })

    it("shows a report error without pretending success", async () => {
        mockReportUser.mockRejectedValue(new Error("Could not submit report."))
        render(<OtherProfileScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            expect(screen.getByLabelText("Report user")).toBeTruthy()
        })
        fireEvent.press(screen.getByLabelText("Report user"))
        fireEvent.press(screen.getByText("Other"))
        fireEvent.press(screen.getByText("Submit report"))

        await waitFor(() => {
            expect(screen.getByText("Could not submit report.")).toBeTruthy()
        })
        expect(screen.queryByText("Thanks. We'll review this report.")).toBeNull()
    })

    it("does not show Report user for own profile state", async () => {
        mockGetProfileByUsername.mockResolvedValue({
            ...profile,
            is_own_profile: true,
        })

        render(<OtherProfileScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            expect(screen.getByText("Maya")).toBeTruthy()
        })
        expect(screen.queryByText("Report user")).toBeNull()
    })
})

describe("OtherProfileScreen follow relationship label", () => {
    it("shows FRIENDS when the follow is mutual", async () => {
        mockGetProfileByUsername.mockResolvedValue({
            ...profile,
            is_following: true,
            is_followed_by: true,
        })

        render(<OtherProfileScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            expect(screen.getByText(/· FRIENDS/)).toBeTruthy()
        })
        expect(screen.queryByText(/FOLLOWS YOU/)).toBeNull()
    })

    it("shows FOLLOWS YOU when they follow you but you don't follow back", async () => {
        mockGetProfileByUsername.mockResolvedValue({
            ...profile,
            is_following: false,
            is_followed_by: true,
        })

        render(<OtherProfileScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            expect(screen.getByText(/· FOLLOWS YOU/)).toBeTruthy()
        })
        expect(screen.queryByText(/FRIENDS/)).toBeNull()
    })

    it("shows no relationship marker when they don't follow you", async () => {
        mockGetProfileByUsername.mockResolvedValue({
            ...profile,
            is_following: true,
            is_followed_by: false,
        })

        render(<OtherProfileScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            expect(screen.getByText("Maya")).toBeTruthy()
        })
        expect(screen.queryByText(/FOLLOWS YOU/)).toBeNull()
        expect(screen.queryByText(/FRIENDS/)).toBeNull()
    })

    it("does not refetch taste sections when following toggles (no flicker)", async () => {
        mockGetCompatibility.mockResolvedValue(compatOverlap)
        mockFollowUser.mockResolvedValue({ ...profile, is_following: true, follower_count: 13 })

        render(<OtherProfileScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => expect(screen.getByText("Follow")).toBeTruthy())
        // Taste-dependent sections fetched exactly once on initial load.
        expect(mockGetCompatibility).toHaveBeenCalledTimes(1)
        expect(mockGetUserTasteProfile).toHaveBeenCalledTimes(1)
        expect(mockGetUserAuxstrology).toHaveBeenCalledTimes(1)

        fireEvent.press(screen.getByText("Follow"))

        await waitFor(() => expect(screen.getByText("Following")).toBeTruthy())
        // The follow toggle must not re-trigger the taste/compat fetches.
        expect(mockGetCompatibility).toHaveBeenCalledTimes(1)
        expect(mockGetUserTasteProfile).toHaveBeenCalledTimes(1)
        expect(mockGetUserAuxstrology).toHaveBeenCalledTimes(1)
    })
})
