// Tests for RecentVerdictsModule, RankingsPreviewModule, and MostCompatibleModule on ProfileScreen and OtherProfileScreen.
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import OtherProfileScreen from "../OtherProfileScreen"
import ProfileScreen from "../ProfileScreen"
import { CompatibilityResponse, MostCompatibleItem, MostCompatibleResponse, Profile, RecentVerdictsResponse, TasteProfileResponse } from "../types"
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
const mockGetMyRecentVerdicts = jest.fn()
const mockGetProfileByUsername = jest.fn()
const mockGetCompatibility = jest.fn()
const mockGetUserTasteProfile = jest.fn()
const mockGetProfileRecentVerdicts = jest.fn()
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

jest.mock("../apiRequests", () => ({
    getMyProfile: (...args: unknown[]) => mockGetMyProfile(...args),
    getMyTasteProfile: (...args: unknown[]) => mockGetMyTasteProfile(...args),
    getMyAuxstrology: (...args: unknown[]) => mockGetMyAuxstrology(...args),
    getMyRecentVerdicts: (...args: unknown[]) => mockGetMyRecentVerdicts(...args),
    getProfileByUsername: (...args: unknown[]) => mockGetProfileByUsername(...args),
    getCompatibility: (...args: unknown[]) => mockGetCompatibility(...args),
    getUserTasteProfile: (...args: unknown[]) => mockGetUserTasteProfile(...args),
    getProfileRecentVerdicts: (...args: unknown[]) => mockGetProfileRecentVerdicts(...args),
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

const mockListMyRankings = jest.fn()

jest.mock("../../rankings/apiRequests", () => ({
    listMyRankings: (...args: unknown[]) => mockListMyRankings(...args),
    getMyRankingAnchors: jest.fn().mockResolvedValue({ top_like: null, median_okay: null, lowest_dislike: null }),
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

const verdictItem = {
    rating_event_id: 42,
    song,
    bucket: "like",
    score: 9.2,
    note: "love the bassline",
    created_at: "2026-05-01T10:00:00Z",
}

const verdictsResponse: RecentVerdictsResponse = { items: [verdictItem] }
const emptyVerdictsResponse: RecentVerdictsResponse = { items: [] }

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
        mockGetMyRecentVerdicts.mockResolvedValue(verdictsResponse)
        mockListMyRankings.mockResolvedValue(rankingsResponse)
        mockGetMostCompatible.mockResolvedValue(mostCompatibleResponse)
        mockGetMyAuxstrology.mockResolvedValue({
            status: "locked", current_ratings: 0, required_ratings: 1,
            sign: null, caption: null, adjectives: [], evidence: [], axes: {},
        })
    })

    it("renders the activity feed on the profile tab", async () => {
        render(<ProfileScreen />)

        await waitFor(() => {
            expect(screen.getByTestId(`activity-card-${verdictItem.rating_event_id}`)).toBeTruthy()
        })
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
            expect(screen.getByText("LIKE")).toBeTruthy()
        })
    })

    it("tapping an activity card navigates to SongDetail", async () => {
        render(<ProfileScreen />)

        await waitFor(() => {
            expect(screen.getByTestId(`activity-card-${verdictItem.rating_event_id}`)).toBeTruthy()
        })
        fireEvent.press(screen.getByTestId(`activity-card-${verdictItem.rating_event_id}`))

        expect(mockNavigate).toHaveBeenCalledWith("SongDetail", expect.anything())
    })

    it("renders no activity when verdicts list is empty", async () => {
        mockGetMyRecentVerdicts.mockResolvedValue(emptyVerdictsResponse)

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
        mockGetProfileRecentVerdicts.mockResolvedValue(verdictsResponse)
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
    })

    it("renders Their Top Songs with View all navigating to UserRankings", async () => {
        render(<OtherProfileScreen navigation={navigationProp} route={routeProp} />)

        await waitFor(() => {
            expect(screen.getByText("THEIR TOP SONGS")).toBeTruthy()
        })
        fireEvent.press(screen.getByText("VIEW ALL →"))

        expect(mockNavigate).toHaveBeenCalledWith("UserRankings", { username: "maya" })
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
})
