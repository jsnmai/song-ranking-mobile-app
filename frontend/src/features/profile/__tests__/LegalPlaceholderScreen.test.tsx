// Tests for reusable Help & Legal placeholder content.
import { fireEvent, render, screen } from "@testing-library/react-native"

import LegalPlaceholderScreen from "../LegalPlaceholderScreen"

const mockGoBack = jest.fn()

const navigationProp = {
    goBack: mockGoBack,
} as never

function renderPlaceholder(kind: "support" | "privacy" | "terms" | "guidelines") {
    return render(
        <LegalPlaceholderScreen
            navigation={navigationProp}
            route={{ params: { kind } } as never}
        />,
    )
}

beforeEach(() => {
    jest.resetAllMocks()
})

describe("LegalPlaceholderScreen", () => {
    it("renders the Support placeholder", () => {
        renderPlaceholder("support")

        expect(screen.getByText("Support")).toBeTruthy()
        expect(screen.getByText(
            "Need help with LISTN? A support contact will be finalized before public launch.",
        )).toBeTruthy()
        expect(screen.getByText("TODO_SUPPORT_EMAIL")).toBeTruthy()
    })

    it("renders the Privacy Policy placeholder", () => {
        renderPlaceholder("privacy")

        expect(screen.getByText("Privacy Policy")).toBeTruthy()
        expect(screen.getByText(/Privacy Policy will be finalized before public launch/)).toBeTruthy()
        expect(screen.getByText("This is a placeholder, not final legal text.")).toBeTruthy()
    })

    it("renders the Terms placeholder", () => {
        renderPlaceholder("terms")

        expect(screen.getByText("Terms of Service")).toBeTruthy()
        expect(screen.getByText(/Terms of Service will be finalized before public launch/)).toBeTruthy()
        expect(screen.getByText("This is a placeholder, not final legal text.")).toBeTruthy()
    })

    it("renders the Community Guidelines placeholder", () => {
        renderPlaceholder("guidelines")

        expect(screen.getByText("Community Guidelines")).toBeTruthy()
        expect(screen.getByText("LISTN is for sharing music taste respectfully.")).toBeTruthy()
        expect(screen.getByText("Be respectful.")).toBeTruthy()
        expect(screen.getByText("Do not create an account if you are under 13.")).toBeTruthy()
        expect(screen.getByText("Reports may be reviewed and actioned.")).toBeTruthy()
    })

    it("goes back from a placeholder screen", () => {
        renderPlaceholder("support")

        fireEvent.press(screen.getByText("Back"))

        expect(mockGoBack).toHaveBeenCalledTimes(1)
    })
})
