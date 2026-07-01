// Tests for the reset-password screen: code/password validation, success, error, resend cooldown.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native"
import { TextInput } from "react-native"

import ResetPasswordScreen from "../ResetPasswordScreen"
import { ApiError } from "../../../api/client"

const mockConfirmPasswordReset = jest.fn()
const mockRequestPasswordReset = jest.fn()

jest.mock("../apiRequests", () => ({
    confirmPasswordReset: (...args: unknown[]) => mockConfirmPasswordReset(...args),
    requestPasswordReset: (...args: unknown[]) => mockRequestPasswordReset(...args),
}))

const mockNavigate = jest.fn()
const navigation = { navigate: mockNavigate, goBack: jest.fn() } as never
const route = { params: { email: "you@email.com" } } as never

function renderScreen() {
    return render(<ResetPasswordScreen navigation={navigation} route={route} />)
}

// The 6-cell code entry is driven by a single hidden TextInput (no placeholder,
// number-pad), rendered before the two password fields.
function codeInput() {
    return screen.UNSAFE_getAllByType(TextInput)[0]
}

// Advance the fake-timer resend countdown one second at a time so each tick
// re-arms its own setTimeout and commits a re-render in between.
function tickSeconds(n: number) {
    for (let i = 0; i < n; i++) {
        act(() => {
            jest.advanceTimersByTime(1000)
        })
    }
}

beforeEach(() => {
    jest.useFakeTimers()
    jest.resetAllMocks()
    mockConfirmPasswordReset.mockResolvedValue(undefined)
    mockRequestPasswordReset.mockResolvedValue({ message: "If an account exists, a code has been sent." })
})

afterEach(() => {
    jest.useRealTimers()
})

describe("ResetPasswordScreen", () => {
    it("shows the target email and starts the resend button on cooldown", () => {
        renderScreen()

        expect(screen.getByText(/you@email\.com/)).toBeTruthy()
        expect(screen.getByText("Resend code in 60s")).toBeTruthy()
    })

    it("validates the code length and password before calling the API", () => {
        renderScreen()

        // Too-short code.
        fireEvent.changeText(codeInput(), "123")
        fireEvent.press(screen.getByText("Reset password"))
        expect(screen.getByText("Enter the 6-digit code.")).toBeTruthy()

        // Full code, too-short password.
        fireEvent.changeText(codeInput(), "123456")
        fireEvent.changeText(screen.getByPlaceholderText("8+ characters"), "short")
        fireEvent.press(screen.getByText("Reset password"))
        expect(screen.getByText("Password must be at least 8 characters.")).toBeTruthy()

        // Mismatched confirmation.
        fireEvent.changeText(screen.getByPlaceholderText("8+ characters"), "newpassword456")
        fireEvent.changeText(screen.getByPlaceholderText("Re-enter password"), "different")
        fireEvent.press(screen.getByText("Reset password"))
        expect(screen.getByText("Passwords don't match.")).toBeTruthy()

        expect(mockConfirmPasswordReset).not.toHaveBeenCalled()
    })

    it("submits the code + password, shows success, then returns to Login", async () => {
        renderScreen()

        fireEvent.changeText(codeInput(), "123456")
        fireEvent.changeText(screen.getByPlaceholderText("8+ characters"), "newpassword456")
        fireEvent.press(screen.getByText("Reset password"))

        await waitFor(() => {
            expect(mockConfirmPasswordReset).toHaveBeenCalledWith("you@email.com", "123456", "newpassword456")
        })
        const backToSignIn = await screen.findByText("Back to sign in")

        fireEvent.press(backToSignIn)
        expect(mockNavigate).toHaveBeenCalledWith("Login")
    })

    it("surfaces the generic invalid-code error and stays on the reset screen", async () => {
        mockConfirmPasswordReset.mockRejectedValue(new ApiError(400, "Invalid or expired code.", null))
        renderScreen()

        fireEvent.changeText(codeInput(), "000000")
        fireEvent.changeText(screen.getByPlaceholderText("8+ characters"), "newpassword456")
        fireEvent.press(screen.getByText("Reset password"))

        await waitFor(() => expect(screen.getByText("Invalid or expired code.")).toBeTruthy())
        expect(screen.queryByText("Back to sign in")).toBeNull()
    })

    it("counts the resend cooldown down, re-enables it, and resends", async () => {
        renderScreen()

        expect(screen.getByText("Resend code in 60s")).toBeTruthy()

        tickSeconds(1)
        expect(screen.getByText("Resend code in 59s")).toBeTruthy()

        tickSeconds(59) // run it out
        expect(screen.getByText("Resend code")).toBeTruthy()

        fireEvent.press(screen.getByText("Resend code"))
        await waitFor(() => {
            expect(mockRequestPasswordReset).toHaveBeenCalledWith("you@email.com")
        })
        // Cooldown re-arms after a resend.
        expect(screen.getByText(/Resend code in \d+s/)).toBeTruthy()
    })
})
