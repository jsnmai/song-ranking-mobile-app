// Tests for DiamondScore — full, partial, and empty diamond counts per score/total combination.
import { render } from "@testing-library/react-native"

import DiamondScore from "../DiamondScore"

describe("DiamondScore", () => {
    it("score 0 total 10 → 0 full 0 partial 10 empty", () => {
        const { queryAllByTestId } = render(<DiamondScore score={0} total={10} testID="score" />)
        expect(queryAllByTestId("score-full")).toHaveLength(0)
        expect(queryAllByTestId("score-partial")).toHaveLength(0)
        expect(queryAllByTestId("score-empty")).toHaveLength(10)
    })

    it("score 5.0 total 10 → 5 full 0 partial 5 empty", () => {
        const { queryAllByTestId } = render(<DiamondScore score={5.0} total={10} testID="score" />)
        expect(queryAllByTestId("score-full")).toHaveLength(5)
        expect(queryAllByTestId("score-partial")).toHaveLength(0)
        expect(queryAllByTestId("score-empty")).toHaveLength(5)
    })

    it("score 9.6 total 10 → 9 full 1 partial 0 empty", () => {
        const { queryAllByTestId } = render(<DiamondScore score={9.6} total={10} testID="score" />)
        expect(queryAllByTestId("score-full")).toHaveLength(9)
        expect(queryAllByTestId("score-partial")).toHaveLength(1)
        expect(queryAllByTestId("score-empty")).toHaveLength(0)
    })

    it("score 9.6 total 5 → 4 full 1 partial 0 empty", () => {
        const { queryAllByTestId } = render(<DiamondScore score={9.6} total={5} testID="score" />)
        expect(queryAllByTestId("score-full")).toHaveLength(4)
        expect(queryAllByTestId("score-partial")).toHaveLength(1)
        expect(queryAllByTestId("score-empty")).toHaveLength(0)
    })

    it("score 10 total 10 → 10 full 0 partial 0 empty", () => {
        const { queryAllByTestId } = render(<DiamondScore score={10} total={10} testID="score" />)
        expect(queryAllByTestId("score-full")).toHaveLength(10)
        expect(queryAllByTestId("score-partial")).toHaveLength(0)
        expect(queryAllByTestId("score-empty")).toHaveLength(0)
    })
})
