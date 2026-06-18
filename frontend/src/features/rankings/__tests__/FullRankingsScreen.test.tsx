import { fireEvent, render, screen, within } from "@testing-library/react-native"

import FullRankingsScreen from "../FullRankingsScreen"
import { RankingResponse } from "../../comparison/types"

const mockGoBack = jest.fn()
const mockNavigate = jest.fn()
const mockListMyRankings = jest.fn()

jest.mock("@react-navigation/native", () => {
    const actual = jest.requireActual("@react-navigation/native")
    const React = require("react")

    return {
        ...actual,
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
            renderItem: ({ item, index }: { item: RankingResponse; index: number }) => unknown;
            keyExtractor: (item: RankingResponse) => string;
        }) => (
            <View>
                {data.map((item, index) => (
                    <View key={keyExtractor(item)}>{renderItem({ item, index })}</View>
                ))}
            </View>
        ),
    }
})

jest.mock("../../auth/AuthContext", () => ({
    // rated_count >= 10 → scores/positions unlocked, so numbering shows as numbers.
    useAuth: () => ({ token: "test-token", profile: { user_stats: { rated_count: 50 } } }),
}))

jest.mock("../apiRequests", () => ({
    listMyRankings: (...args: unknown[]) => mockListMyRankings(...args),
}))

function makeRanking(
    id: number,
    title: string,
    artist: string,
    album: string,
    bucket: RankingResponse["bucket"],
    position: number,
): RankingResponse {
    return {
        id,
        song_id: id + 100,
        bucket,
        position,
        score: 10 - position,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        song: {
            id: id + 100,
            deezer_id: id + 1000,
            isrc: "",
            title,
            artist,
            artist_deezer_id: id + 2000,
            album,
            cover_url: "",
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
    }
}

const likeRanking = makeRanking(7, "Nights", "Frank Ocean", "Blonde", "like", 1)
const okayRanking = makeRanking(8, "Alright", "Kendrick Lamar", "DAMN.", "alright", 2)
const dislikeRanking = makeRanking(9, "Bad Religion", "Frank Ocean", "channel ORANGE", "dislike", 3)
const extraRanking1 = makeRanking(10, "Solar Power", "Lorde", "Solar Power", "like", 4)
const extraRanking2 = makeRanking(11, "See You Again", "Tyler, the Creator", "Flower Boy", "dislike", 5)
const rankings = [likeRanking, okayRanking, dislikeRanking, extraRanking1, extraRanking2]
const navigation = { goBack: mockGoBack, navigate: mockNavigate }

beforeEach(() => {
    jest.resetAllMocks()
    mockListMyRankings.mockResolvedValue({ rankings, next_cursor: null })
})

describe("FullRankingsScreen", () => {
    it("renders a back button, reorder button, bucket tabs, and filter button", async () => {
        render(<FullRankingsScreen navigation={navigation as never} route={{} as never} />)

        expect(await screen.findByText("All Rankings")).toBeTruthy()
        expect(screen.getByLabelText("Go back")).toBeTruthy()
        expect(screen.getByLabelText("Reorder rankings")).toBeTruthy()
        expect(screen.getByLabelText("Filter bucket All")).toBeTruthy()
        expect(screen.getByLabelText("Open rankings filters")).toBeTruthy()

        fireEvent.press(screen.getByLabelText("Go back"))
        expect(mockGoBack).toHaveBeenCalled()

        fireEvent.press(screen.getByLabelText("Reorder rankings"))
        expect(mockNavigate).toHaveBeenCalledWith("Reorder")
    })

    it("filters buckets with contiguous display numbering", async () => {
        render(<FullRankingsScreen navigation={navigation as never} route={{} as never} />)

        fireEvent.press(await screen.findByLabelText("Filter bucket Okay"))

        expect(screen.getByTestId("full-ranking-row-8")).toBeTruthy()
        expect(screen.queryByTestId("full-ranking-row-7")).toBeNull()
        expect(within(screen.getByTestId("full-ranking-row-8")).getByText("1")).toBeTruthy()
    })

    it("opens one filter modal and filters by artist and album", async () => {
        render(<FullRankingsScreen navigation={navigation as never} route={{} as never} />)

        fireEvent.press(await screen.findByLabelText("Open rankings filters"))
        expect(screen.getByText("ARTIST")).toBeTruthy()
        expect(screen.getByText("ALBUM")).toBeTruthy()

        fireEvent.press(screen.getByLabelText("Select filter Frank Ocean"))
        expect(screen.getByTestId("full-ranking-row-7")).toBeTruthy()
        expect(screen.getByTestId("full-ranking-row-9")).toBeTruthy()
        expect(screen.queryByTestId("full-ranking-row-8")).toBeNull()

        fireEvent.press(screen.getByLabelText("Select filter Blonde"))
        expect(screen.getByTestId("full-ranking-row-7")).toBeTruthy()
        expect(screen.queryByTestId("full-ranking-row-9")).toBeNull()
    })

    it("loads all cursor pages and keeps original Rankings data intact", async () => {
        mockListMyRankings
            .mockResolvedValueOnce({ rankings: [likeRanking, okayRanking, extraRanking1, extraRanking2], next_cursor: "7.5:8" })
            .mockResolvedValueOnce({ rankings: [dislikeRanking], next_cursor: null })

        render(<FullRankingsScreen navigation={navigation as never} route={{} as never} />)

        fireEvent.press(await screen.findByLabelText("Open rankings filters"))
        fireEvent.press(screen.getByLabelText("Select filter Frank Ocean"))
        fireEvent.press(screen.getByText("Done"))

        expect(within(screen.getByTestId("full-ranking-row-7")).getByText("1")).toBeTruthy()
        expect(within(screen.getByTestId("full-ranking-row-9")).getByText("2")).toBeTruthy()
        expect(mockListMyRankings).toHaveBeenNthCalledWith(2, "test-token", "7.5:8")

        fireEvent.press(screen.getByTestId("full-ranking-row-9"))
        expect(mockNavigate).toHaveBeenCalledWith("SongDetail", { ranking: dislikeRanking })
        expect(dislikeRanking.position).toBe(3)
    })

    it("shows empty state and clears combined filters", async () => {
        render(<FullRankingsScreen navigation={navigation as never} route={{} as never} />)

        fireEvent.press(await screen.findByLabelText("Open rankings filters"))
        fireEvent.press(screen.getByLabelText("Select filter Kendrick Lamar"))
        fireEvent.press(screen.getByText("Done"))
        fireEvent.press(screen.getByLabelText("Filter bucket Like"))

        expect(screen.getByText("No songs match these filters.")).toBeTruthy()

        fireEvent.press(screen.getByText("Clear"))
        expect(screen.getByTestId("full-ranking-row-7")).toBeTruthy()
        expect(screen.getByTestId("full-ranking-row-8")).toBeTruthy()
        expect(screen.getByTestId("full-ranking-row-9")).toBeTruthy()
    })
})
