// Tests for Feed screen navigation behavior.
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import { ApiError } from "../../../api/client"
import { RankingResponse } from "../../comparison/types"
import FeedScreen from "../FeedScreen"
import { FeedEvent } from "../types"

const mockNavigate = jest.fn()
const mockListMyFeed = jest.fn()
const mockGetMyRankingByDeezerId = jest.fn()

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
            data: FeedEvent[];
            renderItem: ({ item }: { item: FeedEvent }) => unknown;
            keyExtractor: (item: FeedEvent) => string;
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
    listMyFeed: (...args: unknown[]) => mockListMyFeed(...args),
}))

jest.mock("../../rankings/apiRequests", () => ({
    getMyRankingByDeezerId: (...args: unknown[]) => mockGetMyRankingByDeezerId(...args),
}))

// Plain function — not a jest.fn() — so jest.resetAllMocks() in beforeEach cannot clear it.
jest.mock("../../../utils/formatRelativeTime", () => ({
    formatRelativeTime: () => "3 hrs ago",
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
    created_at: "2026-01-01T00:00:00Z",
}

const feedEvent: FeedEvent = {
    id: 9,
    event_type: "rated",
    new_bucket: "like",
    new_score: 8.75,
    note: null,
    created_at: "2026-01-01T00:00:00Z",
    actor_profile: {
        id: 3,
        user_id: 4,
        username: "maya",
        display_name: "Maya",
        is_public: true,
        created_at: "2026-01-01T00:00:00Z",
    },
    song,
}

const ranking: RankingResponse = {
    id: 7,
    song_id: 42,
    bucket: "like",
    position: 1,
    score: 9.4,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    song,
}

beforeEach(() => {
    jest.resetAllMocks()
})

describe("FeedScreen", () => {
    it("opens feed songs in rated Song Detail when the current user has a ranking", async () => {
        mockListMyFeed.mockResolvedValue({
            events: [feedEvent],
            next_cursor: null,
        })
        mockGetMyRankingByDeezerId.mockResolvedValue(ranking)

        render(<FeedScreen />)

        await waitFor(() => {
            expect(screen.getByText("Nights")).toBeTruthy()
        })
        fireEvent.press(screen.getByTestId("feed-row-9"))

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith("SongDetail", { ranking })
        })
    })

    it("opens feed songs in unrated Song Detail when the current user has no ranking", async () => {
        mockListMyFeed.mockResolvedValue({
            events: [feedEvent],
            next_cursor: null,
        })
        mockGetMyRankingByDeezerId.mockRejectedValue(new ApiError(404, "Rating not found.", null))

        render(<FeedScreen />)

        await waitFor(() => {
            expect(screen.getByText("Nights")).toBeTruthy()
        })
        fireEvent.press(screen.getByTestId("feed-row-9"))

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith("SongDetail", { song })
        })
    })

    it("shows a formatted relative timestamp below the actor username for each feed event", async () => {
        mockListMyFeed.mockResolvedValue({
            events: [feedEvent],
            next_cursor: null,
        })

        render(<FeedScreen />)

        await waitFor(() => {
            expect(screen.getByText("3 hrs ago")).toBeTruthy()
        })
    })

    it("opens Discover user search from the empty state", async () => {
        mockListMyFeed.mockResolvedValue({
            events: [],
            next_cursor: null,
        })

        render(<FeedScreen />)

        await waitFor(() => {
            expect(screen.getByText("Your feed is quiet")).toBeTruthy()
        })
        fireEvent.press(screen.getByText("Find users"))

        expect(mockNavigate).toHaveBeenCalledWith("Discover", {
            focusSearch: true,
            searchMode: "users",
        })
    })
})
