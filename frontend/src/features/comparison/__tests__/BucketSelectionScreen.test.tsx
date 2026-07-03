// Tests for Bucket Selection preview, bucket routing, errors, and close behavior.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import { ApiError } from "../../../api/client"
import { SongSearchResult } from "../../search/types"
import BucketSelectionScreen from "../BucketSelectionScreen"
import { finalizeRating, startComparisonSession } from "../apiRequests"
import { ComparisonSessionResponse } from "../types"

const mockGoBack = jest.fn()
const mockReplace = jest.fn()
const mockListMyRankings = jest.fn()
const mockFetchPreviewUrlBySongId = jest.fn()
const mockFinalizeRating = jest.fn()
const mockStartComparisonSession = jest.fn()
const mockAddNavigationListener = jest.fn()

const mockPlay = jest.fn()
const mockRemove = jest.fn()
const mockCreatePlayer = jest.fn()

jest.mock("react-native-safe-area-context", () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

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
    listMyRankings: (...args: unknown[]) => mockListMyRankings(...args),
}))

jest.mock("../../songs/apiRequests", () => ({
    fetchPreviewUrlBySongId: (...args: unknown[]) => mockFetchPreviewUrlBySongId(...args),
}))

jest.mock("../apiRequests", () => ({
    finalizeRating: (...args: unknown[]) => mockFinalizeRating(...args),
    startComparisonSession: (...args: unknown[]) => mockStartComparisonSession(...args),
}))

const baseSong: SongSearchResult = {
    deezer_id: 123,
    isrc: "USUG11900842",
    title: "Nights",
    artist: "Frank Ocean",
    artist_deezer_id: 456,
    album: "Blonde",
    cover_url: "https://example.com/cover.jpg",
    preview_url: "https://example.com/preview.mp3",
}

const navigation = {
    goBack: mockGoBack,
    replace: mockReplace,
    setOptions: jest.fn(),
    addListener: mockAddNavigationListener,
}

function buildRoute(song: SongSearchResult = baseSong) {
    return {
        params: {
            song,
        },
    }
}

const emptyRankingsResponse = {
    rankings: [],
    next_cursor: null,
}

const session: ComparisonSessionResponse = {
    session_uuid: "session-123",
    bucket: "like",
    status: "active",
    target_song: {
        deezer_id: 123,
        isrc: "USUG11900842",
        title: "Nights",
        artist: "Frank Ocean",
        artist_deezer_id: 456,
        album: "Blonde",
        cover_url: "https://example.com/cover.jpg",
        preview_url: null,
    },
    candidate: null,
    final_position: null,
    comparison_count: 0,
    low_index: 0,
    high_index: 0,
    candidate_index: 0,
    total_in_bucket: 1,
    current_bucket_rankings: [],
    created_at: "2026-01-01T00:00:00Z",
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
    mockListMyRankings.mockResolvedValue(emptyRankingsResponse)
    mockFetchPreviewUrlBySongId.mockResolvedValue({
        preview_url: "https://example.com/apple-live-preview.m4a",
        apple_view_url: "https://music.apple.com/us/album/saved/42?i=42",
        provider: "apple",
    })
    mockFinalizeRating.mockResolvedValue({
        ranking: {},
        rating_event: {},
    })
    mockStartComparisonSession.mockResolvedValue(session)
})

describe("BucketSelectionScreen", () => {
    it("renders song title and Like, Okay, and Dislike buckets", () => {
        render(<BucketSelectionScreen navigation={navigation as never} route={buildRoute() as never} />)

        expect(screen.getByText("Nights")).toBeTruthy()
        expect(screen.getByText("Like")).toBeTruthy()
        expect(screen.getByText("Okay")).toBeTruthy()
        expect(screen.getByText("Dislike")).toBeTruthy()
    })

    it("shows Play Preview when preview_url exists", () => {
        render(<BucketSelectionScreen navigation={navigation as never} route={buildRoute() as never} />)

        expect(screen.getByLabelText("Play preview")).toBeTruthy()
    })

    it("hides preview button when preview_url is missing", () => {
        const songWithoutPreview = {
            ...baseSong,
            preview_url: null,
        }
        render(
            <BucketSelectionScreen
                navigation={navigation as never}
                route={buildRoute(songWithoutPreview) as never}
            />,
        )

        expect(screen.queryByLabelText("Play preview")).toBeNull()
        expect(screen.queryByLabelText("Stop preview")).toBeNull()
    })

    it("uses by-song preview lazily for saved Apple songs", async () => {
        const savedAppleSong: SongSearchResult = {
            id: 42,
            provider: "apple",
            deezer_id: null,
            isrc: null,
            title: "Saved Apple",
            artist: "Frank Ocean",
            artist_deezer_id: null,
            album: "Blonde",
            cover_url: "https://example.com/apple.jpg",
            preview_url: null,
            preview_available: true,
            apple_view_url: null,
        }

        render(<BucketSelectionScreen navigation={navigation as never} route={buildRoute(savedAppleSong) as never} />)

        const playButton = screen.getByLabelText("Play preview")
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

    it("empty bucket finalizes rating and replaces to ScoreReveal", async () => {
        render(<BucketSelectionScreen navigation={navigation as never} route={buildRoute() as never} />)

        fireEvent.press(screen.getByTestId("bucket-like"))
        fireEvent.press(screen.getByText("Next"))

        await waitFor(() => {
            expect(mockFinalizeRating).toHaveBeenCalledWith(
                {
                    song: baseSong,
                    bucket: "like",
                },
                "test-token",
            )
        })
        expect(mockReplace).toHaveBeenCalledWith("ScoreReveal", {
            result: {
                ranking: {},
                rating_event: {},
            },
        })
        expect(mockStartComparisonSession).not.toHaveBeenCalled()
    })

    it("sends an optional note with the finalized rating", async () => {
        render(<BucketSelectionScreen navigation={navigation as never} route={buildRoute() as never} />)

        fireEvent.changeText(screen.getByPlaceholderText("Add a note…"), "  Hovering all week.  ")
        fireEvent.press(screen.getByTestId("bucket-like"))
        fireEvent.press(screen.getByText("Next"))

        await waitFor(() => {
            expect(mockFinalizeRating).toHaveBeenCalledWith(
                {
                    song: baseSong,
                    bucket: "like",
                    note: "  Hovering all week.  ",
                },
                "test-token",
            )
        })
    })

    it("non-empty bucket starts comparison and replaces to ComparisonFlow", async () => {
        mockListMyRankings.mockResolvedValue({
            rankings: [
                {
                    id: 9,
                    song_id: 99,
                    bucket: "like",
                    position: 1,
                    score: 9.0,
                    created_at: "2026-01-01T00:00:00Z",
                    updated_at: "2026-01-01T00:00:00Z",
                    song: {
                        id: 99,
                        deezer_id: 999,
                        isrc: null,
                        title: "Other Song",
                        artist: "Other Artist",
                        artist_deezer_id: 1,
                        album: "Other Album",
                        cover_url: "https://example.com/other.jpg",
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
                },
            ],
            next_cursor: null,
        })

        render(<BucketSelectionScreen navigation={navigation as never} route={buildRoute() as never} />)

        fireEvent.press(screen.getByTestId("bucket-like"))
        fireEvent.press(screen.getByText("Next"))

        await waitFor(() => {
            expect(mockStartComparisonSession).toHaveBeenCalledWith(
                {
                    song: baseSong,
                    bucket: "like",
                },
                "test-token",
            )
        })
        expect(mockReplace).toHaveBeenCalledWith("ComparisonFlow", { session })
        expect(mockFinalizeRating).not.toHaveBeenCalled()
    })

    it("uses persisted song id to avoid comparing a saved Apple song against itself", async () => {
        const appleSong: SongSearchResult = {
            id: 42,
            deezer_id: null,
            isrc: null,
            title: "Saved Apple",
            artist: "Frank Ocean",
            artist_deezer_id: null,
            album: "Blonde",
            cover_url: "https://example.com/apple.jpg",
            preview_url: null,
        }
        mockListMyRankings.mockResolvedValue({
            rankings: [
                {
                    id: 9,
                    song_id: 42,
                    bucket: "like",
                    position: 1,
                    score: 9.0,
                    created_at: "2026-01-01T00:00:00Z",
                    updated_at: "2026-01-01T00:00:00Z",
                    song: {
                        ...appleSong,
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
                        global_rating_count: 1,
                        created_at: "2026-01-01T00:00:00Z",
                    },
                },
            ],
            next_cursor: null,
        })

        render(<BucketSelectionScreen navigation={navigation as never} route={buildRoute(appleSong) as never} />)

        fireEvent.press(screen.getByTestId("bucket-like"))
        fireEvent.press(screen.getByText("Next"))

        await waitFor(() => {
            expect(mockFinalizeRating).toHaveBeenCalledWith(
                {
                    song: appleSong,
                    bucket: "like",
                },
                "test-token",
            )
        })
        expect(mockStartComparisonSession).not.toHaveBeenCalled()
    })

    it("shows API error and re-enables buckets after failure", async () => {
        mockFinalizeRating.mockRejectedValue(new ApiError(400, "Bucket unavailable", null))

        render(<BucketSelectionScreen navigation={navigation as never} route={buildRoute() as never} />)

        fireEvent.press(screen.getByTestId("bucket-dislike"))
        fireEvent.press(screen.getByText("Next"))

        expect(await screen.findByText("Bucket unavailable")).toBeTruthy()

        fireEvent.press(screen.getByTestId("bucket-like"))
        fireEvent.press(screen.getByText("Next"))
        await waitFor(() => {
            expect(mockFinalizeRating).toHaveBeenCalledTimes(2)
        })
    })

    it("close goes back", () => {
        jest.useFakeTimers()
        // jest.resetAllMocks() clears startAnimatingNode's default impl; re-apply so animation callbacks fire
        const { NativeModules } = require("react-native")
        NativeModules.NativeAnimatedModule?.startAnimatingNode?.mockImplementation(
            (_id: unknown, _tag: unknown, _config: unknown, cb: (r: { finished: boolean }) => void) => {
                setTimeout(() => cb({ finished: true }), 16)
            },
        )

        render(<BucketSelectionScreen navigation={navigation as never} route={buildRoute() as never} />)

        act(() => {
            fireEvent.press(screen.getByTestId("bucket-selection-close"))
            jest.runAllTimers()
        })

        expect(mockGoBack).toHaveBeenCalledTimes(1)
        jest.useRealTimers()
    })

    it("starts preview playback when Play Preview is pressed", () => {
        render(<BucketSelectionScreen navigation={navigation as never} route={buildRoute() as never} />)

        fireEvent.press(screen.getByLabelText("Play preview"))

        expect(mockCreatePlayer).toHaveBeenCalledWith("https://example.com/preview.mp3")
        expect(mockPlay).toHaveBeenCalledTimes(1)
    })

    it("stops preview audio on blur", () => {
        let blurHandler: (() => void) | undefined
        mockAddNavigationListener.mockImplementation((event: string, handler: () => void) => {
            if (event === "blur") {
                blurHandler = handler
            }
            return jest.fn()
        })

        const rendered = render(
            <BucketSelectionScreen navigation={navigation as never} route={buildRoute() as never} />,
        )

        fireEvent.press(screen.getByLabelText("Play preview"))
        act(() => {
            blurHandler?.()
        })

        expect(mockRemove).toHaveBeenCalled()
        act(() => {
            rendered.unmount()
        })
    })
})
