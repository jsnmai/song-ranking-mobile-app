import { fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import SavedSongsScreen from "../SavedSongsScreen"
import { SavedSong } from "../types"

const mockGoBack = jest.fn()
const mockNavigate = jest.fn()
const mockListMySavedSongs = jest.fn()

jest.mock("@shopify/flash-list", () => {
    const React = require("react")
    const { View } = require("react-native")

    return {
        FlashList: ({ data, renderItem, keyExtractor }: {
            data: SavedSong[];
            renderItem: ({ item }: { item: SavedSong }) => unknown;
            keyExtractor: (item: SavedSong) => string;
        }) => (
            <View>
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
    }),
}))

jest.mock("../apiRequests", () => ({
    listMySavedSongs: (...args: unknown[]) => mockListMySavedSongs(...args),
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

const savedSong = {
    id: 7,
    source: "song_detail",
    saved_at: "2026-01-01T00:00:00Z",
    song,
    ranking: null,
}

const navigation = {
    goBack: mockGoBack,
    navigate: mockNavigate,
}

beforeEach(() => {
    jest.resetAllMocks()
})

describe("SavedSongsScreen", () => {
    it("renders a loading state while Saved Songs are requested", () => {
        mockListMySavedSongs.mockReturnValue(new Promise(() => {}))

        render(<SavedSongsScreen navigation={navigation as never} route={{} as never} />)

        expect(screen.getByLabelText("Loading Saved Songs")).toBeTruthy()
    })

    it("renders saved songs and opens unrated Song Detail", async () => {
        mockListMySavedSongs.mockResolvedValue({ saves: [savedSong] })

        render(<SavedSongsScreen navigation={navigation as never} route={{} as never} />)

        expect(await screen.findByText("Nights")).toBeTruthy()
        expect(screen.getByText("Frank Ocean")).toBeTruthy()

        fireEvent.press(screen.getByLabelText("Open Nights"))

        expect(mockNavigate).toHaveBeenCalledWith("SongDetail", { song })
    })

    it("opens rated songs with their current ranking", async () => {
        const ranking = {
            id: 9,
            song_id: song.id,
            bucket: "like",
            position: 1,
            score: 9.4,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            song,
        }
        mockListMySavedSongs.mockResolvedValue({
            saves: [{ ...savedSong, ranking }],
        })

        render(<SavedSongsScreen navigation={navigation as never} route={{} as never} />)
        fireEvent.press(await screen.findByLabelText("Open Nights"))

        expect(mockNavigate).toHaveBeenCalledWith("SongDetail", { ranking })
    })

    it("renders the empty state", async () => {
        mockListMySavedSongs.mockResolvedValue({ saves: [] })

        render(<SavedSongsScreen navigation={navigation as never} route={{} as never} />)

        expect(await screen.findByText("Songs you save will show up here.")).toBeTruthy()
    })

    it("renders an error and retries normally", async () => {
        mockListMySavedSongs
            .mockRejectedValueOnce(new Error("Could not load Saved Songs."))
            .mockResolvedValueOnce({ saves: [] })

        render(<SavedSongsScreen navigation={navigation as never} route={{} as never} />)

        fireEvent.press(await screen.findByText("Try again"))

        await waitFor(() => {
            expect(mockListMySavedSongs).toHaveBeenCalledTimes(2)
        })
        expect(await screen.findByText("Songs you save will show up here.")).toBeTruthy()
    })
})
