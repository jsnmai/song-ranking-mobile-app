// Tests for Song Detail audio preview and remove-rating behavior.
import { Alert, AlertButton } from "react-native"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import SongDetailScreen from "../SongDetailScreen"
import { RankingResponse } from "../../comparison/types"

const mockGoBack = jest.fn()
const mockNavigate = jest.fn()
const mockRemoveRating = jest.fn()
const mockListMyVersusHistory = jest.fn()
const mockFetchPreviewUrl = jest.fn()
const mockFetchPreviewUrlBySongId = jest.fn()
const mockGetBookmarkStatus = jest.fn()
const mockGetBookmarkStatusBySongId = jest.fn()
const mockRemoveBookmark = jest.fn()
const mockBookmarkSong = jest.fn()

const mockPlay = jest.fn()
const mockRemove = jest.fn()
const mockCreatePlayer = jest.fn()
const mockAddNavigationListener = jest.fn()

jest.mock("expo-audio", () => ({
    createAudioPlayer: (...args: unknown[]) => mockCreatePlayer(...args),
    setAudioModeAsync: jest.fn(),
}))

// Mutable so individual tests can drop below the 10-rating threshold to exercise the locked state.
let mockRatedCount = 50
jest.mock("../../auth/AuthContext", () => ({
    useAuth: () => ({
        token: "test-token",
        profile: { user_stats: { rated_count: mockRatedCount } },
    }),
}))

jest.mock("../../rankings/apiRequests", () => ({
    removeRating: (...args: unknown[]) => mockRemoveRating(...args),
    listMyVersusHistory: (...args: unknown[]) => mockListMyVersusHistory(...args),
}))

jest.mock("../../songs/apiRequests", () => ({
    fetchPreviewUrl: (...args: unknown[]) => mockFetchPreviewUrl(...args),
    fetchPreviewUrlBySongId: (...args: unknown[]) => mockFetchPreviewUrlBySongId(...args),
}))

jest.mock("../../bookmarks/apiRequests", () => ({
    getBookmarkStatus: (...args: unknown[]) => mockGetBookmarkStatus(...args),
    getBookmarkStatusBySongId: (...args: unknown[]) => mockGetBookmarkStatusBySongId(...args),
    removeBookmark: (...args: unknown[]) => mockRemoveBookmark(...args),
    bookmarkSong: (...args: unknown[]) => mockBookmarkSong(...args),
}))

const ranking: RankingResponse = {
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
    },
}

const navigation = {
    goBack: mockGoBack,
    navigate: mockNavigate,
    addListener: mockAddNavigationListener,
}

const route = {
    params: {
        ranking,
    },
}

beforeEach(() => {
    jest.resetAllMocks()
    mockRatedCount = 50
    mockCreatePlayer.mockReturnValue({
        play: mockPlay,
        pause: jest.fn(),
        remove: mockRemove,
        addListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
    })
    mockAddNavigationListener.mockReturnValue(jest.fn())
    mockFetchPreviewUrl.mockResolvedValue("https://example.com/preview.mp3")
    mockFetchPreviewUrlBySongId.mockResolvedValue({
        preview_url: "https://example.com/apple-live-preview.m4a",
        apple_view_url: "https://music.apple.com/us/album/nights/1440841363?i=1440841363",
        provider: "apple",
    })
    mockGetBookmarkStatus.mockResolvedValue({ is_bookmarked: false, bookmark: null })
    mockGetBookmarkStatusBySongId.mockResolvedValue({ is_bookmarked: false, bookmark: null })
    mockListMyVersusHistory.mockResolvedValue({ receipts: [] })
})

describe("SongDetailScreen", () => {
    it("opens Reorder from the actions menu once scores are unlocked", async () => {
        render(<SongDetailScreen navigation={navigation as never} route={route as never} />)
        await act(async () => {})

        fireEvent.press(screen.getByLabelText("More actions"))
        fireEvent.press(screen.getByText("Reorder"))

        expect(mockNavigate).toHaveBeenCalledWith("Reorder")
    })

    it("locks Reorder until 10 songs are rated, but keeps Re-rate available", async () => {
        mockRatedCount = 4 // below the unlock threshold

        render(<SongDetailScreen navigation={navigation as never} route={route as never} />)
        await act(async () => {})

        fireEvent.press(screen.getByLabelText("More actions"))

        // "Reorder" is shown as LOCKED and does not navigate to Reorder.
        expect(screen.getByText("LOCKED")).toBeTruthy()
        fireEvent.press(screen.getByText("Reorder"))
        expect(mockNavigate).not.toHaveBeenCalledWith("Reorder")

        // Re-rate stays available (the sheet item is the last "Re-rate" in the tree).
        const reRate = screen.getAllByText("Re-rate")
        fireEvent.press(reRate[reRate.length - 1])
        expect(mockNavigate).toHaveBeenCalledWith("BucketSelection", expect.anything())
    })

    it("confirms before removing a rating, then returns to Rankings", async () => {
        const alertSpy = jest.spyOn(Alert, "alert")
        mockRemoveRating.mockResolvedValue({ rating_event: { event_type: "removed" } })

        render(<SongDetailScreen navigation={navigation as never} route={route as never} />)
        await act(async () => {})

        fireEvent.press(screen.getByLabelText("More actions"))
        fireEvent.press(screen.getByText("Remove rating"))

        expect(alertSpy).toHaveBeenCalledWith(
            "Remove this song from your rankings? This cannot be undone.",
            undefined,
            expect.any(Array),
        )

        const buttons = alertSpy.mock.calls[0][2] as AlertButton[]
        await act(async () => {
            buttons[1].onPress?.()
        })

        await waitFor(() => {
            expect(mockRemoveRating).toHaveBeenCalledWith(42, "test-token")
        })
        expect(mockNavigate).toHaveBeenCalledWith("MainTabs", { screen: "Rankings" })
    })

    it("returns to All Rankings after removing when opened from there", async () => {
        const alertSpy = jest.spyOn(Alert, "alert")
        mockRemoveRating.mockResolvedValue({ rating_event: { event_type: "removed" } })
        const fromAllRankings = { params: { ranking, origin: "FullRankings" } }

        render(<SongDetailScreen navigation={navigation as never} route={fromAllRankings as never} />)
        await act(async () => {})

        fireEvent.press(screen.getByLabelText("More actions"))
        fireEvent.press(screen.getByText("Remove rating"))
        const buttons = alertSpy.mock.calls[0][2] as AlertButton[]
        await act(async () => {
            buttons[1].onPress?.()
        })

        await waitFor(() => {
            expect(mockRemoveRating).toHaveBeenCalledWith(42, "test-token")
        })
        // Goes back to All Rankings (which refetches on focus), not the Rankings tab.
        expect(mockGoBack).toHaveBeenCalled()
        expect(mockNavigate).not.toHaveBeenCalledWith("MainTabs", { screen: "Rankings" })
    })

    it("does nothing when the remove confirmation is canceled", async () => {
        const alertSpy = jest.spyOn(Alert, "alert")

        render(<SongDetailScreen navigation={navigation as never} route={route as never} />)
        await act(async () => {})

        fireEvent.press(screen.getByLabelText("More actions"))
        fireEvent.press(screen.getByText("Remove rating"))
        const buttons = alertSpy.mock.calls[0][2] as AlertButton[]
        buttons[0].onPress?.()

        expect(mockRemoveRating).not.toHaveBeenCalled()
        expect(mockNavigate).not.toHaveBeenCalled()
    })

    it("shows Play Preview button when fetchPreviewUrl returns a URL", async () => {
        render(<SongDetailScreen navigation={navigation as never} route={route as never} />)
        // findByLabelText waits until the element appears — handles the async fetch naturally.
        expect(await screen.findByLabelText("Play Preview")).toBeTruthy()
    })

    it("creates a player and immediately shows Pause Preview when pressed", async () => {
        render(<SongDetailScreen navigation={navigation as never} route={route as never} />)

        // Wait for the async fetchPreviewUrl to finish before the button appears.
        const playButton = await screen.findByLabelText("Play Preview")
        act(() => {
            fireEvent.press(playButton)
        })

        expect(mockCreatePlayer).toHaveBeenCalledWith("https://example.com/preview.mp3")
        expect(mockPlay).toHaveBeenCalledTimes(1)
        expect(screen.getByLabelText("Pause Preview")).toBeTruthy()
    })

    it("shows saved Apple Play from preview availability and fetches by song id only when pressed", async () => {
        const appleRanking: RankingResponse = {
            ...ranking,
            song: {
                ...ranking.song,
                deezer_id: null,
                provider: "apple",
                preview_url: null,
                preview_available: true,
                apple_view_url: null,
            },
        }

        render(
            <SongDetailScreen
                navigation={navigation as never}
                route={{ params: { ranking: appleRanking } } as never}
            />,
        )

        const playButton = await screen.findByLabelText("Play Preview")
        expect(mockFetchPreviewUrlBySongId).not.toHaveBeenCalled()

        await act(async () => {
            fireEvent.press(playButton)
        })

        await waitFor(() => {
            expect(mockFetchPreviewUrlBySongId).toHaveBeenCalledWith(42, "test-token")
        })
        await waitFor(() => {
            expect(mockCreatePlayer).toHaveBeenCalledWith("https://example.com/apple-live-preview.m4a")
        })
        expect(screen.getByText("Provided courtesy of iTunes")).toBeTruthy()
        expect(screen.getByText("Get on Apple Music")).toBeTruthy()
    })

    it("keeps iTunes attribution hidden until the preview is first played", async () => {
        const appleSearchSong = {
            ...ranking.song,
            deezer_id: null,
            provider: "apple" as const,
            preview_url: "https://example.com/apple-search-preview.m4a",
            preview_available: true,
            apple_view_url: "https://music.apple.com/us/album/nights/1440841363?i=1440841363",
        }

        render(
            <SongDetailScreen
                navigation={navigation as never}
                route={{ params: { song: appleSearchSong } } as never}
            />,
        )

        const playButton = await screen.findByLabelText("Play Preview")
        // Idle screen stays uncluttered — no Apple content has rendered yet.
        expect(screen.queryByText("Provided courtesy of iTunes")).toBeNull()

        await act(async () => {
            fireEvent.press(playButton)
        })

        expect(await screen.findByText("Provided courtesy of iTunes")).toBeTruthy()
        expect(screen.getByText("Get on Apple Music")).toBeTruthy()
    })

    it("renders iTunes attribution even when the Apple store link is missing", async () => {
        const appleRanking: RankingResponse = {
            ...ranking,
            song: {
                ...ranking.song,
                deezer_id: null,
                provider: "apple",
                preview_url: null,
                preview_available: true,
                apple_view_url: null,
            },
        }
        mockFetchPreviewUrlBySongId.mockResolvedValue({
            preview_url: "https://example.com/apple-live-preview.m4a",
            apple_view_url: null,
            provider: "apple",
        })

        render(
            <SongDetailScreen
                navigation={navigation as never}
                route={{ params: { ranking: appleRanking } } as never}
            />,
        )

        const playButton = await screen.findByLabelText("Play Preview")
        await act(async () => {
            fireEvent.press(playButton)
        })

        // Courtesy text is required whenever an Apple preview plays; the link is optional.
        expect(await screen.findByText("Provided courtesy of iTunes")).toBeTruthy()
        expect(screen.queryByText("Get on Apple Music")).toBeNull()
    })

    it("shows the preview unavailable state when the Apple lookup returns no preview", async () => {
        const appleRanking: RankingResponse = {
            ...ranking,
            song: {
                ...ranking.song,
                deezer_id: null,
                provider: "apple",
                preview_url: null,
                preview_available: true,
                apple_view_url: null,
            },
        }
        mockFetchPreviewUrlBySongId.mockResolvedValue({
            preview_url: null,
            apple_view_url: "https://music.apple.com/us/album/nights/1440841363?i=1440841363",
            provider: "apple",
        })

        render(
            <SongDetailScreen
                navigation={navigation as never}
                route={{ params: { ranking: appleRanking } } as never}
            />,
        )

        const playButton = await screen.findByLabelText("Play Preview")
        await act(async () => {
            fireEvent.press(playButton)
        })

        expect(await screen.findByText("Preview unavailable")).toBeTruthy()
        expect(screen.getByText("Listen on Apple Music")).toBeTruthy()
        // The play affordance hides instead of inviting more taps that go nowhere.
        expect(screen.queryByLabelText("Play Preview")).toBeNull()
        expect(mockCreatePlayer).not.toHaveBeenCalled()
    })

    it("stops preview audio when the screen blurs", async () => {
        render(<SongDetailScreen navigation={navigation as never} route={route as never} />)

        const playButton = await screen.findByLabelText("Play Preview")
        act(() => {
            fireEvent.press(playButton)
        })

        const blurHandler = mockAddNavigationListener.mock.calls.find((call) => call[0] === "blur")?.[1]
        expect(blurHandler).toBeDefined()
        act(() => {
            blurHandler?.()
        })

        expect(mockRemove).toHaveBeenCalledTimes(1)
    })

    it("opens unrated search songs with local preview and Rate Song action", async () => {
        const unratedRoute = {
            params: {
                song: ranking.song,
            },
        }

        render(<SongDetailScreen navigation={navigation as never} route={unratedRoute as never} />)

        expect(await screen.findByLabelText("Play Preview")).toBeTruthy()
        expect(screen.getByText("Rate Song")).toBeTruthy()
        expect(screen.queryByLabelText("More actions")).toBeNull()
        expect(mockFetchPreviewUrl).not.toHaveBeenCalled()
    })

    it("shows global aggregate score when count and average are present", async () => {
        const routeWithAggregates = {
            params: {
                ranking: {
                    ...ranking,
                    song: {
                        ...ranking.song,
                        global_avg_score: 8.25,
                        global_rating_count: 2,
                    },
                },
            },
        }

        render(
            <SongDetailScreen
                navigation={navigation as never}
                route={routeWithAggregates as never}
            />,
        )
        await act(async () => {})

        expect(screen.getByText("2 ratings")).toBeTruthy()
    })

    it("hides global aggregate score when count is present but average is missing", async () => {
        const routeWithIncompleteAggregates = {
            params: {
                ranking: {
                    ...ranking,
                    song: {
                        ...ranking.song,
                        global_avg_score: null,
                        global_rating_count: 2,
                    },
                },
            },
        }

        render(
            <SongDetailScreen
                navigation={navigation as never}
                route={routeWithIncompleteAggregates as never}
            />,
        )
        await act(async () => {})

        expect(screen.queryByText(/avg/)).toBeNull()
    })

    it("does not show preview button when fetchPreviewUrl returns null", async () => {
        mockFetchPreviewUrl.mockResolvedValue(null)

        render(<SongDetailScreen navigation={navigation as never} route={route as never} />)
        await act(async () => {})

        expect(screen.queryByLabelText("Play Preview")).toBeNull()
    })

    it("shows Bookmark for an unbookmarked song and updates after bookmarking", async () => {
        mockBookmarkSong.mockResolvedValue({
            id: 8,
            source: "song_detail",
            bookmarked_at: "2026-01-01T00:00:00Z",
            song: ranking.song,
            ranking,
        })

        render(<SongDetailScreen navigation={navigation as never} route={route as never} />)

        fireEvent.press(await screen.findByLabelText("Bookmark"))

        await waitFor(() => {
            expect(mockBookmarkSong).toHaveBeenCalledWith(ranking.song, "song_detail", "test-token")
        })
        expect(await screen.findByLabelText("Remove Bookmark")).toBeTruthy()
    })

    it("shows bookmarked state and removes without affecting rating actions", async () => {
        mockGetBookmarkStatus.mockResolvedValue({
            is_bookmarked: true,
            bookmark: {
                id: 8,
                source: "song_detail",
                bookmarked_at: "2026-01-01T00:00:00Z",
                song: ranking.song,
                ranking,
            },
        })
        mockRemoveBookmark.mockResolvedValue({ song_id: ranking.song.id, removed: true })

        render(<SongDetailScreen navigation={navigation as never} route={route as never} />)

        fireEvent.press(await screen.findByLabelText("Remove Bookmark"))

        await waitFor(() => {
            expect(mockRemoveBookmark).toHaveBeenCalledWith(ranking.song.id, "test-token")
        })
        expect(await screen.findByLabelText("Bookmark")).toBeTruthy()
        expect(screen.getByText("Re-rate")).toBeTruthy()
    })

    it("shows bookmark failure and does not claim the song is bookmarked", async () => {
        mockBookmarkSong.mockRejectedValue(new Error("Could not bookmark song."))

        render(<SongDetailScreen navigation={navigation as never} route={route as never} />)

        fireEvent.press(await screen.findByLabelText("Bookmark"))

        expect(await screen.findByText("Could not bookmark song.")).toBeTruthy()
        expect(screen.getByLabelText("Bookmark")).toBeTruthy()
        expect(screen.queryByLabelText("Remove Bookmark")).toBeNull()
    })

    it("bookmarks a fresh Apple search result without any deezer identity", async () => {
        const appleSearchSong = {
            ...ranking.song,
            id: undefined,
            song_id: undefined,
            deezer_id: null,
            provider: "apple" as const,
            apple_track_id: "1440841363",
            storefront: "US",
        }
        mockBookmarkSong.mockResolvedValue({
            id: 9,
            source: "song_detail",
            bookmarked_at: "2026-01-01T00:00:00Z",
            song: ranking.song,
            ranking: null,
        })

        render(
            <SongDetailScreen
                navigation={navigation as never}
                route={{ params: { song: appleSearchSong } } as never}
            />,
        )

        // Not durable yet, so no status endpoint is called — status is trivially unbookmarked.
        fireEvent.press(await screen.findByLabelText("Bookmark"))

        await waitFor(() => {
            expect(mockBookmarkSong).toHaveBeenCalledWith(appleSearchSong, "song_detail", "test-token")
        })
        expect(mockGetBookmarkStatus).not.toHaveBeenCalled()
        expect(mockGetBookmarkStatusBySongId).not.toHaveBeenCalled()
        expect(await screen.findByLabelText("Remove Bookmark")).toBeTruthy()
    })

    it("bookmarks a durable Apple-originated song from Rankings by LISTn id", async () => {
        const appleRanking: RankingResponse = {
            ...ranking,
            song: {
                ...ranking.song,
                deezer_id: null,
                provider: "apple",
                preview_url: null,
                preview_available: true,
                apple_view_url: null,
            },
        }
        mockBookmarkSong.mockResolvedValue({
            id: 10,
            source: "song_detail",
            bookmarked_at: "2026-01-01T00:00:00Z",
            song: appleRanking.song,
            ranking: appleRanking,
        })

        render(
            <SongDetailScreen
                navigation={navigation as never}
                route={{ params: { ranking: appleRanking } } as never}
            />,
        )

        fireEvent.press(await screen.findByLabelText("Bookmark"))

        // Status resolves through the provider-neutral by-song endpoint, and the bookmark
        // payload downgrades to a bare LISTn identity (no apple_track_id on a persisted song).
        await waitFor(() => {
            expect(mockGetBookmarkStatusBySongId).toHaveBeenCalledWith(42, "test-token")
        })
        await waitFor(() => {
            expect(mockBookmarkSong).toHaveBeenCalledWith(
                { ...appleRanking.song, id: 42, deezer_id: null, provider: "listn" },
                "song_detail",
                "test-token",
            )
        })
        expect(mockGetBookmarkStatus).not.toHaveBeenCalled()
        expect(await screen.findByLabelText("Remove Bookmark")).toBeTruthy()
    })
})
