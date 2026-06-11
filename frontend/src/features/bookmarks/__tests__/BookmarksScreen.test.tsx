import { fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import BookmarksScreen from "../BookmarksScreen"
import { Bookmark } from "../types"

const mockGoBack = jest.fn()
const mockNavigate = jest.fn()
const mockListMyBookmarks = jest.fn()

jest.mock("@shopify/flash-list", () => {
    const React = require("react")
    const { View } = require("react-native")

    return {
        FlashList: ({ data, renderItem, keyExtractor }: {
            data: Bookmark[];
            renderItem: ({ item }: { item: Bookmark }) => unknown;
            keyExtractor: (item: Bookmark) => string;
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
    listMyBookmarks: (...args: unknown[]) => mockListMyBookmarks(...args),
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

const bookmark = {
    id: 7,
    source: "song_detail",
    bookmarked_at: "2026-01-01T00:00:00Z",
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

describe("BookmarksScreen", () => {
    it("renders a loading state while Bookmarks are requested", () => {
        mockListMyBookmarks.mockReturnValue(new Promise(() => {}))

        render(<BookmarksScreen navigation={navigation as never} route={{} as never} />)

        expect(screen.getByLabelText("Loading Bookmarks")).toBeTruthy()
    })

    it("renders bookmarks and opens unrated Song Detail", async () => {
        mockListMyBookmarks.mockResolvedValue({ bookmarks: [bookmark] })

        render(<BookmarksScreen navigation={navigation as never} route={{} as never} />)

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
        mockListMyBookmarks.mockResolvedValue({
            bookmarks: [{ ...bookmark, ranking }],
        })

        render(<BookmarksScreen navigation={navigation as never} route={{} as never} />)
        fireEvent.press(await screen.findByLabelText("Open Nights"))

        expect(mockNavigate).toHaveBeenCalledWith("SongDetail", { ranking })
    })

    it("renders the empty state", async () => {
        mockListMyBookmarks.mockResolvedValue({ bookmarks: [] })

        render(<BookmarksScreen navigation={navigation as never} route={{} as never} />)

        expect(await screen.findByText("NOTHING SAVED YET")).toBeTruthy()
    })

    it("renders an error and retries normally", async () => {
        mockListMyBookmarks
            .mockRejectedValueOnce(new Error("Could not load Bookmarks."))
            .mockResolvedValueOnce({ bookmarks: [] })

        render(<BookmarksScreen navigation={navigation as never} route={{} as never} />)

        fireEvent.press(await screen.findByText("Try again"))

        await waitFor(() => {
            expect(mockListMyBookmarks).toHaveBeenCalledTimes(2)
        })
        expect(await screen.findByText("NOTHING SAVED YET")).toBeTruthy()
    })
})
