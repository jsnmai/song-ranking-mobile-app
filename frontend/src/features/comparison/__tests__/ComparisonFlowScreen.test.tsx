// Tests for Comparison Flow audio preview behavior.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import ComparisonFlowScreen from "../ComparisonFlowScreen"
import { ComparisonSessionResponse } from "../types"

const mockNavigate = jest.fn()
const mockReplace = jest.fn()
const mockFetchPreviewUrl = jest.fn()
const mockPlay = jest.fn()
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

jest.mock("../../songs/apiRequests", () => ({
    fetchPreviewUrl: (...args: unknown[]) => mockFetchPreviewUrl(...args),
}))

jest.mock("../apiRequests", () => ({
    cancelComparisonSession: jest.fn(),
    chooseComparisonWinner: jest.fn(),
    finalizeComparisonSession: jest.fn(),
}))

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
        cover_url: "https://example.com/target.jpg",
        preview_url: null,
    },
    candidate: {
        id: 7,
        song_id: 42,
        bucket: "like",
        position: 1,
        score: 9.4,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        song: {
            id: 42,
            deezer_id: 999,
            isrc: "USUG11900843",
            title: "Pink + White",
            artist: "Frank Ocean",
            artist_deezer_id: 456,
            album: "Blonde",
            cover_url: "https://example.com/candidate.jpg",
            preview_url: "https://example.com/stale-preview.mp3",
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
    },
    final_position: null,
    comparison_count: 0,
    low_index: 0,
    high_index: 1,
    candidate_index: 0,
    total_in_bucket: 1,
    current_bucket_rankings: [{ song_id: 42, title: "Pink + White" }],
    created_at: "2026-01-01T00:00:00Z",
}

const navigation = {
    navigate: mockNavigate,
    replace: mockReplace,
    addListener: mockAddNavigationListener,
}

const route = {
    params: {
        session,
    },
}

beforeEach(() => {
    jest.resetAllMocks()
    mockCreatePlayer.mockReturnValue({
        play: mockPlay,
        pause: jest.fn(),
        remove: jest.fn(),
        addListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
    })
    mockAddNavigationListener.mockReturnValue(jest.fn())
    mockFetchPreviewUrl.mockResolvedValue("https://example.com/fresh-preview.mp3")
})

describe("ComparisonFlowScreen", () => {
    it("refreshes the persisted candidate preview URL before playback", async () => {
        render(<ComparisonFlowScreen navigation={navigation as never} route={route as never} />)

        await waitFor(() => {
            expect(mockFetchPreviewUrl).toHaveBeenCalledWith(999, "test-token")
        })

        const previewButton = await screen.findByText("Preview")
        act(() => {
            fireEvent.press(previewButton, { stopPropagation: jest.fn() })
        })

        expect(mockCreatePlayer).toHaveBeenCalledWith("https://example.com/fresh-preview.mp3")
        expect(mockPlay).toHaveBeenCalledTimes(1)
    })
})
