// Tests for the weekly-streak profile UI: the own-profile chip and the
// other-profile tap-to-reveal badge + popover.
import { fireEvent, render, screen } from "@testing-library/react-native"

import { OwnStreakChip, StreakBadge, StreakChip } from "../StreakBadge"

describe("StreakChip", () => {
    it("shows the current streak length in weeks", () => {
        render(<StreakChip weeks={12} />)
        expect(screen.getByTestId("streak-chip")).toBeTruthy()
        expect(screen.getByText("12")).toBeTruthy()
    })

    it("renders a muted zero state when there is no active streak", () => {
        render(<StreakChip weeks={0} />)
        // Still present (greyed), so the streak slot is always visible.
        expect(screen.getByTestId("streak-chip")).toBeTruthy()
        expect(screen.getByText("0")).toBeTruthy()
    })
})

describe("StreakBadge", () => {
    it("keeps the popover hidden until the badge is tapped", () => {
        render(<StreakBadge weeks={8} name="Mira Chen" />)
        expect(screen.getByTestId("streak-badge")).toBeTruthy()
        expect(screen.queryByText("RATING STREAK")).toBeNull()
    })

    it("reveals the streak count and a summary when tapped", () => {
        render(<StreakBadge weeks={8} name="Mira Chen" />)
        fireEvent.press(screen.getByTestId("streak-badge"))

        expect(screen.getByText("RATING STREAK")).toBeTruthy()
        // Uses the first name and pluralizes correctly.
        expect(
            screen.getByText("Mira has rated at least one song every week for 8 weeks straight."),
        ).toBeTruthy()
    })

    it("uses the singular 'week' for a one-week streak", () => {
        render(<StreakBadge weeks={1} name="Sam" />)
        fireEvent.press(screen.getByTestId("streak-badge"))
        expect(
            screen.getByText("Sam has rated at least one song every week for 1 week straight."),
        ).toBeTruthy()
    })

    it("renders a muted badge and zero-state copy when there is no active streak", () => {
        render(<StreakBadge weeks={0} name="Mira Chen" />)
        expect(screen.getByTestId("streak-badge")).toBeTruthy()
        fireEvent.press(screen.getByTestId("streak-badge"))

        expect(screen.getByText("RATING STREAK")).toBeTruthy()
        expect(screen.getByText("Mira doesn't have an active rating streak right now.")).toBeTruthy()
    })

    it("closes the popover when the backdrop is pressed", () => {
        render(<StreakBadge weeks={8} name="Mira Chen" />)
        fireEvent.press(screen.getByTestId("streak-badge"))
        expect(screen.getByText("RATING STREAK")).toBeTruthy()

        // The badge toggles closed again.
        fireEvent.press(screen.getByTestId("streak-badge"))
        expect(screen.queryByText("RATING STREAK")).toBeNull()
    })
})

describe("OwnStreakChip", () => {
    it("opens the centered detail modal with the active streak when tapped", () => {
        render(<OwnStreakChip weeks={12} longest={20} />)
        expect(screen.queryByTestId("streak-detail-modal")).toBeNull()

        fireEvent.press(screen.getByTestId("streak-chip-button"))

        expect(screen.getByTestId("streak-detail-modal")).toBeTruthy()
        expect(screen.getByText("WEEK RATING STREAK")).toBeTruthy()
        // Surfaces the best-ever streak when it beats the current one.
        expect(screen.getByText("YOUR BEST · 20 WEEKS")).toBeTruthy()
    })

    it("shows a button-free empty state with the short copy when there is no streak", () => {
        render(<OwnStreakChip weeks={0} longest={0} />)
        fireEvent.press(screen.getByTestId("streak-chip-button"))

        expect(screen.getByText("No streak yet")).toBeTruthy()
        expect(
            screen.getByText("Rate at least one song every week to start a rating streak."),
        ).toBeTruthy()
        // The Rate a song / Maybe later actions were removed.
        expect(screen.queryByTestId("streak-modal-rate")).toBeNull()
        expect(screen.queryByTestId("streak-modal-dismiss")).toBeNull()
    })

    it("has no description or action button in the active state", () => {
        render(<OwnStreakChip weeks={12} longest={20} />)
        fireEvent.press(screen.getByTestId("streak-chip-button"))

        expect(screen.queryByText(/You've rated at least one song/)).toBeNull()
        expect(screen.queryByTestId("streak-modal-done")).toBeNull()
    })

    it("closes the modal when the backdrop is pressed", () => {
        render(<OwnStreakChip weeks={12} longest={20} />)
        fireEvent.press(screen.getByTestId("streak-chip-button"))
        expect(screen.getByTestId("streak-detail-modal")).toBeTruthy()

        fireEvent.press(screen.getByTestId("streak-modal-overlay"))
        expect(screen.queryByTestId("streak-detail-modal")).toBeNull()
    })
})
