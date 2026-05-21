// Tests for Rankings screen navigation behavior.
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import RankingsScreen from "../RankingsScreen"
import { RankingResponse } from "../../comparison/types"

const mockNavigate = jest.fn()
const mockListMyRankings = jest.fn()

jest.mock("@react-navigation/native", () => {
    const actual = jest.requireActual("@react-navigation/native")
    const React = require("react")

    return {
        ...actual,
        useNavigation: () => ({
            navigate: mockNavigate,
        }),
        useFocusEffect: (callback: () => void) => {
            React.useEffect(() => {
                callback()
            }, [])
        },
    }
})

jest.mock("@shopify/flash-list", () => {
    const React = require("react")
    const { View } = require("react-native")

    return {
        FlashList: ({ data, renderItem, keyExtractor }: {
            data: RankingResponse[];
            renderItem: ({ item }: { item: RankingResponse }) => unknown;
            keyExtractor: (item: RankingResponse) => string;
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
    listMyRankings: (...args: unknown[]) => mockListMyRankings(...args),
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

beforeEach(() => {
    jest.resetAllMocks()
})

describe("RankingsScreen", () => {
    it("navigates to SongDetail with the full ranking when a row is tapped", async () => {
        mockListMyRankings.mockResolvedValue({
            rankings: [ranking],
            next_cursor: null,
        })

        render(<RankingsScreen />)

        await waitFor(() => {
            expect(screen.getByText("Nights")).toBeTruthy()
        })
        fireEvent.press(screen.getByTestId("ranking-row-7"))

        expect(mockNavigate).toHaveBeenCalledWith("SongDetail", { ranking })
    })

    it("navigates to Reorder when the header button is tapped", async () => {
        mockListMyRankings.mockResolvedValue({
            rankings: [ranking],
            next_cursor: null,
        })

        render(<RankingsScreen />)

        await waitFor(() => {
            expect(screen.getByText("Nights")).toBeTruthy()
        })
        fireEvent.press(screen.getByText("Reorder"))

        expect(mockNavigate).toHaveBeenCalledWith("Reorder")
    })
})
