// Tests for Feed screen navigation behavior.
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native"
import { Alert, AlertButton } from "react-native"

import { ApiError } from "../../../api/client"
import { RankingResponse } from "../../comparison/types"
import { Profile } from "../../profile/types"
import FeedScreen from "../FeedScreen"
import { ConsensusModule, DisagreementModule, FeedEvent, MatchMomentModule, RerateRadarItem, SplitDecisionModule } from "../types"

jest.mock("react-native-safe-area-context", () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

const mockNavigate = jest.fn()
const mockListMyFeed = jest.fn()
const mockGetFeedModules = jest.fn()
const mockReportRatingEvent = jest.fn()
const mockLikeActivity = jest.fn()
const mockUnlikeActivity = jest.fn()
const mockUpdateLikePrivacy = jest.fn()
const mockGetSongCircleRaters = jest.fn()
const mockGetMyRankingByDeezerId = jest.fn()
const mockRemoveRating = jest.fn()
const mockBlockUser = jest.fn()
const mockRefreshProfile = jest.fn()
let mockCurrentProfile: Profile = {
    id: 1,
    user_id: 2,
    username: "jason",
    display_name: "Jason",
    avatar_color: null,
    timezone: null,
    is_public: true,
    visibility: "public",
    created_at: "2026-01-01T00:00:00Z",
    follower_count: 0,
    following_count: 0,
    is_following: false,
    is_followed_by: false,
    is_own_profile: true,
    can_view_taste: true,
    is_blocked: false,
    hide_like_counts: false,
    user_stats: null,
}

jest.mock("@react-navigation/native", () => {
    const actual = jest.requireActual("@react-navigation/native")
    const React = require("react")

    return {
        ...actual,
        useNavigation: () => ({
            navigate: mockNavigate,
            getParent: jest.fn(() => ({ addListener: jest.fn(() => jest.fn()) })),
        }),
        // useScrollToTop reaches for useRoute()/tab navigator context that the bare
        // render here doesn't provide — stub it; the scroll-to-top wiring isn't under test.
        useScrollToTop: () => {},
        useFocusEffect: (callback: () => void) => {
            React.useEffect(() => {
                callback()
            }, [])
        },
    }
})

jest.mock("@shopify/flash-list", () => {
    const React = require("react")
    const { View } = require("react-native")

    return {
        FlashList: ({ data, renderItem, keyExtractor, ListHeaderComponent }: {
            data: FeedEvent[];
            renderItem: ({ item }: { item: FeedEvent }) => unknown;
            keyExtractor: (item: FeedEvent) => string;
            ListHeaderComponent?: React.ReactElement | null;
        }) => (
            <View>
                {ListHeaderComponent ?? null}
                {data.map((item) => (
                    <View key={keyExtractor(item)}>
                        {renderItem({ item })}
                    </View>
                ))}
            </View>
        ),
    }
})

jest.mock("../../auth/AuthContext", () => ({
    useAuth: () => ({
        token: "test-token",
        profile: mockCurrentProfile,
        refreshProfile: mockRefreshProfile,
    }),
}))

jest.mock("../apiRequests", () => ({
    listMyFeed: (...args: unknown[]) => mockListMyFeed(...args),
    getFeedModules: (...args: unknown[]) => mockGetFeedModules(...args),
    getSongCircleRaters: (...args: unknown[]) => mockGetSongCircleRaters(...args),
    reportRatingEvent: (...args: unknown[]) => mockReportRatingEvent(...args),
}))

jest.mock("../../activity/apiRequests", () => ({
    likeActivity: (...args: unknown[]) => mockLikeActivity(...args),
    unlikeActivity: (...args: unknown[]) => mockUnlikeActivity(...args),
    updateLikePrivacy: (...args: unknown[]) => mockUpdateLikePrivacy(...args),
}))

jest.mock("../../rankings/apiRequests", () => ({
    getMyRankingByDeezerId: (...args: unknown[]) => mockGetMyRankingByDeezerId(...args),
    removeRating: (...args: unknown[]) => mockRemoveRating(...args),
}))

jest.mock("../../profile/apiRequests", () => ({
    blockUser: (...args: unknown[]) => mockBlockUser(...args),
}))

// Plain function — not a jest.fn() — so jest.resetAllMocks() in beforeEach cannot clear it.
jest.mock("../../../utils/formatRelativeTime", () => ({
    formatRelativeTime: () => "3 hrs ago",
}))

const song = {
    id: 42,
    deezer_id: 123,
    isrc: "USUG11900842",
    title: "Nights",
    artist: "Frank Ocean",
    artist_deezer_id: 456,
    album: "Blonde",
    cover_url: "https://example.com/cover.jpg",
    preview_url: "https://example.com/preview.mp3",
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
}

const feedEvent: FeedEvent = {
    id: 9,
    event_type: "rated",
    new_bucket: "like",
    new_score: 8.75,
    note: null,
    like_count: 2,
    liked_by_viewer: false,
    created_at: "2026-01-01T00:00:00Z",
    actor_profile: {
        id: 3,
        user_id: 4,
        username: "maya",
        display_name: "Maya",
        avatar_color: null, timezone: null,
        is_public: true,
        visibility: "public",
        created_at: "2026-01-01T00:00:00Z",
    },
    song,
}

const ranking: RankingResponse = {
    id: 7,
    song_id: 42,
    bucket: "like",
    position: 1,
    score: 9.4,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    song,
}

const emptyModules = {
    rerate_radar: null,
    consensus: null,
    disagreement_spotlight: null,
    split_decision: null,
    match_moment: null,
} as const

const rerateRadarItem: RerateRadarItem = {
    rating_event_id: 55,
    actor_profile: { ...feedEvent.actor_profile },
    song,
    previous_bucket: "alright",
    previous_score: 6.0,
    new_bucket: "like",
    new_score: 8.5,
    note: null,
    created_at: "2026-01-01T00:00:00Z",
}

const consensusModule: ConsensusModule = {
    song,
    average_score: 8.4,
    contributor_count: 5,
    distribution: [0, 0, 0, 0, 0, 0, 0, 0, 3, 2],
}

const disagreementModule: DisagreementModule = {
    song,
    your_score: 9.1,
    friends_average: 4.2,
    friends_count: 4,
    gap: 4.9,
    direction: "viewer_higher",
}

const splitDecisionModule: SplitDecisionModule = {
    song,
    high: { profile: { ...feedEvent.actor_profile, user_id: 4, username: "maya" }, score: 9.1 },
    low: { profile: { ...feedEvent.actor_profile, id: 6, user_id: 7, username: "theo" }, score: 2.3 },
    gap: 6.8,
}

const winnerSong = { ...song, id: 88, deezer_id: 555, title: "Solo" }
const loserSong = { ...song, id: 99, deezer_id: 321, title: "Pyramids" }

const matchMomentModule: MatchMomentModule = {
    actor_profile: { ...feedEvent.actor_profile, user_id: 4, username: "maya" },
    winner: winnerSong,
    loser: loserSong,
    decision_duration_ms: 1200,
    created_at: "2026-01-01T00:00:00Z",
}

// A profile that clears the base module gate (rated >= 10 AND following >= 3).
const gatedProfile = { user_stats: { rated_count: 12, bookmarked_count: 0 }, following_count: 3 }

beforeEach(() => {
    jest.resetAllMocks()
    mockCurrentProfile = { ...mockCurrentProfile, hide_like_counts: false, user_stats: null, following_count: 0 }
    mockGetFeedModules.mockResolvedValue({ ...emptyModules })
    mockGetSongCircleRaters.mockResolvedValue({ raters: [] })
    mockRefreshProfile.mockResolvedValue(undefined)
    mockUpdateLikePrivacy.mockResolvedValue({ ...mockCurrentProfile, hide_like_counts: true })
    mockLikeActivity.mockResolvedValue({
        rating_event_id: 9,
        like_count: 3,
        liked_by_viewer: true,
    })
    mockUnlikeActivity.mockResolvedValue({
        rating_event_id: 9,
        like_count: 1,
        liked_by_viewer: false,
    })
    mockReportRatingEvent.mockResolvedValue({
        id: 1,
        reporter_user_id: 1,
        reported_user_id: 4,
        target_type: "rating_note",
        target_id: 9,
        reason: "spam",
        details: null,
        status: "open",
        created_at: "2026-01-01T00:00:00Z",
    })
})

describe("FeedScreen", () => {
    it("opens feed songs in rated Song Detail when the current user has a ranking", async () => {
        mockListMyFeed.mockResolvedValue({
            events: [feedEvent],
            next_cursor: null,
        })
        mockGetMyRankingByDeezerId.mockResolvedValue(ranking)

        render(<FeedScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("feed-song-9")).toBeTruthy()
        })
        fireEvent.press(screen.getByTestId("feed-song-9"))

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith("SongDetail", { ranking })
        })
    })

    it("features the freshest followed verdict with circle raters and total ratings", async () => {
        // The unlocked module section only renders once the viewer has rated 10+ songs.
        mockCurrentProfile = {
            ...mockCurrentProfile,
            user_stats: { rated_count: 12, bookmarked_count: 0 },
            following_count: 3,
        }
        mockGetSongCircleRaters.mockResolvedValue({
            raters: [{ ...feedEvent.actor_profile, user_id: 4, username: "maya", display_name: "Maya" }],
        })
        mockListMyFeed.mockResolvedValue({
            events: [{
                ...feedEvent,
                note: "Hovers, never lands.",
                song: { ...song, global_rating_count: 12 },
            }],
            next_cursor: null,
        })
        mockGetMyRankingByDeezerId.mockResolvedValue(ranking)

        render(<FeedScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("feed-recent-verdict-9")).toBeTruthy()
        })
        // Top-right shows the song's total LISTn rating count + the circle raters fetch ran.
        await waitFor(() => expect(screen.getByText("12 RATED")).toBeTruthy())
        expect(mockGetSongCircleRaters).toHaveBeenCalledWith(42, "test-token")

        // "Rate this" opens the song page; tapping the hero body scrolls (does not navigate).
        fireEvent.press(screen.getByTestId("feed-verdict-rate-9"))
        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith("SongDetail", { ranking })
        })
        fireEvent.press(screen.getByTestId("feed-verdict-scroll-9"))
        expect(mockNavigate).not.toHaveBeenCalledWith("OtherProfile", expect.anything())
    })

    it("keeps the Recent Verdict module locked when no followed verdict exists", async () => {
        // Only the viewer's own event is present, so there is no friend verdict to feature.
        mockCurrentProfile = {
            ...mockCurrentProfile,
            user_stats: { rated_count: 12, bookmarked_count: 0 },
            following_count: 3,
        }
        mockListMyFeed.mockResolvedValue({
            events: [{ ...feedEvent, id: 21, actor_profile: { ...feedEvent.actor_profile, user_id: 2, username: "jason" } }],
            next_cursor: null,
        })

        render(<FeedScreen />)

        await waitFor(() => {
            expect(screen.getByText("FOLLOW TO UNLOCK")).toBeTruthy()
        })
        expect(screen.queryByTestId("feed-recent-verdict-21")).toBeNull()
    })

    it("shows the Recent Verdict hero with fewer than 10 rated songs", async () => {
        // Recent Verdict is gated only on a followed verdict, never on the viewer's rated count.
        mockCurrentProfile = {
            ...mockCurrentProfile,
            user_stats: { rated_count: 3, bookmarked_count: 0 },
        }
        mockListMyFeed.mockResolvedValue({
            events: [feedEvent],  // a followed user's verdict (actor 4 ≠ viewer 2)
            next_cursor: null,
        })

        render(<FeedScreen />)

        // The live hero renders even though the getting-started (rated < 10) state is still shown.
        await waitFor(() => {
            expect(screen.getByTestId("feed-recent-verdict-9")).toBeTruthy()
        })
        expect(screen.getByText("Getting started")).toBeTruthy()
    })

    it("opens feed songs in unrated Song Detail when the current user has no ranking", async () => {
        mockListMyFeed.mockResolvedValue({
            events: [feedEvent],
            next_cursor: null,
        })
        mockGetMyRankingByDeezerId.mockRejectedValue(new ApiError(404, "Rating not found.", null))

        render(<FeedScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("feed-song-9")).toBeTruthy()
        })
        fireEvent.press(screen.getByTestId("feed-song-9"))

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith("SongDetail", { song })
        })
    })

    it("opens the actor profile when the feed actor row is tapped", async () => {
        mockListMyFeed.mockResolvedValue({
            events: [feedEvent],
            next_cursor: null,
        })

        render(<FeedScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("feed-song-9")).toBeTruthy()
        })
        fireEvent.press(screen.getByTestId("feed-actor-9"))

        expect(mockNavigate).toHaveBeenCalledWith("OtherProfile", { username: "maya" })
        expect(mockGetMyRankingByDeezerId).not.toHaveBeenCalled()
    })

    it("shows a formatted relative timestamp below the actor username for each feed event", async () => {
        mockListMyFeed.mockResolvedValue({
            events: [feedEvent],
            next_cursor: null,
        })

        render(<FeedScreen />)

        // The activity card (and now also the Recent Verdict hero) shows the relative time.
        await waitFor(() => {
            expect(screen.getAllByText(/3 hrs ago/).length).toBeGreaterThan(0)
        })
    })

    it("renders an unliked activity state with the visible count", async () => {
        mockListMyFeed.mockResolvedValue({
            events: [feedEvent],
            next_cursor: null,
        })

        render(<FeedScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("activity-like-button-9").props.accessibilityState.selected).toBe(false)
            expect(screen.getByText("2")).toBeTruthy()
        })
    })

    it("optimistically likes a feed activity and increments the visible count", async () => {
        let resolveLike: (value: unknown) => void = () => {}
        mockLikeActivity.mockReturnValue(new Promise((resolve) => { resolveLike = resolve }))
        mockListMyFeed.mockResolvedValue({
            events: [feedEvent],
            next_cursor: null,
        })

        render(<FeedScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("activity-like-button-9")).toBeTruthy()
        })
        fireEvent.press(screen.getByTestId("activity-like-button-9"))

        expect(screen.getByTestId("activity-like-button-9").props.accessibilityState.selected).toBe(true)
        expect(screen.getByText("3")).toBeTruthy()
        expect(mockLikeActivity).toHaveBeenCalledTimes(1)
        expect(mockLikeActivity).toHaveBeenCalledWith(9, "test-token")

        resolveLike({ rating_event_id: 9, like_count: 3, liked_by_viewer: true })
    })

    it("optimistically unlikes a feed activity and decrements the visible count", async () => {
        let resolveUnlike: (value: unknown) => void = () => {}
        mockUnlikeActivity.mockReturnValue(new Promise((resolve) => { resolveUnlike = resolve }))
        mockListMyFeed.mockResolvedValue({
            events: [{ ...feedEvent, liked_by_viewer: true, like_count: 2 }],
            next_cursor: null,
        })

        render(<FeedScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("activity-like-button-9")).toBeTruthy()
        })
        fireEvent.press(screen.getByTestId("activity-like-button-9"))

        expect(screen.getByTestId("activity-like-button-9").props.accessibilityState.selected).toBe(false)
        expect(screen.getByText("1")).toBeTruthy()
        expect(mockUnlikeActivity).toHaveBeenCalledTimes(1)
        expect(mockUnlikeActivity).toHaveBeenCalledWith(9, "test-token")

        resolveUnlike({ rating_event_id: 9, like_count: 1, liked_by_viewer: false })
    })

    it("rolls back a feed activity like when the API fails", async () => {
        mockLikeActivity.mockRejectedValue(new Error("Nope"))
        mockListMyFeed.mockResolvedValue({
            events: [feedEvent],
            next_cursor: null,
        })

        render(<FeedScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("activity-like-button-9")).toBeTruthy()
        })
        fireEvent.press(screen.getByTestId("activity-like-button-9"))

        await waitFor(() => {
            expect(screen.getByTestId("activity-like-button-9").props.accessibilityState.selected).toBe(false)
            expect(screen.getByText("2")).toBeTruthy()
        })
    })

    it("keeps hidden activity counts hidden while still allowing likes", async () => {
        mockLikeActivity.mockResolvedValue({
            rating_event_id: 9,
            like_count: null,
            liked_by_viewer: true,
        })
        mockListMyFeed.mockResolvedValue({
            events: [{ ...feedEvent, like_count: null }],
            next_cursor: null,
        })

        render(<FeedScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("activity-like-button-9")).toBeTruthy()
        })
        expect(screen.queryByTestId("activity-like-count-9")).toBeNull()

        fireEvent.press(screen.getByTestId("activity-like-button-9"))

        expect(screen.getByTestId("activity-like-button-9").props.accessibilityState.selected).toBe(true)
        expect(screen.queryByTestId("activity-like-count-9")).toBeNull()
        expect(mockNavigate).not.toHaveBeenCalledWith("ActivityLikers", expect.anything())
    })

    it("opens the likers list from a visible feed activity count", async () => {
        mockListMyFeed.mockResolvedValue({
            events: [feedEvent],
            next_cursor: null,
        })

        render(<FeedScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("activity-like-count-9")).toBeTruthy()
        })
        fireEvent.press(screen.getByTestId("activity-like-count-9"))

        expect(mockNavigate).toHaveBeenCalledWith("ActivityLikers", { ratingEventId: 9 })
    })

    it("opens the own-card options sheet with Re-rate / Reorder / Remove / like privacy", async () => {
        const ownEvent: FeedEvent = {
            ...feedEvent,
            id: 12,
            actor_profile: {
                ...feedEvent.actor_profile,
                user_id: 2,
                username: "jason",
                display_name: "Jason",
            },
        }
        mockListMyFeed.mockResolvedValue({
            events: [ownEvent],
            next_cursor: null,
        })

        render(<FeedScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("feed-options-12")).toBeTruthy()
        })
        fireEvent.press(screen.getByTestId("feed-options-12"))

        // The full own-activity action sheet (same as Profile), not just the privacy toggle.
        expect(screen.getByTestId("activity-menu-rerate")).toBeTruthy()
        expect(screen.getByTestId("activity-menu-reorder")).toBeTruthy()
        expect(screen.getByTestId("activity-menu-remove")).toBeTruthy()
        fireEvent.press(screen.getByTestId("activity-menu-like-privacy"))

        await waitFor(() => {
            expect(mockUpdateLikePrivacy).toHaveBeenCalledWith(true, "test-token")
            expect(mockRefreshProfile).toHaveBeenCalled()
        })
    })

    it("renders visible rating notes", async () => {
        mockListMyFeed.mockResolvedValue({
            events: [{ ...feedEvent, note: "It doesn't lift, it hovers." }],
            next_cursor: null,
        })

        render(<FeedScreen />)

        await waitFor(() => {
            // The note shows on the activity card (and on the Recent Verdict hero featuring it).
            expect(screen.getAllByText('"It doesn\'t lift, it hovers."').length).toBeGreaterThan(0)
            expect(screen.getByText("···")).toBeTruthy()
        })
    })

    it("submits report-note reports with reason and details", async () => {
        mockListMyFeed.mockResolvedValue({
            events: [{ ...feedEvent, note: "This note needs review." }],
            next_cursor: null,
        })

        render(<FeedScreen />)

        await waitFor(() => {
            expect(screen.getByText("···")).toBeTruthy()
        })
        fireEvent.press(screen.getByText("···"))
        fireEvent.press(screen.getByTestId("feed-report-option"))
        fireEvent.press(screen.getByText("Spam"))
        fireEvent.changeText(screen.getByPlaceholderText("Add context for review."), "Repeated spam.")
        fireEvent.press(screen.getByText("Submit report"))

        await waitFor(() => {
            expect(mockReportRatingEvent).toHaveBeenCalledWith(
                9,
                {
                    target_type: "rating_note",
                    reason: "spam",
                    details: "Repeated spam.",
                },
                "test-token",
            )
            expect(screen.getByText("Thanks. We'll review this report.")).toBeTruthy()
        })
    })

    it("blocks a user from another card's options, even with no note", async () => {
        mockBlockUser.mockResolvedValue({})
        // Auto-confirm the destructive "Block" button when the confirm Alert fires.
        jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons?: AlertButton[]) => {
            buttons?.find((b) => b.style === "destructive")?.onPress?.()
        })
        const otherEvent: FeedEvent = {
            ...feedEvent,
            id: 31,
            note: null,
            actor_profile: { ...feedEvent.actor_profile, user_id: 7, username: "theo" },
        }
        mockListMyFeed.mockResolvedValue({ events: [otherEvent], next_cursor: null })

        render(<FeedScreen />)
        await waitFor(() => expect(screen.getByTestId("feed-options-31")).toBeTruthy())
        fireEvent.press(screen.getByTestId("feed-options-31"))

        // No note → no Report option, but Block is always available for UGC safety.
        expect(screen.queryByTestId("feed-report-option")).toBeNull()
        // The auto-confirming Alert mock invokes the destructive Block handler synchronously.
        fireEvent.press(screen.getByTestId("feed-block-option"))
        expect(mockBlockUser).toHaveBeenCalledWith("theo", "test-token")
    })

    it("surfaces a live Re-rate Radar card with the score delta and opens the song", async () => {
        // The module strip only renders once the viewer has rated 10+ songs.
        mockCurrentProfile = {
            ...mockCurrentProfile,
            user_stats: { rated_count: 12, bookmarked_count: 0 },
            following_count: 3,
        }
        mockListMyFeed.mockResolvedValue({ events: [feedEvent], next_cursor: null })
        mockGetFeedModules.mockResolvedValue({ ...emptyModules, rerate_radar: rerateRadarItem })
        mockGetMyRankingByDeezerId.mockResolvedValue(ranking)

        render(<FeedScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("feed-rerate-radar-55")).toBeTruthy()
        })
        // The live card replaces the locked placeholder.
        expect(screen.queryByTestId("feed-rerate-radar-locked")).toBeNull()
        // The previous → new delta is shown (6.0 → 8.5, +2.5).
        expect(screen.getByText("8.5")).toBeTruthy()
        expect(screen.getByText("+2.5")).toBeTruthy()

        fireEvent.press(screen.getByTestId("feed-rerate-radar-55"))
        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith("SongDetail", { ranking })
        })
    })

    it("falls back to the locked Re-rate Radar card when there is no qualifying re-rate", async () => {
        mockCurrentProfile = {
            ...mockCurrentProfile,
            user_stats: { rated_count: 12, bookmarked_count: 0 },
            following_count: 3,
        }
        mockListMyFeed.mockResolvedValue({ events: [feedEvent], next_cursor: null })
        mockGetFeedModules.mockResolvedValue({ ...emptyModules })

        render(<FeedScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("feed-song-9")).toBeTruthy()
        })
        // No live card, but the locked placeholder keeps the module slot visible.
        expect(screen.queryByTestId("feed-rerate-radar-55")).toBeNull()
        expect(screen.getByTestId("feed-rerate-radar-locked")).toBeTruthy()
        expect(screen.getByText("When a friend changes a score")).toBeTruthy()
    })

    it("surfaces a live Consensus card with the friend average and count, and opens the song", async () => {
        mockCurrentProfile = {
            ...mockCurrentProfile,
            user_stats: { rated_count: 12, bookmarked_count: 0 },
            following_count: 3,
        }
        mockListMyFeed.mockResolvedValue({ events: [feedEvent], next_cursor: null })
        mockGetFeedModules.mockResolvedValue({ ...emptyModules, consensus: consensusModule })
        mockGetMyRankingByDeezerId.mockResolvedValue(ranking)

        render(<FeedScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("feed-consensus-42")).toBeTruthy()
        })
        expect(screen.queryByTestId("feed-consensus-locked")).toBeNull()
        expect(screen.getByText("8.4")).toBeTruthy()
        // Friend count uses "FRIENDS", never "IN YOUR CIRCLE".
        expect(screen.getByText("5 FRIENDS · AVG")).toBeTruthy()
        expect(screen.queryByText(/IN YOUR CIRCLE/)).toBeNull()

        fireEvent.press(screen.getByTestId("feed-consensus-42"))
        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith("SongDetail", { ranking })
        })
    })

    it("falls back to the locked Consensus card when no song has enough friend raters", async () => {
        mockCurrentProfile = {
            ...mockCurrentProfile,
            user_stats: { rated_count: 12, bookmarked_count: 0 },
            following_count: 3,
        }
        mockListMyFeed.mockResolvedValue({ events: [feedEvent], next_cursor: null })
        mockGetFeedModules.mockResolvedValue({ ...emptyModules })

        render(<FeedScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("feed-song-9")).toBeTruthy()
        })
        expect(screen.queryByTestId("feed-consensus-42")).toBeNull()
        expect(screen.getByTestId("feed-consensus-locked")).toBeTruthy()
    })

    it("surfaces a live Disagreement card (you vs friends) and opens the song", async () => {
        mockCurrentProfile = {
            ...mockCurrentProfile,
            user_stats: { rated_count: 12, bookmarked_count: 0 },
            following_count: 3,
        }
        mockListMyFeed.mockResolvedValue({ events: [feedEvent], next_cursor: null })
        mockGetFeedModules.mockResolvedValue({ ...emptyModules, disagreement_spotlight: disagreementModule })
        mockGetMyRankingByDeezerId.mockResolvedValue(ranking)

        render(<FeedScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("feed-disagreement-42")).toBeTruthy()
        })
        expect(screen.queryByTestId("feed-disagreement-locked")).toBeNull()
        expect(screen.getByText("9.1")).toBeTruthy()          // YOU
        expect(screen.getByText("4.2")).toBeTruthy()          // FRIENDS
        expect(screen.getByText("4.9 APART")).toBeTruthy()
        // Column is "FRIENDS", never "CROWD".
        expect(screen.getByText("FRIENDS")).toBeTruthy()
        expect(screen.queryByText("CROWD")).toBeNull()

        fireEvent.press(screen.getByTestId("feed-disagreement-42"))
        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith("SongDetail", { ranking })
        })
    })

    it("falls back to the locked Disagreement card when no song qualifies", async () => {
        mockCurrentProfile = {
            ...mockCurrentProfile,
            user_stats: { rated_count: 12, bookmarked_count: 0 },
            following_count: 3,
        }
        mockListMyFeed.mockResolvedValue({ events: [feedEvent], next_cursor: null })
        mockGetFeedModules.mockResolvedValue({ ...emptyModules })

        render(<FeedScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("feed-song-9")).toBeTruthy()
        })
        expect(screen.queryByTestId("feed-disagreement-42")).toBeNull()
        expect(screen.getByTestId("feed-disagreement-locked")).toBeTruthy()
    })

    it("surfaces a live Split Decision card (two people you follow) and opens the song", async () => {
        mockCurrentProfile = { ...mockCurrentProfile, ...gatedProfile }
        mockListMyFeed.mockResolvedValue({ events: [feedEvent], next_cursor: null })
        mockGetFeedModules.mockResolvedValue({ ...emptyModules, split_decision: splitDecisionModule })
        mockGetMyRankingByDeezerId.mockResolvedValue(ranking)

        render(<FeedScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("feed-split-42")).toBeTruthy()
        })
        expect(screen.queryByTestId("feed-split-locked")).toBeNull()
        expect(screen.getByText("9.1")).toBeTruthy()           // high score
        expect(screen.getByText("2.3")).toBeTruthy()           // low score
        expect(screen.getByText("Split · 6.8 gap")).toBeTruthy()

        fireEvent.press(screen.getByTestId("feed-split-42"))
        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith("SongDetail", { ranking })
        })
    })

    it("falls back to the locked Split card (people you follow, not friends) when no split qualifies", async () => {
        mockCurrentProfile = { ...mockCurrentProfile, ...gatedProfile }
        mockListMyFeed.mockResolvedValue({ events: [feedEvent], next_cursor: null })
        mockGetFeedModules.mockResolvedValue({ ...emptyModules })

        render(<FeedScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("feed-song-9")).toBeTruthy()
        })
        expect(screen.queryByTestId("feed-split-42")).toBeNull()
        expect(screen.getByTestId("feed-split-locked")).toBeTruthy()
        expect(screen.getByText("When two people you follow split on a song")).toBeTruthy()
    })

    it("surfaces a live Match Moment card (a followed user's head-to-head pick) and opens the winner", async () => {
        mockCurrentProfile = { ...mockCurrentProfile, ...gatedProfile }
        mockListMyFeed.mockResolvedValue({ events: [feedEvent], next_cursor: null })
        mockGetFeedModules.mockResolvedValue({ ...emptyModules, match_moment: matchMomentModule })
        mockGetMyRankingByDeezerId.mockResolvedValue(ranking)

        render(<FeedScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("feed-match-moment-88")).toBeTruthy()
        })
        expect(screen.queryByTestId("feed-match-moment-locked")).toBeNull()
        expect(screen.getByText("Solo")).toBeTruthy()                // winner title
        expect(screen.getByText("over Pyramids")).toBeTruthy()       // loser title
        expect(screen.getByText("@maya · snap pick 1.2s")).toBeTruthy()  // fast decision flourish

        fireEvent.press(screen.getByTestId("feed-match-moment-88"))
        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith("SongDetail", { ranking })
        })
    })

    it("falls back to the locked Match Moment card (people you follow) when no pick qualifies", async () => {
        mockCurrentProfile = { ...mockCurrentProfile, ...gatedProfile }
        mockListMyFeed.mockResolvedValue({ events: [feedEvent], next_cursor: null })
        mockGetFeedModules.mockResolvedValue({ ...emptyModules })

        render(<FeedScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("feed-song-9")).toBeTruthy()
        })
        expect(screen.queryByTestId("feed-match-moment-88")).toBeNull()
        expect(screen.getByTestId("feed-match-moment-locked")).toBeTruthy()
        expect(screen.getByText("Head-to-head picks from people you follow")).toBeTruthy()
    })

    it("keeps the module strip locked and does not fetch modules below the base gate", async () => {
        // Rated 12 but following < 3 → base gate not met: cards locked, no module fetch, banner explains.
        mockCurrentProfile = {
            ...mockCurrentProfile,
            user_stats: { rated_count: 12, bookmarked_count: 0 },
            following_count: 1,
        }
        mockListMyFeed.mockResolvedValue({ events: [feedEvent], next_cursor: null })

        render(<FeedScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("feed-song-9")).toBeTruthy()
        })
        // Below the gate the compact "UNLOCKING SOON" teaser grid shows (not the full cards), the
        // banner explains how to unlock, and we never hit the modules endpoint.
        expect(screen.getByText("UNLOCKING SOON")).toBeTruthy()
        expect(screen.queryByTestId("feed-split-locked")).toBeNull()
        expect(screen.getByText("Rate 5 songs and follow 3 people to unlock the Feed modules below.")).toBeTruthy()
        expect(mockGetFeedModules).not.toHaveBeenCalled()
    })

    it("still reveals the viewer's own scores below the base gate (score reveal is rated-only)", async () => {
        // rated >= 10 but following < 3: modules gated off, but own scores are NOT following-gated.
        const ownEvent: FeedEvent = {
            ...feedEvent,
            id: 77,
            new_score: 8.8,
            actor_profile: { ...feedEvent.actor_profile, user_id: 2, username: "jason" },
        }
        mockCurrentProfile = {
            ...mockCurrentProfile,
            user_stats: { rated_count: 12, bookmarked_count: 0 },
            following_count: 0,
        }
        mockListMyFeed.mockResolvedValue({ events: [ownEvent], next_cursor: null })

        render(<FeedScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("feed-song-77")).toBeTruthy()
        })
        expect(screen.getByText("8.8")).toBeTruthy()   // real score, not "?"
        expect(screen.queryByText("?")).toBeNull()
    })

    it("opens Discover user search from the empty state", async () => {
        mockListMyFeed.mockResolvedValue({
            events: [],
            next_cursor: null,
        })

        render(<FeedScreen />)

        await waitFor(() => {
            expect(screen.getByText("Your feed is empty")).toBeTruthy()
        })
        fireEvent.press(screen.getByText("Connect contacts"))

        expect(mockNavigate).toHaveBeenCalledWith("Discover", {
            screen: "DiscoverHome",
            params: { focusSearch: true, searchMode: "users" },
        })
    })
})
