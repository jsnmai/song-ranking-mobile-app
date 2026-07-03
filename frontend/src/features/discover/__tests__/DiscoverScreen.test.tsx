// Tests for Discover search navigation into Song Detail.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native"
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
const mockGetCircleTrending = jest.fn()
const mockGetCircleMostRated = jest.fn()
const mockGetPopular = jest.fn()
const mockGetNewRelease = jest.fn()
const mockBookmarkSong = jest.fn()
const mockRemoveBookmark = jest.fn()
const mockCreatePlayer = jest.fn()
let mockAuthProfile = {
    // rated_count >= 10 → scores unlocked, so search results show the number.
    user_stats: { rated_count: 50 },
    following_count: 0,
}

jest.mock("react-native-safe-area-context", () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

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
        profile: mockAuthProfile,
    }),
}))

jest.mock("../../search/apiRequests", () => ({
    searchSongs: (...args: unknown[]) => mockSearchSongs(...args),
}))

jest.mock("../../profile/apiRequests", () => ({
    searchProfiles: (...args: unknown[]) => mockSearchProfiles(...args),
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
    getPopular: (...args: unknown[]) => mockGetPopular(...args),
    getNewRelease: (...args: unknown[]) => mockGetNewRelease(...args),
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

const secondCoSignItem = {
    ...coSignItem,
    song: {
        ...ranking.song,
        id: 43,
        deezer_id: 124,
        title: "Pink + White",
    },
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

// Distinct song so its "Open …" label never collides with the circle cards (which use "Nights").
const popularSong = {
    ...ranking.song,
    id: 99,
    deezer_id: 999,
    title: "Redbone",
    artist: "Childish Gambino",
}

const popularItem = {
    song: popularSong,
    rating_count: 128,
}

beforeEach(() => {
    jest.useFakeTimers()
    jest.resetAllMocks()
    mockAuthProfile = { user_stats: { rated_count: 50 }, following_count: 0 }
    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null)
    ;(SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined)
    mockSearchSongs.mockResolvedValue({ results: [song] })
    mockSearchProfiles.mockResolvedValue({ results: [profile] })
    mockListCoSigns.mockResolvedValue({ items: [] })
    mockGetCircleTrending.mockResolvedValue({ items: [], window_days: 7, circle_size: 0 })
    mockGetCircleMostRated.mockResolvedValue({ items: [], circle_size: 0 })
    mockGetPopular.mockResolvedValue({ items: [], window: "all_time", window_days: 7 })
    mockGetNewRelease.mockResolvedValue({ items: [] })
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

        // Default mock is an empty all-time Popular: header stays, label drops "this week",
        // and the honest empty note shows instead of fabricated tiles.
        expect(await screen.findByText("POPULAR ON LISTN")).toBeTruthy()
        expect(screen.getByText("Nothing here yet. Rate a song to get it going.")).toBeTruthy()
        expect(screen.getByText("PEOPLE YOU FOLLOW RATED 9+")).toBeTruthy()
        expect(screen.getByTestId("co-sign-lock-cue")).toBeTruthy()
        expect(screen.queryByTestId("co-sign-quiet-cue")).toBeNull()
        expect(screen.getByText("No lists yet")).toBeTruthy()
    })

    it("shows a sleepy Co-Sign cue when enough followed people have no qualifying 9+ activity", async () => {
        mockAuthProfile = { user_stats: { rated_count: 50 }, following_count: 2 }
        render(<DiscoverScreen />)

        expect(await screen.findByText("PEOPLE YOU FOLLOW RATED 9+")).toBeTruthy()
        expect(screen.getByTestId("co-sign-quiet-cue")).toBeTruthy()
        expect(screen.getByTestId("quiet-moon-icon")).toBeTruthy()
        expect(screen.queryByTestId("co-sign-lock-cue")).toBeNull()

        jest.useFakeTimers()
        try {
            fireEvent.press(screen.getByTestId("co-sign-quiet-cue"))

            expect(within(screen.getByTestId("discover-quiet-toast")).getByText("It’s Quiet For Now")).toBeTruthy()

            act(() => {
                jest.advanceTimersByTime(1200)
            })
            expect(screen.queryByTestId("discover-quiet-toast")).toBeNull()
        } finally {
            jest.useRealTimers()
        }
    })

    it("renders Popular this-week tiles and opens song detail", async () => {
        mockGetPopular.mockResolvedValue({ items: [popularItem], window: "week", window_days: 7 })
        render(<DiscoverScreen />)

        expect(await screen.findByText("POPULAR ON LISTN · THIS WEEK")).toBeTruthy()
        expect(screen.getByText("CHILDISH GAMBINO")).toBeTruthy()
        // First tap arms the tile's View confirmation; tapping VIEW navigates.
        fireEvent.press(await screen.findByLabelText("Preview Redbone"))
        fireEvent.press(await screen.findByLabelText("View Redbone"))
        expect(mockNavigate).toHaveBeenCalledWith("SongDetail", { song: popularSong })
    })

    it("dismisses a Popular view confirmation when Discover starts scrolling", async () => {
        mockGetPopular.mockResolvedValue({ items: [popularItem], window: "week", window_days: 7 })
        render(<DiscoverScreen />)

        fireEvent.press(await screen.findByLabelText("Preview Redbone"))
        expect(screen.getByLabelText("View Redbone")).toBeTruthy()

        fireEvent(screen.getByTestId("discover-scroll"), "scrollBeginDrag")

        expect(screen.queryByLabelText("View Redbone")).toBeNull()
        expect(screen.getByLabelText("Preview Redbone")).toBeTruthy()
    })

    it("renders the New Release daily pick and wires open plus rate", async () => {
        mockGetNewRelease.mockResolvedValue({
            items: [{ song: popularSong, released_at: "2026-06-28" }],
        })
        render(<DiscoverScreen />)

        expect(await screen.findByTestId("new-release-card")).toBeTruthy()
        fireEvent.press(screen.getByLabelText("Rate Redbone"))
        expect(mockNavigate).toHaveBeenCalledWith("BucketSelection", { song: popularSong })
        fireEvent.press(screen.getByLabelText("Open Redbone"))
        expect(mockNavigate).toHaveBeenCalledWith("SongDetail", { song: popularSong })
    })

    it("keeps the New Release placeholder when the feed is empty", async () => {
        render(<DiscoverScreen />)

        expect(await screen.findByTestId("new-release-card-placeholder")).toBeTruthy()
        expect(screen.getByText("This week's fresh drops will land here.")).toBeTruthy()
    })

    it("relabels Popular to all-time when the week is too thin", async () => {
        mockGetPopular.mockResolvedValue({ items: [popularItem], window: "all_time", window_days: 7 })
        render(<DiscoverScreen />)

        expect(await screen.findByText("POPULAR ON LISTN")).toBeTruthy()
        expect(screen.getByText("Redbone")).toBeTruthy()
        expect(screen.queryByText("POPULAR ON LISTN · THIS WEEK")).toBeNull()
    })

    it("renders social discovery cards and opens song detail", async () => {
        mockListCoSigns.mockResolvedValue({ items: [coSignItem] })
        render(<DiscoverScreen />)

        fireEvent.press(await screen.findByLabelText("Open Nights"))

        expect(screen.getByText("people you follow gave 9+")).toBeTruthy()
        expect(mockNavigate).toHaveBeenCalledWith("SongDetail", { song: ranking.song })
    })

    it("renders co-sign recommendations as a swipeable one-card carousel", async () => {
        mockListCoSigns.mockResolvedValue({ items: [coSignItem, secondCoSignItem] })
        render(<DiscoverScreen />)

        expect(await screen.findByText("Nights")).toBeTruthy()
        expect(screen.getByText("Pink + White")).toBeTruthy()
        expect(screen.getByText("1/2")).toBeTruthy()

        fireEvent(screen.getByTestId("co-sign-carousel"), "momentumScrollEnd", {
            nativeEvent: { contentOffset: { x: 1000 } },
        })

        expect(screen.getByText("2/2")).toBeTruthy()
    })

    it("renders co-sign card with followed-people count pill and avg score", async () => {
        mockListCoSigns.mockResolvedValue({ items: [coSignItem] })
        render(<DiscoverScreen />)

        expect(await screen.findByText("Co-sign · 2 people")).toBeTruthy()
        expect(screen.getByText("people you follow gave 9+")).toBeTruthy()
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
        mockGetCircleTrending.mockResolvedValue({ items: [trendingItem], window_days: 7, circle_size: 4 })
        render(<DiscoverScreen />)

        expect(await screen.findByText("THIS WEEK")).toBeTruthy()
        // Most-rated had no items, so its locked state remains.
        expect(screen.getByText("IN CIRCLE")).toBeTruthy()

        fireEvent.press(screen.getByLabelText("Open Nights"))
        expect(mockNavigate).toHaveBeenCalledWith("SongDetail", { song: ranking.song })
    })

    it("renders the live Most-rated card with the circle rating count, song, and artist", async () => {
        mockGetCircleMostRated.mockResolvedValue({ items: [mostRatedItem], circle_size: 4 })
        render(<DiscoverScreen />)

        expect(await screen.findByText("IN CIRCLE")).toBeTruthy()
        expect(screen.getByText("12")).toBeTruthy()
        // "FRANK OCEAN" also appears in the Popular on LISTn placeholders, so scope to the Most-rated card.
        expect(within(screen.getByLabelText("Open Nights")).getByText("FRANK OCEAN")).toBeTruthy()
        // Trending had no items, so its locked state remains.
        expect(screen.getByText("Locked")).toBeTruthy()
    })

    it("keeps both circle cards locked when there is no circle data", async () => {
        render(<DiscoverScreen />)

        expect(await screen.findByText("Locked")).toBeTruthy()
        expect(screen.getByText("IN CIRCLE")).toBeTruthy()
    })

    it("counts mutual circle members, not one-way follows, in the locked Trending counter", async () => {
        // The viewer follows people who don't follow back (circle_size 0) even though they
        // may follow many one-way. The counter must read 0/3, never a misleading 3/3.
        mockGetCircleTrending.mockResolvedValue({ items: [], window_days: 7, circle_size: 0 })
        render(<DiscoverScreen />)

        expect(await screen.findByText("0/3")).toBeTruthy()
        expect(screen.getByText("Locked")).toBeTruthy()
    })

    it("shows the Warming up state when the circle is big enough but has nothing trending", async () => {
        // 3 visible mutual members but no shared song this week: this is NOT locked on a user
        // action, so it drops the lock/counter and explains it will fill in.
        mockGetCircleTrending.mockResolvedValue({ items: [], window_days: 7, circle_size: 3 })
        render(<DiscoverScreen />)

        expect(await screen.findByText("Warming up")).toBeTruthy()
        // No lock copy and no X/3 counter in this state.
        expect(screen.queryByText("Locked")).toBeNull()
        expect(screen.queryByText("3/3")).toBeNull()
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

    it("shows the Find-your-people card on the People tab, hides it while typing, and dismisses it per visit", async () => {
        render(<DiscoverScreen />)

        // Songs tab (default): the friends nudge is a People-tab thing, so it's absent.
        fireEvent(screen.getByPlaceholderText("Search songs or people…"), "focus")
        expect(screen.queryByText("Find your people")).toBeNull()

        // People tab, empty query: the card appears with both deferred actions.
        fireEvent.press(screen.getByText("People"))
        expect(screen.getByText("Find your people")).toBeTruthy()
        expect(screen.getByText("Connect contacts")).toBeTruthy()
        expect(screen.getByText("Invite")).toBeTruthy()

        // It's a resting-state nudge — typing a query replaces it with results.
        fireEvent.changeText(screen.getByPlaceholderText("Search songs or people…"), "jason")
        act(() => {
            jest.advanceTimersByTime(350)
        })
        expect(screen.queryByText("Find your people")).toBeNull()

        // Clearing the query brings it back, and the ✕ dismisses it for this visit.
        fireEvent.changeText(screen.getByPlaceholderText("Search songs or people…"), "")
        expect(screen.getByText("Find your people")).toBeTruthy()
        fireEvent.press(screen.getByText("✕"))
        expect(screen.queryByText("Find your people")).toBeNull()

        // The dismiss is per-visit: leaving search and reopening it offers the card again.
        fireEvent.press(screen.getByText("Cancel"))
        fireEvent(screen.getByPlaceholderText("Search songs or people…"), "focus")
        expect(screen.getByText("Find your people")).toBeTruthy()
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
