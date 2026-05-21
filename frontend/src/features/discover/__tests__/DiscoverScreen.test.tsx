// Tests for Discover search navigation into Song Detail.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import { ApiError } from "../../../api/client"
import DiscoverScreen from "../DiscoverScreen"

const mockNavigate = jest.fn()
const mockSetParams = jest.fn()
const mockSearchSongs = jest.fn()
const mockSearchProfiles = jest.fn()
const mockGetMyRankingByDeezerId = jest.fn()

jest.mock("@react-navigation/native", () => ({
    useNavigation: () => ({
        navigate: mockNavigate,
        setParams: mockSetParams,
    }),
    useRoute: () => ({
        params: undefined,
    }),
}))

jest.mock("../../auth/AuthContext", () => ({
    useAuth: () => ({
        token: "test-token",
    }),
}))

jest.mock("../../search/apiRequests", () => ({
    searchSongs: (...args: unknown[]) => mockSearchSongs(...args),
}))

jest.mock("../../profile/apiRequests", () => ({
    searchProfiles: (...args: unknown[]) => mockSearchProfiles(...args),
}))

jest.mock("../../rankings/apiRequests", () => ({
    getMyRankingByDeezerId: (...args: unknown[]) => mockGetMyRankingByDeezerId(...args),
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
        created_at: "2026-01-01T00:00:00Z",
    },
}

const profile = {
    id: 3,
    user_id: 4,
    username: "jasonmai",
    display_name: "Jason Mai",
    is_public: true,
    created_at: "2026-01-01T00:00:00Z",
    follower_count: 12,
    following_count: 8,
    is_following: false,
    is_own_profile: false,
}

beforeEach(() => {
    jest.useFakeTimers()
    jest.resetAllMocks()
    mockSearchSongs.mockResolvedValue({ results: [song] })
    mockSearchProfiles.mockResolvedValue({ results: [profile] })
})

afterEach(() => {
    jest.useRealTimers()
})

describe("DiscoverScreen", () => {
    it("opens unrated search results in Song Detail", async () => {
        mockGetMyRankingByDeezerId.mockRejectedValue(new ApiError(404, "Rating not found.", null))
        render(<DiscoverScreen />)

        fireEvent.changeText(screen.getByPlaceholderText("Search for a song..."), "nights")
        act(() => {
            jest.advanceTimersByTime(350)
        })

        const result = await screen.findByText("Nights")
        fireEvent.press(result)

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith("SongDetail", { song })
        })
    })

    it("opens already-rated search results in Song Detail with rating actions", async () => {
        mockGetMyRankingByDeezerId.mockResolvedValue(ranking)
        render(<DiscoverScreen />)

        fireEvent.changeText(screen.getByPlaceholderText("Search for a song..."), "nights")
        act(() => {
            jest.advanceTimersByTime(350)
        })

        const result = await screen.findByText("Nights")
        fireEvent.press(result)

        await waitFor(() => {
            expect(mockGetMyRankingByDeezerId).toHaveBeenCalledWith(123, "test-token")
            expect(mockNavigate).toHaveBeenCalledWith("SongDetail", { ranking })
        })
    })

    it("switches to user search and opens another user's profile", async () => {
        render(<DiscoverScreen />)

        fireEvent.press(screen.getByText("Users"))
        fireEvent.changeText(screen.getByPlaceholderText("Search for a user..."), "jason")
        act(() => {
            jest.advanceTimersByTime(350)
        })

        const result = await screen.findByText("Jason Mai")
        fireEvent.press(result)

        expect(mockSearchProfiles).toHaveBeenCalledWith("jason", "test-token")
        expect(mockNavigate).toHaveBeenCalledWith("OtherProfile", { username: "jasonmai" })
    })
})
