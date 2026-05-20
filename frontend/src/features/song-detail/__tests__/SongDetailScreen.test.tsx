// Tests for Song Detail remove-rating behavior.
import { Alert, AlertButton } from "react-native"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import SongDetailScreen from "../SongDetailScreen"
import { RankingResponse } from "../../comparison/types"

const mockGoBack = jest.fn()
const mockNavigate = jest.fn()
const mockRemoveRating = jest.fn()

jest.mock("../../auth/AuthContext", () => ({
    useAuth: () => ({
        token: "test-token",
    }),
}))

jest.mock("../../comparison/apiRequests", () => ({
    removeRating: (...args: unknown[]) => mockRemoveRating(...args),
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
        created_at: "2026-01-01T00:00:00Z",
    },
}

const navigation = {
    goBack: mockGoBack,
    navigate: mockNavigate,
}

const route = {
    params: {
        ranking,
    },
}

beforeEach(() => {
    jest.resetAllMocks()
})

describe("SongDetailScreen", () => {
    it("confirms before removing a rating, then returns to Rankings", async () => {
        const alertSpy = jest.spyOn(Alert, "alert")
        mockRemoveRating.mockResolvedValue({ rating_event: { event_type: "removed" } })

        render(<SongDetailScreen navigation={navigation as never} route={route as never} />)

        fireEvent.press(screen.getByText("Remove Rating"))

        expect(alertSpy).toHaveBeenCalledWith(
            "Remove this song from your rankings? This cannot be undone.",
            undefined,
            expect.any(Array),
        )

        const buttons = alertSpy.mock.calls[0][2] as AlertButton[]
        await act(async () => {
            buttons[1].onPress?.()
        })

        await waitFor(() => {
            expect(mockRemoveRating).toHaveBeenCalledWith(42, "test-token")
        })
        expect(mockNavigate).toHaveBeenCalledWith("MainTabs", { screen: "Rankings" })
    })

    it("does nothing when the remove confirmation is canceled", () => {
        const alertSpy = jest.spyOn(Alert, "alert")

        render(<SongDetailScreen navigation={navigation as never} route={route as never} />)

        fireEvent.press(screen.getByText("Remove Rating"))
        const buttons = alertSpy.mock.calls[0][2] as AlertButton[]
        buttons[0].onPress?.()

        expect(mockRemoveRating).not.toHaveBeenCalled()
        expect(mockNavigate).not.toHaveBeenCalled()
    })
})
