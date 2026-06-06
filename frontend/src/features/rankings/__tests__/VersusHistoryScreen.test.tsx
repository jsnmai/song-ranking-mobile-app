import { fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import { ApiError } from "../../../api/client"
import VersusHistoryScreen from "../VersusHistoryScreen"
import { ComparisonHistoryReceipt } from "../types"

const mockGoBack = jest.fn()
const mockListMyVersusHistory = jest.fn()

jest.mock("@shopify/flash-list", () => {
    const React = require("react")
    const { View } = require("react-native")

    return {
        FlashList: ({ data, renderItem, keyExtractor }: {
            data: ComparisonHistoryReceipt[];
            renderItem: ({ item }: { item: ComparisonHistoryReceipt }) => unknown;
            keyExtractor: (item: ComparisonHistoryReceipt) => string;
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
    listMyVersusHistory: (...args: unknown[]) => mockListMyVersusHistory(...args),
}))

jest.mock("../../../utils/formatRelativeTime", () => ({
    formatRelativeTime: () => "Yesterday",
}))

const navigation = {
    goBack: mockGoBack,
}

const receipt: ComparisonHistoryReceipt = {
    id: 9,
    winner_song_id: 42,
    winner_title: "Nights",
    winner_artist: "Frank Ocean",
    winner_cover_url: "https://example.com/winner.jpg",
    loser_song_id: 43,
    loser_title: "Pink + White",
    loser_artist: "Frank Ocean",
    loser_cover_url: "https://example.com/loser.jpg",
    bucket: "like",
    decision_duration_ms: 1834,
    comparison_session_uuid: "f779d354-6dbd-4ce8-bd63-57989e7aa334",
    comparison_index_in_session: 2,
    finalized_at: "2026-06-05T12:00:00Z",
}

beforeEach(() => {
    jest.resetAllMocks()
})

describe("VersusHistoryScreen", () => {
    it("renders receipt rows with winner, loser, bucket, duration, and date", async () => {
        mockListMyVersusHistory.mockResolvedValue({ receipts: [receipt] })

        render(<VersusHistoryScreen navigation={navigation as never} route={{} as never} />)

        await waitFor(() => {
            expect(screen.getByText("Nights beat Pink + White")).toBeTruthy()
        })
        expect(screen.getByText("WINNER")).toBeTruthy()
        expect(screen.getByText("LOSER")).toBeTruthy()
        expect(screen.getAllByText("Frank Ocean")).toHaveLength(2)
        expect(screen.getByText("Like")).toBeTruthy()
        expect(screen.getByText("1.8 sec")).toBeTruthy()
        expect(screen.getByText("Yesterday")).toBeTruthy()
        expect(mockListMyVersusHistory).toHaveBeenCalledWith("test-token")
    })

    it("renders the empty state", async () => {
        mockListMyVersusHistory.mockResolvedValue({ receipts: [] })

        render(<VersusHistoryScreen navigation={navigation as never} route={{} as never} />)

        await waitFor(() => {
            expect(screen.getByText("No comparisons yet.")).toBeTruthy()
        })
    })

    it("renders loading while history is pending", () => {
        mockListMyVersusHistory.mockReturnValue(new Promise(() => undefined))

        render(<VersusHistoryScreen navigation={navigation as never} route={{} as never} />)

        expect(screen.getByLabelText("Loading Versus History")).toBeTruthy()
    })

    it("renders an error and retries normally", async () => {
        mockListMyVersusHistory
            .mockRejectedValueOnce(new ApiError(500, "Could not load Versus History.", null))
            .mockResolvedValueOnce({ receipts: [] })

        render(<VersusHistoryScreen navigation={navigation as never} route={{} as never} />)

        await waitFor(() => {
            expect(screen.getByText("Could not load Versus History.")).toBeTruthy()
        })
        fireEvent.press(screen.getByText("Try again"))

        await waitFor(() => {
            expect(screen.getByText("No comparisons yet.")).toBeTruthy()
        })
        expect(mockListMyVersusHistory).toHaveBeenCalledTimes(2)
    })
})
