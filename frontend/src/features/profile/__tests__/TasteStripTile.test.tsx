// Tests for the Taste Profile strip tile and its tap-to-reveal explainer popover.
import { fireEvent, render, screen } from "@testing-library/react-native"

import TasteStripTile from "../TasteStripTile"

const DESC = "How often you give a like compared to everyone else."

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
})
