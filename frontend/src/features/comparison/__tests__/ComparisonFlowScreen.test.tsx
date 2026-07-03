// Tests for Comparison Flow audio preview behavior.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import { cancelComparisonSession, chooseComparisonWinner, finalizeComparisonSession, undoComparisonChoice } from "../apiRequests"
import ComparisonFlowScreen from "../ComparisonFlowScreen"
import { ComparisonSessionResponse } from "../types"

const mockNavigate = jest.fn()
const mockReplace = jest.fn()
const mockGoBack = jest.fn()
const mockFetchPreviewUrl = jest.fn()
const mockFetchPreviewUrlBySongId = jest.fn()
const mockPlay = jest.fn()
const mockCreatePlayer = jest.fn()
const mockAddNavigationListener = jest.fn()

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

jest.mock("../../songs/apiRequests", () => ({
    fetchPreviewUrl: (...args: unknown[]) => mockFetchPreviewUrl(...args),
    fetchPreviewUrlBySongId: (...args: unknown[]) => mockFetchPreviewUrlBySongId(...args),
}))

jest.mock("../apiRequests", () => ({
    cancelComparisonSession: jest.fn(),
    chooseComparisonWinner: jest.fn(),
    finalizeComparisonSession: jest.fn(),
    undoComparisonChoice: jest.fn(),
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
            global_avg_score: null,
            global_rating_count: 0,
            created_at: "2026-01-01T00:00:00Z",
        },
    },
    final_position: null,
    comparison_count: 0,
    low_index: 0,
    high_index: 1,
    candidate_index: 0,
    total_in_bucket: 1,
    current_bucket_rankings: [{ song_id: 42, title: "Pink + White", artist: "Frank Ocean", cover_url: null }],
    created_at: "2026-01-01T00:00:00Z",
}

const navigation = {
    navigate: mockNavigate,
    replace: mockReplace,
    goBack: mockGoBack,
    canGoBack: () => true,
    setOptions: jest.fn(),
    addListener: mockAddNavigationListener,
}

const route = {
    params: {
        session,
    },
}

beforeEach(() => {
    jest.resetAllMocks()
    jest.spyOn(Date, "now").mockReturnValue(1000)
    mockCreatePlayer.mockReturnValue({
        play: mockPlay,
        pause: jest.fn(),
        remove: jest.fn(),
        addListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
    })
    mockAddNavigationListener.mockReturnValue(jest.fn())
    mockFetchPreviewUrl.mockResolvedValue("https://example.com/fresh-preview.mp3")
    mockFetchPreviewUrlBySongId.mockResolvedValue({
        preview_url: "https://example.com/apple-live-preview.m4a",
        apple_view_url: "https://music.apple.com/us/album/saved/42?i=42",
        provider: "apple",
    })
})

afterEach(() => {
    jest.restoreAllMocks()
})

describe("ComparisonFlowScreen", () => {
    it("resolves a legacy candidate preview via the by-song lookup and shows iTunes attribution", async () => {
        // The default candidate is a persisted song with a stale Deezer id + inline
        // preview_url. Its stored provider is not "apple", so the footer used to stay on
        // the tagline. The by-id lookup resolves the real (Apple) provider instead.
        const rendered = render(<ComparisonFlowScreen navigation={navigation as never} route={route as never} />)

        await waitFor(() => {
            expect(mockFetchPreviewUrlBySongId).toHaveBeenCalledWith(42, "test-token")
        })
        // The legacy Deezer refresh endpoint is never hit and the stale inline URL is ignored.
        expect(mockFetchPreviewUrl).not.toHaveBeenCalled()

        const previewButton = await screen.findByLabelText("Preview candidate")
        act(() => {
            fireEvent.press(previewButton, { stopPropagation: jest.fn() })
        })

        expect(mockCreatePlayer).toHaveBeenCalledWith("https://example.com/apple-live-preview.m4a")
        expect(mockPlay).toHaveBeenCalledTimes(1)
        // Playing the candidate's Apple preview swaps the footer to iTunes attribution,
        // including the store link, matching the target side.
        expect(screen.getByText("Provided courtesy of iTunes")).toBeTruthy()
        expect(screen.getByText("Get on Apple Music")).toBeTruthy()
        expect(screen.queryByText("We'll find the fairest comparison.")).toBeNull()
        act(() => {
            rendered.unmount()
        })
    })

    it("resolves saved Apple candidate previews via the by-song lookup", async () => {
        const appleRoute = {
            params: {
                session: {
                    ...session,
                    candidate: {
                        ...session.candidate!,
                        song: {
                            ...session.candidate!.song,
                            deezer_id: null,
                            provider: "apple",
                            preview_url: null,
                            preview_available: true,
                            apple_view_url: null,
                        },
                    },
                },
            },
        }

        const rendered = render(<ComparisonFlowScreen navigation={navigation as never} route={appleRoute as never} />)

        // Candidate previews resolve through the provider-neutral by-id endpoint, never
        // the legacy Deezer refresh.
        await waitFor(() => {
            expect(mockFetchPreviewUrlBySongId).toHaveBeenCalledWith(42, "test-token")
        })
        expect(mockFetchPreviewUrl).not.toHaveBeenCalled()

        const previewButton = await screen.findByLabelText("Preview candidate")
        await act(async () => {
            fireEvent.press(previewButton, { stopPropagation: jest.fn() })
        })

        await waitFor(() => {
            expect(mockCreatePlayer).toHaveBeenCalledWith("https://example.com/apple-live-preview.m4a")
        })
        // Attribution lives in the footer, replacing the tagline while the played preview is Apple's.
        expect(screen.getByText("Provided courtesy of iTunes")).toBeTruthy()
        expect(screen.queryByText("We'll find the fairest comparison.")).toBeNull()
        act(() => {
            rendered.unmount()
        })
    })

    it("cancelling pops the flow off the stack with goBack instead of navigating to a tab", async () => {
        const mockCancel = cancelComparisonSession as jest.Mock
        mockCancel.mockResolvedValue(undefined)
        const rendered = render(<ComparisonFlowScreen navigation={navigation as never} route={route as never} />)

        fireEvent.press(screen.getByLabelText("Cancel rating"))

        await waitFor(() => {
            expect(mockCancel).toHaveBeenCalledWith("session-123", "test-token")
        })
        // Must pop the slot cleanly (goBack) — navigate("MainTabs", { screen }) leaves the
        // native screen attached as a swipe-back ghost after the transparentModal replace chain.
        await waitFor(() => {
            expect(mockGoBack).toHaveBeenCalledTimes(1)
        })
        expect(mockNavigate).not.toHaveBeenCalled()
        act(() => {
            rendered.unmount()
        })
    })

    it("still leaves the flow when the cancel request fails", async () => {
        const mockCancel = cancelComparisonSession as jest.Mock
        mockCancel.mockRejectedValue(new Error("network"))
        const rendered = render(<ComparisonFlowScreen navigation={navigation as never} route={route as never} />)

        fireEvent.press(screen.getByLabelText("Cancel rating"))

        await waitFor(() => {
            expect(mockGoBack).toHaveBeenCalledTimes(1)
        })
        act(() => {
            rendered.unmount()
        })
    })

    it("sends the decision duration when a comparison choice is made", async () => {
        const mockChooseComparisonWinner = chooseComparisonWinner as jest.Mock
        const mockFinalizeComparisonSession = finalizeComparisonSession as jest.Mock
        mockChooseComparisonWinner.mockResolvedValue({
            ...session,
            status: "ready_to_finalize",
            candidate: null,
            final_position: 1,
        })
        mockFinalizeComparisonSession.mockResolvedValue({
            result: {
                ranking: {},
                rating_event: {},
            },
        })
        const rendered = render(<ComparisonFlowScreen navigation={navigation as never} route={route as never} />)

        jest.spyOn(Date, "now").mockReturnValue(2450)
        fireEvent.press(screen.getByLabelText("Choose new song"))

        await waitFor(() => {
            expect(mockChooseComparisonWinner).toHaveBeenCalledWith("session-123", "target", "test-token", 1450)
        })
        act(() => {
            rendered.unmount()
        })
    })

    it("disables undo before any comparison choice is made", () => {
        const rendered = render(<ComparisonFlowScreen navigation={navigation as never} route={route as never} />)

        const undoButton = screen.getByLabelText("Undo last comparison")
        expect(undoButton.props.accessibilityState).toEqual({ disabled: true })

        act(() => {
            rendered.unmount()
        })
    })

    it("undoes the latest comparison choice with the expected-count guard", async () => {
        const mockUndo = undoComparisonChoice as jest.Mock
        mockUndo.mockResolvedValue({
            ...session,
            comparison_count: 0,
            candidate: { ...session.candidate!, song: { ...session.candidate!.song, cover_url: null } },
        })
        const undoableRoute = {
            params: { session: { ...session, comparison_count: 1 } },
        }
        const rendered = render(<ComparisonFlowScreen navigation={navigation as never} route={undoableRoute as never} />)

        fireEvent.press(screen.getByLabelText("Undo last comparison"))

        await waitFor(() => {
            expect(mockUndo).toHaveBeenCalledWith("session-123", "test-token", 1)
        })
        act(() => {
            rendered.unmount()
        })
    })
})
