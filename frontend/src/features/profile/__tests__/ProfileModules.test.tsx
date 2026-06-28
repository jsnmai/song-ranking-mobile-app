// Tests for RecentRatingsModule, RankingsPreviewModule, and MostCompatibleModule on ProfileScreen and OtherProfileScreen.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native"
import { Alert, AlertButton } from "react-native"

import OtherProfileScreen from "../OtherProfileScreen"
import ProfileScreen from "../ProfileScreen"
import { CompatibilityResponse, MostCompatibleItem, MostCompatibleResponse, Profile, RecentRatingsResponse, TasteProfileResponse } from "../types"
import { RankingListResponse, RankingResponse } from "../../comparison/types"

// ── Navigation mocks ─────────────────────────────────────────────────────────

const mockNavigate = jest.fn()
const mockGoBack = jest.fn()

jest.mock("@react-navigation/native", () => ({
    ...jest.requireActual("@react-navigation/native"),
    useNavigation: () => ({ navigate: mockNavigate }),
    useFocusEffect: (cb: () => void) => cb(),
}))

// ── Auth mock ────────────────────────────────────────────────────────────────

jest.mock("../../auth/AuthContext", () => ({
    useAuth: () => ({ token: "test-token" }),
}))

// ── Profile API mocks ────────────────────────────────────────────────────────

const mockGetMyProfile = jest.fn()
const mockGetMyTasteProfile = jest.fn()
const mockGetMyAuxstrology = jest.fn()
const mockGetMyRecentRatings = jest.fn()
const mockGetProfileByUsername = jest.fn()
const mockGetCompatibility = jest.fn()
const mockGetUserTasteProfile = jest.fn()
const mockGetProfileRecentRatings = jest.fn()
const mockGetProfileRankings = jest.fn()
const mockFollowUser = jest.fn()
const mockUnfollowUser = jest.fn()
const mockBlockUser = jest.fn()
const mockUnblockUser = jest.fn()
const mockReportUser = jest.fn()
const mockGetProfileBookmarks = jest.fn()
const mockGetMostCompatible = jest.fn()
const mockGetProfileAnchors = jest.fn()
const mockGetUserAuxstrology = jest.fn()
const mockLikeActivity = jest.fn()
const mockUnlikeActivity = jest.fn()
const mockUpdateLikePrivacy = jest.fn()

jest.mock("../apiRequests", () => ({
    getMyProfile: (...args: unknown[]) => mockGetMyProfile(...args),
    getMyTasteProfile: (...args: unknown[]) => mockGetMyTasteProfile(...args),
    getMyAuxstrology: (...args: unknown[]) => mockGetMyAuxstrology(...args),
    getMyRecentRatings: (...args: unknown[]) => mockGetMyRecentRatings(...args),
    getProfileByUsername: (...args: unknown[]) => mockGetProfileByUsername(...args),
    getCompatibility: (...args: unknown[]) => mockGetCompatibility(...args),
    getUserTasteProfile: (...args: unknown[]) => mockGetUserTasteProfile(...args),
    getProfileRecentRatings: (...args: unknown[]) => mockGetProfileRecentRatings(...args),
    getProfileRankings: (...args: unknown[]) => mockGetProfileRankings(...args),
    getProfileBookmarks: (...args: unknown[]) => mockGetProfileBookmarks(...args),
    getMostCompatible: (...args: unknown[]) => mockGetMostCompatible(...args),
    getProfileAnchors: (...args: unknown[]) => mockGetProfileAnchors(...args),
    getUserAuxstrology: (...args: unknown[]) => mockGetUserAuxstrology(...args),
    followUser: (...args: unknown[]) => mockFollowUser(...args),
    unfollowUser: (...args: unknown[]) => mockUnfollowUser(...args),
    blockUser: (...args: unknown[]) => mockBlockUser(...args),
    unblockUser: (...args: unknown[]) => mockUnblockUser(...args),
    reportUser: (...args: unknown[]) => mockReportUser(...args),
}))

jest.mock("../../activity/apiRequests", () => ({
    likeActivity: (...args: unknown[]) => mockLikeActivity(...args),
    unlikeActivity: (...args: unknown[]) => mockUnlikeActivity(...args),
    updateLikePrivacy: (...args: unknown[]) => mockUpdateLikePrivacy(...args),
}))

const mockListMyRankings = jest.fn()
const mockGetMyRankingByDeezerId = jest.fn()
const mockRemoveRating = jest.fn()

jest.mock("../../rankings/apiRequests", () => ({
    listMyRankings: (...args: unknown[]) => mockListMyRankings(...args),
    getMyRankingAnchors: jest.fn().mockResolvedValue({ top_like: null, median_okay: null, lowest_dislike: null }),
    getMyRankingByDeezerId: (...args: unknown[]) => mockGetMyRankingByDeezerId(...args),
    removeRating: (...args: unknown[]) => mockRemoveRating(...args),
}))

// ── Fixtures ─────────────────────────────────────────────────────────────────

const myProfile: Profile = {
    id: 1,
    user_id: 2,
    username: "jason",
    display_name: "Jason",
    avatar_color: null, timezone: null,
    is_public: true,
    visibility: "public",
    created_at: "2026-01-01T00:00:00Z",
    follower_count: 5,
    following_count: 3,
    is_following: false,
    is_followed_by: false,
    is_own_profile: true,
    can_view_taste: true,
    is_blocked: false,
    hide_like_counts: false,
    user_stats: { rated_count: 42, bookmarked_count: 7 },
}

const otherProfile: Profile = {
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
    user_stats: { rated_count: 18, bookmarked_count: 3 },
}

const song = {
    id: 10,
    deezer_id: 123456,
    isrc: null,
    title: "Redbone",
    artist: "Childish Gambino",
    artist_deezer_id: 789,
    album: "Awaken, My Love!",
    cover_url: "https://example.com/redbone.jpg",
    preview_url: null,
    genre_deezer: null,
    musicbrainz_id: null,
    genres_mb: null,
    release_year: 2016,
    spotify_energy: null,
    spotify_valence: null,
    spotify_tempo: null,
    spotify_danceability: null,
    metadata_enriched_at: null,
    spotify_enriched_at: null,
    global_avg_score: null,
    global_rating_count: 0,
    created_at: "2026-01-01T00:00:00Z",
}

const ratingItem = {
    rating_event_id: 42,
    song,
    bucket: "like",
    score: 9.2,
    note: "love the bassline",
    like_count: 4,
    liked_by_viewer: false,
    created_at: "2026-05-01T10:00:00Z",
}

const ratingsResponse: RecentRatingsResponse = { items: [ratingItem] }
const emptyRatingsResponse: RecentRatingsResponse = { items: [] }

const ranking: RankingResponse = {
    id: 7,
    song_id: 10,
    bucket: "like",
    position: 1,
    score: 9.2,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    song,
}

const rankingsResponse: RankingListResponse = {
    rankings: [ranking],
    next_cursor: null,
}

const emptyRankingsResponse: RankingListResponse = { rankings: [], next_cursor: null }

const compatNoOverlap: CompatibilityResponse = {
    has_overlap: false,
    similarity_score: null,
    shared_song_count: 0,
    explanation: "Not enough overlap yet",
    is_plus: false,
}

const compatibleUser: MostCompatibleItem = {
    username: "maya",
    display_name: "Maya",
    similarity_score: 0.87,
    shared_song_count: 14,
    explanation: "Both love Frank Ocean",
    computed_at: "2026-06-01T00:00:00Z",
}

const mostCompatibleResponse: MostCompatibleResponse = { users: [compatibleUser] }
const emptyMostCompatibleResponse: MostCompatibleResponse = { users: [] }

// ── ProfileScreen tests ───────────────────────────────────────────────────────

describe("ProfileScreen profile modules", () => {
    beforeEach(() => {
        jest.resetAllMocks()
        mockGetMyProfile.mockResolvedValue(myProfile)
        mockGetMyTasteProfile.mockResolvedValue({ total_rated: 0, avg_score: null, bucket_breakdown: { like: 0, okay: 0, dislike: 0 }, overall: { genres: [], top_artists: [] }, by_bucket: { like: { genres: [], top_artists: [], avg_score: null, count: 0 }, okay: { genres: [], top_artists: [], avg_score: null, count: 0 }, dislike: { genres: [], top_artists: [], avg_score: null, count: 0 } } })
        mockGetMyRecentRatings.mockResolvedValue(ratingsResponse)
        mockListMyRankings.mockResolvedValue(rankingsResponse)
        mockGetMostCompatible.mockResolvedValue(mostCompatibleResponse)
        mockLikeActivity.mockResolvedValue({
            rating_event_id: 42,
            like_count: 5,
            liked_by_viewer: true,
        })
        mockUnlikeActivity.mockResolvedValue({
            rating_event_id: 42,
            like_count: 4,
            liked_by_viewer: false,
        })
        mockGetMyAuxstrology.mockResolvedValue({
            status: "locked", current_ratings: 0, required_ratings: 1,
            sign: null, caption: null, adjectives: [], evidence: [], axes: {},
        })
    })

    it("renders the activity feed on the profile tab", async () => {
        render(<ProfileScreen />)

        await waitFor(() => {
            expect(screen.getByTestId(`activity-card-${ratingItem.rating_event_id}`)).toBeTruthy()
        })
    })

    it("opens the activity three-dots menu and removes a rating", async () => {
        mockRemoveRating.mockResolvedValue({ rating_event: { event_type: "removed" } })
        const alertSpy = jest.spyOn(Alert, "alert")

        render(<ProfileScreen />)
        await waitFor(() => expect(screen.getByTestId("activity-card-42")).toBeTruthy())

        // Open the three-dots options sheet.
        fireEvent.press(screen.getByTestId("activity-options-42"))
        expect(screen.getByTestId("activity-menu-rerate")).toBeTruthy()
        expect(screen.getByTestId("activity-menu-reorder")).toBeTruthy()
        expect(screen.getByTestId("activity-menu-remove")).toBeTruthy()
        expect(screen.getByText("Hide like counts")).toBeTruthy()

        // Remove → confirm → removeRating(song_id).
        fireEvent.press(screen.getByTestId("activity-menu-remove"))
        const buttons = alertSpy.mock.calls[0][2] as AlertButton[]
        await act(async () => { buttons[1].onPress?.() })

        await waitFor(() => {
            expect(mockRemoveRating).toHaveBeenCalledWith(10, "test-token")
        })
    })

    it("toggles like-count privacy from the activity menu", async () => {
        mockUpdateLikePrivacy.mockResolvedValue({ ...myProfile, hide_like_counts: true })

        render(<ProfileScreen />)
        await waitFor(() => expect(screen.getByTestId("activity-card-42")).toBeTruthy())

        fireEvent.press(screen.getByTestId("activity-options-42"))
        await act(async () => {
            fireEvent.press(screen.getByTestId("activity-menu-like-privacy"))
        })

        expect(mockUpdateLikePrivacy).toHaveBeenCalledWith(true, "test-token")
    })

    it("locks Reorder in the activity menu until 10 songs are rated", async () => {
        mockGetMyProfile.mockResolvedValue({ ...myProfile, user_stats: { rated_count: 4, bookmarked_count: 0 } })

        render(<ProfileScreen />)
        await waitFor(() => expect(screen.getByTestId("activity-card-42")).toBeTruthy())

        fireEvent.press(screen.getByTestId("activity-options-42"))
        expect(screen.getByText("LOCKED")).toBeTruthy()

        // Tapping the locked Reorder row does not navigate.
        fireEvent.press(screen.getByTestId("activity-menu-reorder"))
        expect(mockNavigate).not.toHaveBeenCalledWith("Reorder")
    })

    it("renders the Auxstrology sign and caption when the reading is active", async () => {
        mockGetMyAuxstrology.mockResolvedValue({
            status: "active",
            current_ratings: 12,
            required_ratings: null,
            sign: { name: "The Midnight Judge", summary: "Your verdicts come in after the world goes quiet." },
            caption: "Your scores lean nocturnal, surgical, and a little melancholic.",
            adjectives: ["nocturnal", "surgical", "melancholic"],
            evidence: [],
            axes: { nocturnality: "very_high" },
        })
        render(<ProfileScreen />)

        await waitFor(() => {
            expect(screen.getByText("Your scores lean nocturnal, surgical, and a little melancholic.")).toBeTruthy()
            expect(screen.getByText("The\nMidnight Judge")).toBeTruthy()
        })
    })

    it("keeps the Auxstrology card locked while the reading is locked", async () => {
        render(<ProfileScreen />)

        await waitFor(() => {
            expect(screen.getByText("Locked\nfor now")).toBeTruthy()
        })
    })

    it("renders Rated and Bookmarked counts from user_stats", async () => {
        render(<ProfileScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("stats-rated")).toBeTruthy()
            expect(screen.getByTestId("stats-bookmarked")).toBeTruthy()
            expect(screen.getByText("42")).toBeTruthy()
            expect(screen.getByText("7")).toBeTruthy()
        })
    })

    it("tapping Rated on own profile navigates to FullRankings", async () => {
        render(<ProfileScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("stats-rated")).toBeTruthy()
        })
        fireEvent.press(screen.getByTestId("stats-rated"))

        expect(mockNavigate).toHaveBeenCalledWith("MainTabs", { screen: "Rankings", params: { screen: "FullRankings" } })
    })

    it("tapping Bookmarked on own profile navigates to Bookmarks", async () => {
        render(<ProfileScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("stats-bookmarked")).toBeTruthy()
        })
        fireEvent.press(screen.getByTestId("stats-bookmarked"))

        expect(mockNavigate).toHaveBeenCalledWith("Bookmarks")
    })

    it("activity card shows song title, artist, note, and bucket", async () => {
        render(<ProfileScreen />)

        await waitFor(() => {
            expect(screen.getByText("Redbone")).toBeTruthy()
            expect(screen.getByText("Childish Gambino")).toBeTruthy()
            expect(screen.getByText('"love the bassline"')).toBeTruthy()
            expect(screen.getByText("IN LIKE")).toBeTruthy()
        })
    })

    it("own activity card supports optimistic likes", async () => {
        mockLikeActivity.mockReturnValue(new Promise(() => {}))
        render(<ProfileScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("activity-like-button-42")).toBeTruthy()
        })
        fireEvent.press(screen.getByTestId("activity-like-button-42"))

        expect(screen.getByTestId("activity-like-button-42").props.accessibilityState.selected).toBe(true)
        expect(within(screen.getByTestId("activity-like-count-42")).getByText("5")).toBeTruthy()
        expect(mockLikeActivity).toHaveBeenCalledWith(42, "test-token")
    })

    it("tapping an activity card navigates to SongDetail", async () => {
        render(<ProfileScreen />)

        await waitFor(() => {
            expect(screen.getByTestId(`activity-card-${ratingItem.rating_event_id}`)).toBeTruthy()
        })
        fireEvent.press(screen.getByTestId(`activity-card-${ratingItem.rating_event_id}`))

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith("SongDetail", expect.anything())
        })
    })

    it("renders no activity when ratings list is empty", async () => {
        mockGetMyRecentRatings.mockResolvedValue(emptyRatingsResponse)

        render(<ProfileScreen />)

        await waitFor(() => {
            expect(screen.getByText("42")).toBeTruthy()
        })
        expect(screen.queryByText("Your Activity")).toBeNull()
    })

    it("renders Most Compatible module", async () => {
        render(<ProfileScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("most-compatible-module")).toBeTruthy()
        })
    })

    it("renders a compatible user row with match percentage", async () => {
        render(<ProfileScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("most-compatible-item-maya")).toBeTruthy()
            expect(screen.getByText("@maya")).toBeTruthy()
            expect(screen.getByText("87%")).toBeTruthy()
        })
    })

    it("tapping a compatible user navigates to OtherProfile", async () => {
        render(<ProfileScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("most-compatible-item-maya")).toBeTruthy()
        })
        fireEvent.press(screen.getByTestId("most-compatible-item-maya"))

        expect(mockNavigate).toHaveBeenCalledWith("OtherProfile", { username: "maya" })
    })

    it("View all on Most Compatible navigates to MostCompatible screen", async () => {
        render(<ProfileScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("most-compatible-view-all")).toBeTruthy()
        })
        fireEvent.press(screen.getByTestId("most-compatible-view-all"))

        expect(mockNavigate).toHaveBeenCalledWith("MostCompatible")
    })

    it("renders Most Compatible empty state when no compatible users", async () => {
        mockGetMostCompatible.mockResolvedValue(emptyMostCompatibleResponse)

        render(<ProfileScreen />)

        await waitFor(() => {
            expect(screen.getByText("Rate more songs to find compatible listeners.")).toBeTruthy()
        })
    })
})

// ── OtherProfileScreen tests ──────────────────────────────────────────────────

const otherProfilePrivate: Profile = {
    ...otherProfile,
    can_view_taste: false,
    user_stats: null,
}

describe("OtherProfileScreen profile modules", () => {
    const navigationProp = { navigate: mockNavigate, goBack: mockGoBack } as never
    const routeProp = { params: { username: "maya" } } as never

    const emptyTaste: TasteProfileResponse = {
        total_rated: 0,
        avg_score: null,
        bucket_breakdown: { like: 0, okay: 0, dislike: 0 },
        overall: { genres: [], top_artists: [] },
        by_bucket: {
            like: { genres: [], top_artists: [], avg_score: null, count: 0 },
            okay: { genres: [], top_artists: [], avg_score: null, count: 0 },
            dislike: { genres: [], top_artists: [], avg_score: null, count: 0 },
        },
    }

    beforeEach(() => {
        jest.resetAllMocks()
        mockGetProfileByUsername.mockResolvedValue(otherProfile)
        mockGetCompatibility.mockResolvedValue(compatNoOverlap)
        mockGetProfileRecentRatings.mockResolvedValue(ratingsResponse)
        mockGetProfileRankings.mockResolvedValue(rankingsResponse)
        mockGetProfileBookmarks.mockResolvedValue({ bookmarks: [] })
        mockReportUser.mockResolvedValue({ id: 1, status: "open" })
        mockGetUserTasteProfile.mockResolvedValue(emptyTaste)
        mockGetUserAuxstrology.mockResolvedValue({
            status: "locked",
            current_ratings: 0,
            required_ratings: 10,
            sign: null,
            caption: null,
            adjectives: [],
            evidence: [],
            axes: {},
        })
        mockLikeActivity.mockResolvedValue({
            rating_event_id: 42,
            like_count: 5,
            liked_by_viewer: true,
        })
    })

    it("renders Their Top Songs with View all navigating to UserRankings", async () => {
        render(<OtherProfileScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            expect(screen.getByText("THEIR TOP SONGS")).toBeTruthy()
        })
        fireEvent.press(screen.getByText("VIEW ALL"))

        expect(mockNavigate).toHaveBeenCalledWith("UserRankings", { username: "maya" })
    })

    it("Recent Ratings 'View all activity' navigates to UserActivity", async () => {
        render(<OtherProfileScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            expect(screen.getByTestId("recent-ratings-view-all")).toBeTruthy()
        })
        fireEvent.press(screen.getByTestId("recent-ratings-view-all"))

        expect(mockNavigate).toHaveBeenCalledWith("UserActivity", { username: "maya" })
    })

    it("renders Rated and Bookmarked counts when user_stats is present", async () => {
        render(<OtherProfileScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            expect(screen.getByTestId("other-profile-stats")).toBeTruthy()
            expect(screen.getByText("18")).toBeTruthy()
            expect(screen.getByText("3")).toBeTruthy()
        })
    })

    it("tapping Rated on other profile navigates to UserRankings", async () => {
        render(<OtherProfileScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            expect(screen.getByTestId("stats-rated")).toBeTruthy()
        })
        fireEvent.press(screen.getByTestId("stats-rated"))

        expect(mockNavigate).toHaveBeenCalledWith("UserRankings", { username: "maya" })
    })

    it("tapping Bookmarked on other profile navigates to UserBookmarks", async () => {
        render(<OtherProfileScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            expect(screen.getByTestId("stats-bookmarked")).toBeTruthy()
        })
        fireEvent.press(screen.getByTestId("stats-bookmarked"))

        expect(mockNavigate).toHaveBeenCalledWith("UserBookmarks", { username: "maya" })
    })

    it("hides stats row when user_stats is null (private profile)", async () => {
        mockGetProfileByUsername.mockResolvedValue(otherProfilePrivate)

        render(<OtherProfileScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            expect(screen.queryByTestId("other-profile-stats")).toBeNull()
        })
    })

    it("hides taste modules when viewer cannot see taste (privacy/block)", async () => {
        mockGetProfileByUsername.mockResolvedValue(otherProfilePrivate)

        render(<OtherProfileScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            expect(screen.getByText("This profile is private.")).toBeTruthy()
        })
        expect(mockGetUserTasteProfile).not.toHaveBeenCalled()
        expect(mockGetUserAuxstrology).not.toHaveBeenCalled()
    })

    it("does not show the like button on the recent ratings preview", async () => {
        render(<OtherProfileScreen navigation={navigationProp} route={routeProp} />)

        // The recent ratings preview renders, but the like button is omitted on other profiles
        // (you can still like from the full "view all" activity cards).
        await waitFor(() => {
            expect(screen.getByTestId("recent-ratings-view-all")).toBeTruthy()
        })
        expect(screen.queryByTestId("activity-like-button-42")).toBeNull()
    })
})
