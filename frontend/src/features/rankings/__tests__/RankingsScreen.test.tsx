// Tests for Rankings screen navigation behavior.
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import RankingsScreen from "../RankingsScreen"
import { RankingResponse } from "../../comparison/types"

const mockNavigate = jest.fn()
const mockListMyRankings = jest.fn()
const mockGetMyRankingAnchors = jest.fn()

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
        FlashList: ({ data, renderItem, keyExtractor, ListHeaderComponent }: {
            data: RankingResponse[];
            renderItem: ({ item, index }: { item: RankingResponse; index: number }) => unknown;
            keyExtractor: (item: RankingResponse) => string;
            ListHeaderComponent?: React.ReactElement | null;
        }) => (
            <View>
                {ListHeaderComponent ?? null}
                {data.map((item, index) => (
                    <View key={keyExtractor(item)}>
                        {renderItem({ item, index })}
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
    getMyRankingAnchors: (...args: unknown[]) => mockGetMyRankingAnchors(...args),
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
    mockGetMyRankingAnchors.mockResolvedValue({
        top_like: null,
        median_okay: null,
        lowest_dislike: null,
    })
})

describe("RankingsScreen", () => {
    it("navigates to SongDetail with the full ranking when a row is tapped", async () => {
        mockListMyRankings.mockResolvedValue({
            rankings: [ranking],
            next_cursor: null,
        })

        render(<RankingsScreen />)

        await waitFor(() => {
            expect(screen.getAllByText("Nights").length).toBeGreaterThan(0)
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
            expect(screen.getAllByText("Nights").length).toBeGreaterThan(0)
        })
        fireEvent.press(screen.getByText("Reorder"))

        expect(mockNavigate).toHaveBeenCalledWith("Reorder")
    })

    it("renders the Versus History entry point and navigates to it", async () => {
        mockListMyRankings.mockResolvedValue({
            rankings: [ranking],
            next_cursor: null,
        })

        render(<RankingsScreen />)

        await waitFor(() => {
            expect(screen.getByText("See your recent head-to-head decisions")).toBeTruthy()
        })
        fireEvent.press(screen.getByLabelText("Open Versus History"))

        expect(mockNavigate).toHaveBeenCalledWith("VersusHistory")
    })

    it("renders populated and missing Anchors", async () => {
        mockListMyRankings.mockResolvedValue({
            rankings: [ranking],
            next_cursor: null,
        })
        mockGetMyRankingAnchors.mockResolvedValue({
            top_like: ranking,
            median_okay: null,
            lowest_dislike: {
                ...ranking,
                id: 8,
                song_id: 43,
                bucket: "dislike",
                position: 1,
                score: 2.0,
                song: {
                    ...ranking.song,
                    id: 43,
                    deezer_id: 124,
                    title: "Bad Song",
                    artist: "The Skips",
                },
            },
        })

        render(<RankingsScreen />)

        await waitFor(() => {
            expect(screen.getByText("Anchors")).toBeTruthy()
        })
        expect(screen.getByText("Top Like")).toBeTruthy()
        expect(screen.getByText("Median Okay")).toBeTruthy()
        expect(screen.getByText("Lowest Dislike")).toBeTruthy()
        expect(screen.getAllByText("Nights").length).toBeGreaterThan(0)
        expect(screen.getByText("Bad Song")).toBeTruthy()
        expect(screen.getByText("No Okay ratings yet.")).toBeTruthy()
        expect(mockGetMyRankingAnchors).toHaveBeenCalledWith("test-token")
    })
})
