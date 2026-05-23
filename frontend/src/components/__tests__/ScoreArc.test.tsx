// Tests for ScoreArc — children, accessibility label, clamping, and testID.
import { Text } from "react-native"
import { render, screen } from "@testing-library/react-native"

import ScoreArc from "../ScoreArc"

describe("ScoreArc", () => {
    it("renders children inside the arc", () => {
        render(
            <ScoreArc score={5} size={100} color="#000">
                <Text>cover</Text>
            </ScoreArc>,
        )
        expect(screen.getByText("cover")).toBeTruthy()
    })

    it("accessibility label reflects score and max", () => {
        render(<ScoreArc score={9.6} max={10} size={100} color="#000" testID="arc" />)
        expect(screen.getByLabelText("9.6 out of 10 score arc")).toBeTruthy()
    })

    it("clamps score above max", () => {
        render(<ScoreArc score={15} max={10} size={100} color="#000" />)
        expect(screen.getByLabelText("10.0 out of 10 score arc")).toBeTruthy()
    })

    it("clamps score below zero", () => {
        render(<ScoreArc score={-2} max={10} size={100} color="#000" />)
        expect(screen.getByLabelText("0.0 out of 10 score arc")).toBeTruthy()
    })

    it("exposes testID on the wrapper", () => {
        render(<ScoreArc score={5} size={100} color="#000" testID="arc" />)
        expect(screen.getByTestId("arc")).toBeTruthy()
    })
})
