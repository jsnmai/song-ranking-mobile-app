// Tests for the TasteTabContent shared component.
import { fireEvent, render, screen } from "@testing-library/react-native"

import TasteTabContent from "../TasteTabContent"
import { TasteProfileResponse } from "../types"

const emptyTaste: TasteProfileResponse = {
    total_rated: 0,
    avg_score: null,
    bucket_breakdown: { like: 0, okay: 0, dislike: 0 },
    overall: { genres: [], top_artists: [] },
    by_bucket: {
        like: { avg_score: null, count: 0, genres: [], top_artists: [] },
        okay: { avg_score: null, count: 0, genres: [], top_artists: [] },
        dislike: { avg_score: null, count: 0, genres: [], top_artists: [] },
    },
    harshness: { status: "forming", percentile: null },
}

const fullTaste: TasteProfileResponse = {
    total_rated: 12,
    avg_score: 7.45,
    bucket_breakdown: { like: 6, okay: 4, dislike: 2 },
    overall: {
        genres: [
            { name: "Rock", count: 7, percentage: 58.3 },
            { name: "Pop", count: 4, percentage: 33.3 },
            { name: "Unknown", count: 1, percentage: 8.4 },
        ],
        top_artists: [
            { name: "Frank Ocean", count: 5 },
            { name: "Kendrick Lamar", count: 3 },
        ],
    },
    by_bucket: {
        like: {
            avg_score: 9.1,
            count: 6,
            genres: [{ name: "Rock", count: 6, percentage: 100.0 }],
            top_artists: [{ name: "Frank Ocean", count: 5 }],
        },
        okay: {
            avg_score: 6.5,
            count: 4,
            genres: [{ name: "Pop", count: 4, percentage: 100.0 }],
            top_artists: [{ name: "Kendrick Lamar", count: 3 }],
        },
        dislike: {
            avg_score: 3.2,
            count: 2,
            genres: [],
            top_artists: [],
        },
    },
    harshness: { status: "ready", percentile: 72 },
}

describe("TasteTabContent", () => {
    it("shows loading spinner when isLoading is true", () => {
        const { UNSAFE_getAllByType } = render(<TasteTabContent taste={null} isLoading={true} error={null} />)
        const { ActivityIndicator } = require("react-native")
        expect(UNSAFE_getAllByType(ActivityIndicator).length).toBeGreaterThan(0)
    })

    it("shows error message when error is set", () => {
        render(<TasteTabContent taste={null} isLoading={false} error="Something went wrong" />)
        expect(screen.getByText("Something went wrong")).toBeTruthy()
    })

    it("shows empty state with count when total_rated < 10", () => {
        render(<TasteTabContent taste={emptyTaste} isLoading={false} error={null} />)
        expect(screen.getByText("Rate at least 10 songs to unlock your taste profile")).toBeTruthy()
        expect(screen.getByText("0 / 10 rated")).toBeTruthy()
    })

    it("shows header stats for a full taste profile", () => {
        render(<TasteTabContent taste={fullTaste} isLoading={false} error={null} />)
        expect(screen.getByText("12")).toBeTruthy()
        expect(screen.getByText("7.45")).toBeTruthy()
    })

    it("shows bucket breakdown row", () => {
        render(<TasteTabContent taste={fullTaste} isLoading={false} error={null} />)
        expect(screen.getByText(/Like 6/)).toBeTruthy()
        expect(screen.getByText(/Okay 4/)).toBeTruthy()
        expect(screen.getByText(/Dislike 2/)).toBeTruthy()
    })

    it("shows genres in overall view when total_rated >= 10", () => {
        render(<TasteTabContent taste={fullTaste} isLoading={false} error={null} />)
        expect(screen.getByText("Rock")).toBeTruthy()
        expect(screen.getByText("58.3%")).toBeTruthy()
    })

    it("renders Unknown genre in muted style (still visible in list)", () => {
        render(<TasteTabContent taste={fullTaste} isLoading={false} error={null} />)
        expect(screen.getByText("Unknown")).toBeTruthy()
    })

    it("shows top artists", () => {
        render(<TasteTabContent taste={fullTaste} isLoading={false} error={null} />)
        expect(screen.getByText("Frank Ocean")).toBeTruthy()
        expect(screen.getByText("Kendrick Lamar")).toBeTruthy()
    })

    it("switches to Like view when Like toggle is pressed", () => {
        render(<TasteTabContent taste={fullTaste} isLoading={false} error={null} />)
        fireEvent.press(screen.getByText("Like"))
        expect(screen.getByText(/avg 9\.10/)).toBeTruthy()
    })

    it("switches to Okay view when Okay toggle is pressed", () => {
        render(<TasteTabContent taste={fullTaste} isLoading={false} error={null} />)
        fireEvent.press(screen.getByText("Okay"))
        expect(screen.getByText(/avg 6\.50/)).toBeTruthy()
    })

    it("switches to Dislike view when Dislike toggle is pressed", () => {
        render(<TasteTabContent taste={fullTaste} isLoading={false} error={null} />)
        fireEvent.press(screen.getByText("Dislike"))
        expect(screen.getByText(/avg 3\.20/)).toBeTruthy()
    })
})
