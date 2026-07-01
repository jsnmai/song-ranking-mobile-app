// Tests for the immersive Rank Map screen: lens switching, star selection →
// bloom card → Song Detail, and back navigation.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import RankMapScreen from "../rankmap/RankMapScreen"
import { RankingResponse } from "../../comparison/types"

const mockNavigate = jest.fn()
const mockGoBack = jest.fn()
let mockRouteRankings: RankingResponse[] = []

jest.mock("@react-navigation/native", () => {
    const actual = jest.requireActual("@react-navigation/native")
    return {
        ...actual,
        useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack, setOptions: jest.fn() }),
        useRoute: () => ({ params: { rankings: mockRouteRankings } }),
    }
})

jest.mock("react-native-safe-area-context", () => ({
    useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}))

// BlurView (BloomCard) → plain View so we don't pull in the native module.
jest.mock("expo-blur", () => {
    const { View } = require("react-native")
    return { BlurView: View }
})

// BloomCard plays a 30s preview via useAudioPlayer (expo-audio) — stub it out.
const mockToggle = jest.fn()
jest.mock("../../../hooks/useAudioPlayer", () => ({
    useAudioPlayer: () => ({ isPlaying: false, currentTime: 0, duration: null, toggle: mockToggle, stop: jest.fn() }),
}))

// BloomCard fetches the live preview URL by deezer id (like Song Detail).
const mockFetchPreviewUrl = jest.fn()
const mockFetchPreviewUrlBySongId = jest.fn()
jest.mock("../../songs/apiRequests", () => ({
    fetchPreviewUrl: (...args: unknown[]) => mockFetchPreviewUrl(...args),
    fetchPreviewUrlBySongId: (...args: unknown[]) => mockFetchPreviewUrlBySongId(...args),
}))

jest.mock("../../auth/AuthContext", () => ({
    useAuth: () => ({ token: "test-token" }),
}))

function mk(id: number, title: string, score: number, bucket: RankingResponse["bucket"]): RankingResponse {
    return {
        id,
        song_id: id,
        bucket,
        position: id,
        score,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        song: {
            id,
            deezer_id: id,
            isrc: `ISRC${id}`,
            title,
            artist: "Artist",
            artist_deezer_id: id,
            album: "Album",
            cover_url: "",
            preview_url: null,
            genre_deezer: "Pop",
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
}

// Alpha (highest) becomes the sun; Beta/Gamma are tappable planets.
const ALPHA = mk(1, "Alpha", 9.2, "like")
const BETA = mk(2, "Beta", 6.4, "like")
const GAMMA = mk(3, "Gamma", 3.1, "dislike")

function withDate(ranking: RankingResponse, createdAt: string): RankingResponse {
    return { ...ranking, created_at: createdAt, updated_at: createdAt }
}

function withGenre(ranking: RankingResponse, genre: string): RankingResponse {
    return { ...ranking, song: { ...ranking.song, genre_deezer: genre } }
}

beforeEach(() => {
    jest.resetAllMocks()
    mockRouteRankings = [ALPHA, BETA, GAMMA]
    mockFetchPreviewUrl.mockResolvedValue(null)
    mockFetchPreviewUrlBySongId.mockResolvedValue({
        preview_url: "https://example.com/apple-live-preview.m4a",
        apple_view_url: "https://music.apple.com/us/album/saved/2?i=2",
    })
})

describe("RankMapScreen", () => {
    it("renders the title, bottom lens switcher, and active caption", () => {
        render(<RankMapScreen />)

        expect(screen.getByText("Rank Map")).toBeTruthy()
        expect(screen.getByText("Gravity")).toBeTruthy()
        expect(screen.getByText("Genres")).toBeTruthy()
        expect(screen.getByText("Verdict")).toBeTruthy()
        expect(screen.getByText("DISTANCE TO YOUR SUN = HOW MUCH YOU LOVE IT")).toBeTruthy()
    })

    it("switches the caption when a different lens is chosen", () => {
        render(<RankMapScreen />)

        fireEvent.press(screen.getByLabelText("Verdict view"))

        expect(screen.getByText("THREE CLOUDS, SIZED BY HOW OFTEN YOU GO THERE")).toBeTruthy()
    })

    it("toggles bucket filters without allowing a blank map", () => {
        render(<RankMapScreen />)

        expect(screen.getByLabelText("Filter Like").props.accessibilityState).toEqual({ selected: true })

        fireEvent.press(screen.getByLabelText("Filter Like"))

        expect(screen.getByLabelText("Filter Like").props.accessibilityState).toEqual({ selected: false })
        expect(screen.getByLabelText("Filter Okay").props.accessibilityState).toEqual({ selected: true })
    })

    it("rolls genres beyond the chart cap into an 'Other' filter", () => {
        // 8 distinct genres > the 6 constellation slots, so the tail collapses.
        const genres = ["Pop", "Rock", "Jazz", "Hip-Hop", "Metal", "Folk", "Soul", "Funk"]
        mockRouteRankings = genres.map((g, i) => withGenre(mk(i + 1, `Song ${i}`, 9 - i * 0.5, "like"), g))
        render(<RankMapScreen />)

        fireEvent.press(screen.getByLabelText("Genres view"))

        // Top genres keep their own pill; the rest fold into one "Other" pill so
        // no song vanishes from the lens.
        expect(screen.getByLabelText("Filter Pop")).toBeTruthy()
        expect(screen.getByLabelText("Filter Other")).toBeTruthy()
        expect(screen.queryByLabelText("Filter Funk")).toBeNull()
    })

    it("zooms the map with the floating controls", () => {
        render(<RankMapScreen />)

        expect(screen.getByText("100%")).toBeTruthy()

        fireEvent.press(screen.getByLabelText("Zoom in"))

        expect(screen.getByText("122%")).toBeTruthy()
    })

    it("opens the time travel scrubber from the top-right icon", () => {
        mockRouteRankings = [
            withDate(ALPHA, "2026-01-15T12:00:00Z"),
            withDate(BETA, "2026-02-15T12:00:00Z"),
            withDate(GAMMA, "2026-03-15T12:00:00Z"),
        ]
        render(<RankMapScreen />)

        fireEvent.press(screen.getByLabelText("Taste over time"))

        expect(screen.getByText("TASTE OVER TIME")).toBeTruthy()
        expect(screen.getByText("Mar ’26")).toBeTruthy()
        expect(screen.getByText("Monthly")).toBeTruthy()
        // The top-right time-travel icon toggles to its "exit" label while active.
        expect(screen.getByLabelText("Exit taste over time")).toBeTruthy()

        fireEvent.press(screen.getByLabelText("Show weekly time travel"))

        expect(screen.getByText("Mar 9 ’26")).toBeTruthy()
        expect(screen.getByLabelText("Show weekly time travel").props.accessibilityState).toEqual({
            selected: true,
            disabled: false,
        })
    })

    it("opens a bloom card for a tapped star and pushes Song Detail", async () => {
        render(<RankMapScreen />)

        // Tap a planet (Beta is not the sun) → bloom card appears.
        fireEvent.press(screen.getByLabelText("Beta"))
        const open = await screen.findByLabelText("Open Beta")

        // Tapping the card body opens the full Song Detail with the ranking.
        fireEvent.press(open)
        expect(mockNavigate).toHaveBeenCalledWith("SongDetail", { ranking: BETA })
    })

    it("plays the audio preview from a tapped star that has one", async () => {
        mockFetchPreviewUrl.mockResolvedValue("https://example.com/beta.mp3")
        render(<RankMapScreen />)

        fireEvent.press(screen.getByLabelText("Beta"))
        // The play button appears once the live preview URL resolves.
        fireEvent.press(await screen.findByLabelText("Play Beta preview"))

        expect(mockToggle).toHaveBeenCalled()
    })

    it("uses by-song preview lazily for saved Apple bloom cards", async () => {
        const savedAppleBeta: RankingResponse = {
            ...BETA,
            song: {
                ...BETA.song,
                deezer_id: null,
                provider: "apple",
                preview_url: null,
                preview_available: true,
                apple_view_url: null,
            },
        }
        mockRouteRankings = [ALPHA, savedAppleBeta, GAMMA]

        render(<RankMapScreen />)

        fireEvent.press(screen.getByLabelText("Beta"))
        expect(mockFetchPreviewUrl).not.toHaveBeenCalled()
        expect(mockFetchPreviewUrlBySongId).not.toHaveBeenCalled()

        await act(async () => {
            fireEvent.press(await screen.findByLabelText("Play Beta preview"))
        })

        await waitFor(() => {
            expect(mockFetchPreviewUrlBySongId).toHaveBeenCalledWith(2, "test-token")
        })
    })

    it("goes back when the back control is pressed", () => {
        render(<RankMapScreen />)

        fireEvent.press(screen.getByLabelText("Back"))

        expect(mockGoBack).toHaveBeenCalled()
    })
})
