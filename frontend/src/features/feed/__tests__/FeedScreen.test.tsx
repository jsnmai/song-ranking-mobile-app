// Tests for Feed screen navigation behavior.
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import { ApiError } from "../../../api/client"
import { RankingResponse } from "../../comparison/types"
import { Profile } from "../../profile/types"
import FeedScreen from "../FeedScreen"
import { FeedEvent, RerateRadarItem } from "../types"

const mockNavigate = jest.fn()
const mockListMyFeed = jest.fn()
const mockGetFeedModules = jest.fn()
const mockReportRatingEvent = jest.fn()
const mockLikeActivity = jest.fn()
const mockUnlikeActivity = jest.fn()
const mockUpdateLikePrivacy = jest.fn()
const mockGetSongCircleRaters = jest.fn()
const mockGetMyRankingByDeezerId = jest.fn()
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

beforeEach(() => {
    jest.resetAllMocks()
    mockCurrentProfile = { ...mockCurrentProfile, hide_like_counts: false, user_stats: null }
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

    it("drops the compact Recent Verdicts teaser from UNLOCKING SOON once the hero is unlocked", async () => {
        // rated < 10 keeps the compact locked section, but with a followed verdict the hero is
        // promoted to the top, so the redundant compact "Recent Verdicts" row is removed and
        // "UNLOCKING SOON" heads only the modules still locked below it.
        mockCurrentProfile = {
            ...mockCurrentProfile,
            user_stats: { rated_count: 3, bookmarked_count: 0 },
        }
        mockListMyFeed.mockResolvedValue({
            events: [feedEvent],
            next_cursor: null,
        })

        render(<FeedScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("feed-recent-verdict-9")).toBeTruthy()
        })
        expect(screen.getByText("UNLOCKING SOON")).toBeTruthy()
        expect(screen.queryByText("Recent Verdicts")).toBeNull()
    })

    it("keeps the locked Recent Verdict only in the compact list while getting started", async () => {
        // rated < 10 and no followed verdict: Recent Verdict is represented solely by the compact
        // "Recent Verdicts" row in UNLOCKING SOON — no duplicate full locked teaser at the top.
        mockCurrentProfile = {
            ...mockCurrentProfile,
            user_stats: { rated_count: 3, bookmarked_count: 0 },
        }
        mockListMyFeed.mockResolvedValue({
            events: [{ ...feedEvent, id: 31, actor_profile: { ...feedEvent.actor_profile, user_id: 2, username: "jason" } }],
            next_cursor: null,
        })

        render(<FeedScreen />)

        await waitFor(() => {
            expect(screen.getByText("UNLOCKING SOON")).toBeTruthy()
        })
        expect(screen.getByText("Recent Verdicts")).toBeTruthy()
        expect(screen.queryByText("FOLLOW TO UNLOCK")).toBeNull()
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

    it("opens hide-like-counts from own feed card options", async () => {
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

        expect(screen.getByTestId("feed-like-privacy-panel-12")).toBeTruthy()
        fireEvent.press(screen.getByTestId("feed-hide-like-counts-12"))

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

    it("surfaces a live Re-rate Radar card with the score delta and opens the song", async () => {
        // The module strip only renders once the viewer has rated 10+ songs.
        mockCurrentProfile = {
            ...mockCurrentProfile,
            user_stats: { rated_count: 12, bookmarked_count: 0 },
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
