// Tests for Song Detail audio preview and remove-rating behavior.
import { Alert, AlertButton } from "react-native"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import SongDetailScreen from "../SongDetailScreen"
import { RankingResponse } from "../../comparison/types"

const mockGoBack = jest.fn()
const mockNavigate = jest.fn()
const mockRemoveRating = jest.fn()
const mockFetchPreviewUrl = jest.fn()

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

    it("does not show preview button when fetchPreviewUrl returns null", async () => {
        mockFetchPreviewUrl.mockResolvedValue(null)

        render(<SongDetailScreen navigation={navigation as never} route={route as never} />)
        await act(async () => {})

        expect(screen.queryByText("Play Preview")).toBeNull()
    })
})
