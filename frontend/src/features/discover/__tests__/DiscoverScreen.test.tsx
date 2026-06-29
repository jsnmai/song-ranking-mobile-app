// Tests for Discover search navigation into Song Detail.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native"
import * as SecureStore from "expo-secure-store"

import { ApiError } from "../../../api/client"
import DiscoverScreen from "../DiscoverScreen"

const mockNavigate = jest.fn()
const mockSetParams = jest.fn()
const mockSearchSongs = jest.fn()
const mockSearchProfiles = jest.fn()
const mockFollowUser = jest.fn()
const mockUnfollowUser = jest.fn()
const mockGetMyRankingByDeezerId = jest.fn()
const mockListCoSigns = jest.fn()
const mockGetMostCompatible = jest.fn()
const mockGetCircleTrending = jest.fn()
const mockGetCircleMostRated = jest.fn()
const mockBookmarkSong = jest.fn()
const mockRemoveBookmark = jest.fn()
const mockCreatePlayer = jest.fn()

jest.mock("expo-audio", () => ({
    createAudioPlayer: (...args: unknown[]) => mockCreatePlayer(...args),
    setAudioModeAsync: jest.fn(),
}))

jest.mock("expo-secure-store", () => ({
    getItemAsync: jest.fn(),
    setItemAsync: jest.fn(),
}))

jest.mock("@react-navigation/native", () => {
    const React = jest.requireActual("react")
    return {
        useNavigation: () => ({
            navigate: mockNavigate,
            setParams: mockSetParams,
            addListener: jest.fn(() => jest.fn()),
            isFocused: jest.fn(() => true),
            getParent: jest.fn(() => ({ addListener: jest.fn(() => jest.fn()) })),
        }),
        useRoute: () => ({
            params: undefined,
        }),
        // Run the focus callback like a focused screen (once per stable callback)
        // so focus-driven data loads execute under test without re-render loops.
        useFocusEffect: (cb: () => void) => React.useEffect(cb, [cb]),
    }
})

jest.mock("../../auth/AuthContext", () => ({
    useAuth: () => ({
        token: "test-token",
        // rated_count >= 10 → scores unlocked, so search results show the number.
        profile: { user_stats: { rated_count: 50 } },
    }),
}))

jest.mock("../../search/apiRequests", () => ({
    searchSongs: (...args: unknown[]) => mockSearchSongs(...args),
}))

jest.mock("../../profile/apiRequests", () => ({
    searchProfiles: (...args: unknown[]) => mockSearchProfiles(...args),
    getMostCompatible: (...args: unknown[]) => mockGetMostCompatible(...args),
    followUser: (...args: unknown[]) => mockFollowUser(...args),
    unfollowUser: (...args: unknown[]) => mockUnfollowUser(...args),
}))

jest.mock("../../rankings/apiRequests", () => ({
    getMyRankingByDeezerId: (...args: unknown[]) => mockGetMyRankingByDeezerId(...args),
}))

jest.mock("../apiRequests", () => ({
    listCoSigns: (...args: unknown[]) => mockListCoSigns(...args),
    getCircleTrending: (...args: unknown[]) => mockGetCircleTrending(...args),
    getCircleMostRated: (...args: unknown[]) => mockGetCircleMostRated(...args),
}))

jest.mock("../../bookmarks/apiRequests", () => ({
    bookmarkSong: (...args: unknown[]) => mockBookmarkSong(...args),
    removeBookmark: (...args: unknown[]) => mockRemoveBookmark(...args),
}))

const song = {
    deezer_id: 123,
    isrc: "USUG11900842",
    title: "Nights",
    artist: "Frank Ocean",
    artist_deezer_id: 456,
    album: "Blonde",
    cover_url: "https://example.com/cover.jpg",
    preview_url: "https://example.com/preview.mp3",
}

const ranking = {
    id: 7,
    song_id: 42,
    bucket: "like",
    position: 1,
    score: 9.4,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    song: {
        ...song,
        id: 42,
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

const profile = {
    id: 3,
    user_id: 4,
    username: "jasonmai",
    display_name: "Jason Mai",
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
}

const coSignItem = {
    song: ranking.song,
    co_sign_count: 2,
    average_visible_friend_score: 9.6,
    latest_visible_rating_at: "2026-01-02T00:00:00Z",
    contributors: [
        { user_id: 3, username: "maya", display_name: "Maya", score: 9.7 },
        { user_id: 4, username: "leo", display_name: "Leo", score: 9.5 },
    ],
    is_bookmarked: false,
}

const trendingItem = {
    song: ranking.song,
    recent_circle_rating_count: 5,
    average_circle_score: 8.4,
    contributors: [],
    viewer_rating: { score: 9.0, bucket: "like" },
    latest_circle_rating_at: "2026-01-02T00:00:00Z",
}

const mostRatedItem = {
    song: ranking.song,
    circle_rating_count: 12,
    average_circle_score: 7.8,
    contributors: [],
    viewer_rating: null,
    latest_circle_rating_at: "2026-01-02T00:00:00Z",
}

beforeEach(() => {
    jest.useFakeTimers()
    jest.resetAllMocks()
    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null)
    ;(SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined)
    mockSearchSongs.mockResolvedValue({ results: [song] })
    mockSearchProfiles.mockResolvedValue({ results: [profile] })
    mockListCoSigns.mockResolvedValue({ items: [] })
    mockGetMostCompatible.mockResolvedValue({ users: [] })
    mockGetCircleTrending.mockResolvedValue({ items: [], window_days: 7 })
    mockGetCircleMostRated.mockResolvedValue({ items: [] })
    mockBookmarkSong.mockResolvedValue({ id: 9 })
    mockRemoveBookmark.mockResolvedValue({ song_id: 42, removed: true })
    mockCreatePlayer.mockReturnValue({
        play: jest.fn(),
        pause: jest.fn(),
        remove: jest.fn(),
        addListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
    })
})

afterEach(() => {
    jest.useRealTimers()
})

describe("DiscoverScreen", () => {
    it("shows new-user discovery state when no co-signs exist", async () => {
        render(<DiscoverScreen />)

        expect(await screen.findByText("No lists yet")).toBeTruthy()
    })

    it("renders social discovery cards and opens song detail", async () => {
        mockListCoSigns.mockResolvedValue({ items: [coSignItem] })
        render(<DiscoverScreen />)

        fireEvent.press(await screen.findByLabelText("Open Nights"))

        expect(screen.getByText("everyone gave it 9+")).toBeTruthy()
        expect(mockNavigate).toHaveBeenCalledWith("SongDetail", { song: ranking.song })
    })

    it("renders co-sign card with friend count pill and avg score", async () => {
        mockListCoSigns.mockResolvedValue({ items: [coSignItem] })
        render(<DiscoverScreen />)

        expect(await screen.findByText("Co-sign · 2 friends")).toBeTruthy()
        expect(screen.getByText("everyone gave it 9+")).toBeTruthy()
    })

    it("opens unrated search results in Song Detail", async () => {
        mockGetMyRankingByDeezerId.mockRejectedValue(new ApiError(404, "Rating not found.", null))
        render(<DiscoverScreen />)

        fireEvent(screen.getByPlaceholderText("Search songs or people…"), "focus")
        fireEvent.changeText(screen.getByPlaceholderText("Search songs or people…"), "nights")
        act(() => {
            jest.advanceTimersByTime(350)
        })

        const result = await screen.findByText("Nights")
        fireEvent.press(result)

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith("SongDetail", { song })
        })
    })

    it("opens already-rated search results in Song Detail (resolved there)", async () => {
        const ratedSong = { ...song, my_bucket: "like", my_score: 9.4 }
        mockSearchSongs.mockResolvedValue({ results: [ratedSong] })
        render(<DiscoverScreen />)

        fireEvent(screen.getByPlaceholderText("Search songs or people…"), "focus")
        fireEvent.changeText(screen.getByPlaceholderText("Search songs or people…"), "nights")
        act(() => {
            jest.advanceTimersByTime(350)
        })

        const result = await screen.findByText("Nights")
        fireEvent.press(result)

        // Navigation is instant with the song; Song Detail resolves the viewer's ranking and offers
        // re-rate, so Discover no longer blocks on the lookup.
        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith("SongDetail", { song: ratedSong })
        })
        expect(mockGetMyRankingByDeezerId).not.toHaveBeenCalled()
    })

    it("renders the live Trending card from the top circle song and opens it", async () => {
        mockGetCircleTrending.mockResolvedValue({ items: [trendingItem], window_days: 7 })
        render(<DiscoverScreen />)

        expect(await screen.findByText("THIS WEEK")).toBeTruthy()
        // Most-rated had no items, so its locked state remains.
        expect(screen.getByText("TOTAL RATINGS")).toBeTruthy()

        fireEvent.press(screen.getByLabelText("Open Nights"))
        expect(mockNavigate).toHaveBeenCalledWith("SongDetail", { song: ranking.song })
    })

    it("renders the live Most-rated card with the circle rating count, song, and artist", async () => {
        mockGetCircleMostRated.mockResolvedValue({ items: [mostRatedItem] })
        render(<DiscoverScreen />)

        expect(await screen.findByText("TOTAL RATINGS")).toBeTruthy()
        expect(screen.getByText("12")).toBeTruthy()
        expect(screen.getByText("FRANK OCEAN")).toBeTruthy()
        // Trending had no items, so its locked state remains.
        expect(screen.getByText("Locked for now")).toBeTruthy()
    })

    it("keeps both circle cards locked when there is no circle data", async () => {
        render(<DiscoverScreen />)

        expect(await screen.findByText("Locked for now")).toBeTruthy()
        expect(screen.getByText("TOTAL RATINGS")).toBeTruthy()
    })

    it("switches to user search and opens another user's profile", async () => {
        render(<DiscoverScreen />)

        fireEvent(screen.getByPlaceholderText("Search songs or people…"), "focus")
        fireEvent.press(screen.getByText("People"))
        fireEvent.changeText(screen.getByPlaceholderText("Search songs or people…"), "jason")
        act(() => {
            jest.advanceTimersByTime(350)
        })

        const result = await screen.findByText("Jason Mai")
        fireEvent.press(result)

        expect(mockSearchProfiles).toHaveBeenCalledWith("jason", "test-token")
        expect(mockNavigate).toHaveBeenCalledWith("OtherProfile", { username: "jasonmai" })
    })

    it("shows a rated state for already-rated song results and a Rate pill otherwise", async () => {
        mockSearchSongs.mockResolvedValue({
            results: [
                { ...song, my_bucket: "like", my_score: 9.4 },
                { ...song, deezer_id: 456, title: "Pink + White", my_bucket: null, my_score: null },
            ],
        })
        render(<DiscoverScreen />)

        fireEvent(screen.getByPlaceholderText("Search songs or people…"), "focus")
        fireEvent.changeText(screen.getByPlaceholderText("Search songs or people…"), "nights")
        act(() => {
            jest.advanceTimersByTime(350)
        })

        expect(await screen.findByText("RATED")).toBeTruthy()
        expect(screen.getByText("9.4")).toBeTruthy()

        // The Rate pill skips Song Detail and goes straight into the rating flow.
        fireEvent.press(screen.getByText("Rate"))
        expect(mockNavigate).toHaveBeenCalledWith("BucketSelection", {
            song: { ...song, deezer_id: 456, title: "Pink + White", my_bucket: null, my_score: null },
        })
    })

    it("shows taste match and follows-you note on people results and follows from the row", async () => {
        mockSearchProfiles.mockResolvedValue({
            results: [{ ...profile, similarity_score: 0.87, is_followed_by: true }],
        })
        mockFollowUser.mockResolvedValue({ ...profile, is_following: true, is_followed_by: true })
        render(<DiscoverScreen />)

        fireEvent(screen.getByPlaceholderText("Search songs or people…"), "focus")
        fireEvent.press(screen.getByText("People"))
        fireEvent.changeText(screen.getByPlaceholderText("Search songs or people…"), "jason")
        act(() => {
            jest.advanceTimersByTime(350)
        })

        expect(await screen.findByText(/87% MATCH/)).toBeTruthy()
        expect(screen.getByText(/FOLLOWS YOU/)).toBeTruthy()

        fireEvent.press(screen.getByText("Follow"))
        await waitFor(() => {
            expect(mockFollowUser).toHaveBeenCalledWith("jasonmai", "test-token")
            expect(screen.getByText("Following")).toBeTruthy()
        })
    })
})
