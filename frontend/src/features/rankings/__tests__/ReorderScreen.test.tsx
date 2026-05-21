// Tests for the Phase 7 reorder screen save/cancel behavior.
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import ReorderScreen from "../ReorderScreen"
import { RankingResponse } from "../../comparison/types"

const mockGoBack = jest.fn()
const mockListMyRankings = jest.fn()
const mockReorderRankings = jest.fn()

jest.mock("../../auth/AuthContext", () => ({
    useAuth: () => ({
        token: "test-token",
    }),
}))

jest.mock("../apiRequests", () => ({
    listMyRankings: (...args: unknown[]) => mockListMyRankings(...args),
    reorderRankings: (...args: unknown[]) => mockReorderRankings(...args),
}))

const likeRanking = rankingFixture({
    id: 1,
    songId: 42,
    title: "Nights",
    bucket: "like",
})
const alrightRanking = rankingFixture({
    id: 2,
    songId: 43,
    title: "Pink + White",
    bucket: "alright",
})

const navigation = {
    goBack: mockGoBack,
}

beforeEach(() => {
    jest.resetAllMocks()
})

describe("ReorderScreen", () => {
    it("loads rankings and saves the full ordered payload", async () => {
        mockListMyRankings.mockResolvedValue({
            rankings: [likeRanking, alrightRanking],
            next_cursor: null,
        })
        mockReorderRankings.mockResolvedValue({ rankings: [], rating_events: [] })

        render(<ReorderScreen navigation={navigation as never} route={{} as never} />)

        await waitFor(() => {
            expect(screen.getByText("Nights")).toBeTruthy()
        }, { timeout: 3000 })
        fireEvent.press(screen.getByText("Save"))

        await waitFor(() => {
            expect(mockReorderRankings).toHaveBeenCalledWith(
                [
                    { song_id: 42, bucket: "like" },
                    { song_id: 43, bucket: "alright" },
                ],
                "test-token",
            )
        })
        expect(mockGoBack).toHaveBeenCalled()
    })

    it("cancels without saving", async () => {
        mockListMyRankings.mockResolvedValue({
            rankings: [likeRanking],
            next_cursor: null,
        })

        render(<ReorderScreen navigation={navigation as never} route={{} as never} />)

        await waitFor(() => {
            expect(screen.getByText("Nights")).toBeTruthy()
        }, { timeout: 3000 })
        fireEvent.press(screen.getByText("Cancel"))

        expect(mockReorderRankings).not.toHaveBeenCalled()
        expect(mockGoBack).toHaveBeenCalled()
    })
})

function rankingFixture({
    id,
    songId,
    title,
    bucket,
}: {
    id: number;
    songId: number;
    title: string;
    bucket: RankingResponse["bucket"];
}): RankingResponse {
    return {
        id,
        song_id: songId,
        bucket,
        position: id,
        score: 9,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        song: {
            id: songId,
            deezer_id: songId,
            isrc: "USUG11900842",
            title,
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
}
