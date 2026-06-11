// Tests for Rankings screen navigation behavior.
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import RankingsScreen from "../RankingsScreen"
import { RankingResponse } from "../../comparison/types"

const mockNavigate = jest.fn()
const mockListMyRankings = jest.fn()
const mockGetMyRankingAnchors = jest.fn()
const mockListMyVersusHistory = jest.fn()

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
    listMyVersusHistory: (...args: unknown[]) => mockListMyVersusHistory(...args),
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
    mockListMyVersusHistory.mockResolvedValue({ receipts: [] })
})

describe("RankingsScreen", () => {
    it("opens the full Rankings and filter screen", async () => {
        mockListMyRankings.mockResolvedValue({
            rankings: [ranking],
            next_cursor: null,
        })

        render(<RankingsScreen />)

        fireEvent.press(await screen.findByLabelText("View All / Filter Rankings"))

        expect(mockNavigate).toHaveBeenCalledWith("FullRankings")
    })

    it("navigates to SongDetail with the full ranking when an orbit song is tapped", async () => {
        // Rank map unlocks at 10 songs; provide 10 to show the orbit.
        const tenRankings = Array.from({ length: 10 }, (_, i) => ({
            ...ranking,
            id: i + 1,
            position: i + 1,
            score: 9.4 - i * 0.3,
        }))
        mockListMyRankings.mockResolvedValue({ rankings: tenRankings, next_cursor: null })

        render(<RankingsScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("ranking-orbit-1")).toBeTruthy()
        })
        fireEvent.press(screen.getByTestId("ranking-orbit-1"))

        expect(mockNavigate).toHaveBeenCalledWith("SongDetail", { ranking: tenRankings[0] })
    })

    it("renders the Versus History empty state and navigates via LOG link", async () => {
        mockListMyRankings.mockResolvedValue({
            rankings: [ranking],
            next_cursor: null,
        })

        render(<RankingsScreen />)

        await waitFor(() => {
            expect(screen.getByText("No match-ups yet")).toBeTruthy()
        })
        expect(screen.getByText("As you rate, LISTn pits each song against others to place it — those head-to-heads land here.")).toBeTruthy()
        fireEvent.press(screen.getByText("LOG ↗"))

        expect(mockNavigate).toHaveBeenCalledWith("VersusHistory")
    })

    it("renders preview rows below the separator and navigates to SongDetail on tap", async () => {
        mockListMyRankings.mockResolvedValue({
            rankings: [ranking],
            next_cursor: null,
        })

        render(<RankingsScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("ranking-preview-row-7")).toBeTruthy()
        })
        fireEvent.press(screen.getByTestId("ranking-preview-row-7"))

        expect(mockNavigate).toHaveBeenCalledWith("SongDetail", { ranking })
    })

    it("shows 3 empty anchor cards when requirements not met (only Like rated)", async () => {
        mockListMyRankings.mockResolvedValue({
            rankings: [ranking],
            next_cursor: null,
        })

        render(<RankingsScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("anchors-locked")).toBeTruthy()
        })
        expect(screen.queryByTestId("anchors-unlocked")).toBeNull()
        expect(screen.getByText("TOP · LIKE")).toBeTruthy()
        expect(screen.getByText("MEDIAN · OKAY")).toBeTruthy()
        expect(screen.getByText("FLOOR · DISLIKE")).toBeTruthy()
        expect(screen.getByText("1/1")).toBeTruthy()   // like: 1 of 1 required
        expect(screen.getByText("0/3")).toBeTruthy()   // okay: 0 of 3 required
        expect(screen.getByText("0/1")).toBeTruthy()   // dislike: 0 of 1 required
    })

    it("shows empty anchor cards when only Like is rated (Top Like not revealed)", async () => {
        mockListMyRankings.mockResolvedValue({
            rankings: [ranking],
            next_cursor: null,
        })
        mockGetMyRankingAnchors.mockResolvedValue({
            top_like: ranking,
            median_okay: null,
            lowest_dislike: null,
        })

        render(<RankingsScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("anchors-locked")).toBeTruthy()
        })
        expect(screen.getByText("TOP · LIKE")).toBeTruthy()
        expect(screen.getByText("1/1")).toBeTruthy()   // like: 1 of 1 required, shown as fraction
    })

    it("shows empty anchor cards with Like + Dislike but fewer than 3 Okay ratings", async () => {
        const okayRanking: RankingResponse = { ...ranking, id: 10, bucket: "alright" }
        const dislikeRanking: RankingResponse = { ...ranking, id: 11, bucket: "dislike" }
        mockListMyRankings.mockResolvedValue({
            rankings: [ranking, okayRanking, dislikeRanking],
            next_cursor: null,
        })

        render(<RankingsScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("anchors-locked")).toBeTruthy()
        })
        expect(screen.queryByTestId("anchors-unlocked")).toBeNull()
        expect(screen.getByText("1/3")).toBeTruthy()   // okay: 1 of 3 required, shown as fraction
    })

    it("shows all three anchors when all requirements are met", async () => {
        const okayRanking1: RankingResponse = { ...ranking, id: 10, bucket: "alright" }
        const okayRanking2: RankingResponse = { ...ranking, id: 11, bucket: "alright" }
        const okayRanking3: RankingResponse = { ...ranking, id: 12, bucket: "alright" }
        const dislikeRanking: RankingResponse = {
            ...ranking,
            id: 13,
            bucket: "dislike",
            song: { ...ranking.song, title: "Bad Song" },
        }
        mockListMyRankings.mockResolvedValue({
            rankings: [ranking, okayRanking1, okayRanking2, okayRanking3, dislikeRanking],
            next_cursor: null,
        })
        mockGetMyRankingAnchors.mockResolvedValue({
            top_like: ranking,
            median_okay: okayRanking2,
            lowest_dislike: dislikeRanking,
        })

        render(<RankingsScreen />)

        await waitFor(() => {
            expect(screen.getByTestId("anchors-unlocked")).toBeTruthy()
        })
        expect(screen.queryByTestId("anchors-locked")).toBeNull()
        expect(screen.getByText("TOP · LIKE")).toBeTruthy()
        expect(screen.getByText("MEDIAN · OKAY")).toBeTruthy()
        expect(screen.getByText("FLOOR · DISLIKE")).toBeTruthy()
        expect(screen.getByText("Bad Song")).toBeTruthy()
        expect(mockGetMyRankingAnchors).toHaveBeenCalledWith("test-token")
    })
})
