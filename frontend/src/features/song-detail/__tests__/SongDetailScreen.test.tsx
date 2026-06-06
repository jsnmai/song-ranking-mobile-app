// Tests for Song Detail audio preview and remove-rating behavior.
import { Alert, AlertButton } from "react-native"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import SongDetailScreen from "../SongDetailScreen"
import { RankingResponse } from "../../comparison/types"

const mockGoBack = jest.fn()
const mockNavigate = jest.fn()
const mockRemoveRating = jest.fn()
const mockFetchPreviewUrl = jest.fn()
const mockGetSavedSongStatus = jest.fn()
const mockRemoveSavedSong = jest.fn()
const mockSaveSong = jest.fn()

const mockPlay = jest.fn()
const mockRemove = jest.fn()
const mockCreatePlayer = jest.fn()
const mockAddNavigationListener = jest.fn()

jest.mock("expo-audio", () => ({
    createAudioPlayer: (...args: unknown[]) => mockCreatePlayer(...args),
    setAudioModeAsync: jest.fn(),
}))

jest.mock("../../auth/AuthContext", () => ({
    useAuth: () => ({
        token: "test-token",
    }),
}))

jest.mock("../../rankings/apiRequests", () => ({
    removeRating: (...args: unknown[]) => mockRemoveRating(...args),
}))

jest.mock("../../songs/apiRequests", () => ({
    fetchPreviewUrl: (...args: unknown[]) => mockFetchPreviewUrl(...args),
}))

jest.mock("../../saved-songs/apiRequests", () => ({
    getSavedSongStatus: (...args: unknown[]) => mockGetSavedSongStatus(...args),
    removeSavedSong: (...args: unknown[]) => mockRemoveSavedSong(...args),
    saveSong: (...args: unknown[]) => mockSaveSong(...args),
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
    mockCreatePlayer.mockReturnValue({
        play: mockPlay,
        pause: jest.fn(),
        remove: mockRemove,
        addListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
    })
    mockAddNavigationListener.mockReturnValue(jest.fn())
    mockFetchPreviewUrl.mockResolvedValue("https://example.com/preview.mp3")
    mockGetSavedSongStatus.mockResolvedValue({ is_saved: false, save: null })
})

describe("SongDetailScreen", () => {
    it("opens Reorder from the action list", async () => {
        render(<SongDetailScreen navigation={navigation as never} route={route as never} />)
        // Flush the async fetchPreviewUrl effect before asserting to avoid act() warnings.
        await act(async () => {})

        fireEvent.press(screen.getByText("Reorder"))

        expect(mockNavigate).toHaveBeenCalledWith("Reorder")
    })

    it("confirms before removing a rating, then returns to Rankings", async () => {
        const alertSpy = jest.spyOn(Alert, "alert")
        mockRemoveRating.mockResolvedValue({ rating_event: { event_type: "removed" } })

        render(<SongDetailScreen navigation={navigation as never} route={route as never} />)
        await act(async () => {})

        fireEvent.press(screen.getByText("Remove Rating"))

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

    it("does nothing when the remove confirmation is canceled", async () => {
        const alertSpy = jest.spyOn(Alert, "alert")

        render(<SongDetailScreen navigation={navigation as never} route={route as never} />)
        await act(async () => {})

        fireEvent.press(screen.getByText("Remove Rating"))
        const buttons = alertSpy.mock.calls[0][2] as AlertButton[]
        buttons[0].onPress?.()

        expect(mockRemoveRating).not.toHaveBeenCalled()
        expect(mockNavigate).not.toHaveBeenCalled()
    })

    it("shows Play Preview button when fetchPreviewUrl returns a URL", async () => {
        render(<SongDetailScreen navigation={navigation as never} route={route as never} />)
        // findByText waits until the element appears — handles the async fetch naturally.
        expect(await screen.findByText("Play Preview")).toBeTruthy()
    })

    it("creates a player and immediately shows Pause Preview when pressed", async () => {
        render(<SongDetailScreen navigation={navigation as never} route={route as never} />)

        // Wait for the async fetchPreviewUrl to finish before the button appears.
        const playButton = await screen.findByText("Play Preview")
        act(() => {
            fireEvent.press(playButton)
        })

        expect(mockCreatePlayer).toHaveBeenCalledWith("https://example.com/preview.mp3")
        expect(mockPlay).toHaveBeenCalledTimes(1)
        expect(screen.getByText("Pause Preview")).toBeTruthy()
    })

    it("stops preview audio when the screen blurs", async () => {
        render(<SongDetailScreen navigation={navigation as never} route={route as never} />)

        const playButton = await screen.findByText("Play Preview")
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

        expect(await screen.findByText("Play Preview")).toBeTruthy()
        expect(screen.getByText("Rate Song")).toBeTruthy()
        expect(screen.queryByText("Remove Rating")).toBeNull()
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

        expect(screen.queryByText("Play Preview")).toBeNull()
    })

    it("shows Save for an unsaved song and updates after saving", async () => {
        mockSaveSong.mockResolvedValue({
            id: 8,
            source: "song_detail",
            saved_at: "2026-01-01T00:00:00Z",
            song: ranking.song,
            ranking,
        })

        render(<SongDetailScreen navigation={navigation as never} route={route as never} />)

        fireEvent.press(await screen.findByText("Save"))

        await waitFor(() => {
            expect(mockSaveSong).toHaveBeenCalledWith(ranking.song, "song_detail", "test-token")
        })
        expect(await screen.findByText("Remove from Saved Songs")).toBeTruthy()
    })

    it("shows saved state and removes without affecting rating actions", async () => {
        mockGetSavedSongStatus.mockResolvedValue({
            is_saved: true,
            save: {
                id: 8,
                source: "song_detail",
                saved_at: "2026-01-01T00:00:00Z",
                song: ranking.song,
                ranking,
            },
        })
        mockRemoveSavedSong.mockResolvedValue({ song_id: ranking.song.id, removed: true })

        render(<SongDetailScreen navigation={navigation as never} route={route as never} />)

        fireEvent.press(await screen.findByText("Remove from Saved Songs"))

        await waitFor(() => {
            expect(mockRemoveSavedSong).toHaveBeenCalledWith(ranking.song.id, "test-token")
        })
        expect(await screen.findByText("Save")).toBeTruthy()
        expect(screen.getByText("Rate Again")).toBeTruthy()
    })

    it("shows save failure and does not claim the song is saved", async () => {
        mockSaveSong.mockRejectedValue(new Error("Could not save song."))

        render(<SongDetailScreen navigation={navigation as never} route={route as never} />)

        fireEvent.press(await screen.findByText("Save"))

        expect(await screen.findByText("Could not save song.")).toBeTruthy()
        expect(screen.getByText("Save")).toBeTruthy()
        expect(screen.queryByText("Remove from Saved Songs")).toBeNull()
    })
})
