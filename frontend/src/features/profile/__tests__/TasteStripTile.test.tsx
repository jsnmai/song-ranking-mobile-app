// Tests for the Taste Profile strip tile and its tap-to-reveal explainer popover.
import { useState } from "react"
import { fireEvent, render, screen } from "@testing-library/react-native"
import { View } from "react-native"

import TasteStripTile from "../TasteStripTile"

const DESC = "How often you give a like compared to everyone else."
const RANGE_DESC = "How many genres you've rated across."
const AVG_DESC = "The average of every score you've given."

function ControlledTiles() {
    const [open, setOpen] = useState<"range" | "avg" | null>(null)

    return (
        <View>
            <TasteStripTile
                label="RANGE"
                value="9"
                title="Range"
                description={RANGE_DESC}
                testID="strip-range"
                open={open === "range"}
                onOpenChange={(nextOpen) => setOpen(nextOpen ? "range" : null)}
                popoverEdge="start"
            />
            <TasteStripTile
                label="AVG SCORE"
                value="7.8"
                title="Average Score"
                description={AVG_DESC}
                testID="strip-avg-score"
                open={open === "avg"}
                onOpenChange={(nextOpen) => setOpen(nextOpen ? "avg" : null)}
                popoverEdge="start"
            />
        </View>
    )
}

describe("TasteStripTile", () => {
    it("renders the label and value", () => {
        render(
            <TasteStripTile
                label="RANGE"
                value="9 genres"
                title="Range"
                description="How many genres you've rated across."
                testID="strip-range"
            />,
        )
        expect(screen.getByText("RANGE")).toBeTruthy()
        expect(screen.getByText("9 genres")).toBeTruthy()
    })

    it("keeps the explainer hidden until the tile is tapped", () => {
        render(
            <TasteStripTile
                label="SELECTIVITY"
                value="Top 18%"
                title="Selectivity"
                description={DESC}
                testID="strip-selectivity"
            />,
        )
        expect(screen.queryByText(DESC)).toBeNull()
    })

    it("reveals the title and description when tapped", () => {
        render(
            <TasteStripTile
                label="SELECTIVITY"
                value="Top 18%"
                title="Selectivity"
                description={DESC}
                testID="strip-selectivity"
            />,
        )
        fireEvent.press(screen.getByTestId("strip-selectivity"))
        // The mixed-case title only appears in the popover (the tile shows the
        // uppercase label), so finding it proves the popover opened.
        expect(screen.getByText("Selectivity")).toBeTruthy()
        expect(screen.getByText(DESC)).toBeTruthy()
    })

    it("toggles the explainer closed when the tile is tapped again", () => {
        render(
            <TasteStripTile
                label="SELECTIVITY"
                value="Top 18%"
                title="Selectivity"
                description={DESC}
                testID="strip-selectivity"
            />,
        )
        fireEvent.press(screen.getByTestId("strip-selectivity"))
        expect(screen.getByText(DESC)).toBeTruthy()
        fireEvent.press(screen.getByTestId("strip-selectivity"))
        expect(screen.queryByText(DESC)).toBeNull()
    })

    it("shows a prominent stat number in the popover when provided", () => {
        render(
            <TasteStripTile
                label="TOP ARTIST"
                value="Frank Ocean"
                title="Top artist"
                description="The artist you've rated the most songs from."
                statValue="12"
                statLabel="SONGS RATED"
                testID="strip-top-artist"
            />,
        )
        fireEvent.press(screen.getByTestId("strip-top-artist"))
        expect(screen.getByText("12")).toBeTruthy()
        expect(screen.getByText("SONGS RATED")).toBeTruthy()
    })

    it("switches between controlled tile explainers with one tap", () => {
        render(<ControlledTiles />)

        fireEvent.press(screen.getByTestId("strip-range"))
        expect(screen.getByText(RANGE_DESC)).toBeTruthy()

        fireEvent.press(screen.getByTestId("strip-avg-score"))
        expect(screen.queryByText(RANGE_DESC)).toBeNull()
        expect(screen.getByText("Average Score")).toBeTruthy()
        expect(screen.getByText(AVG_DESC)).toBeTruthy()
    })
})
