// Tests for the forgot-password screen: email gate, enumeration-safe advance, error surfacing.
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import ForgotPasswordScreen from "../ForgotPasswordScreen"
import { ApiError } from "../../../api/client"

const mockRequestPasswordReset = jest.fn()

jest.mock("../apiRequests", () => ({
    requestPasswordReset: (...args: unknown[]) => mockRequestPasswordReset(...args),
}))

// isValidEmail is a pure exported function; mock it so this screen is hermetic
// from RegisterScreen's module tree. Mirrors the real regex.
jest.mock("../RegisterScreen", () => ({
    isValidEmail: (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
}))

const mockNavigate = jest.fn()
const navigation = { navigate: mockNavigate, goBack: jest.fn() } as never

beforeEach(() => {
    jest.resetAllMocks()
    mockRequestPasswordReset.mockResolvedValue({ message: "If an account exists, a code has been sent." })
})

describe("ForgotPasswordScreen", () => {
    it("rejects an invalid email without calling the API or navigating", () => {
        render(<ForgotPasswordScreen navigation={navigation} />)

        fireEvent.changeText(screen.getByPlaceholderText("you@email.com"), "not-an-email")
        fireEvent.press(screen.getByText("Send code"))

        expect(screen.getByText("Enter a valid email.")).toBeTruthy()
        expect(mockRequestPasswordReset).not.toHaveBeenCalled()
        expect(mockNavigate).not.toHaveBeenCalled()
    })

    it("sends the email and advances to ResetPassword with it", async () => {
        render(<ForgotPasswordScreen navigation={navigation} />)

        fireEvent.changeText(screen.getByPlaceholderText("you@email.com"), "you@email.com")
        fireEvent.press(screen.getByText("Send code"))

        await waitFor(() => {
            expect(mockRequestPasswordReset).toHaveBeenCalledWith("you@email.com")
            expect(mockNavigate).toHaveBeenCalledWith("ResetPassword", { email: "you@email.com" })
        })
    })

    it("surfaces a network ApiError and does NOT advance", async () => {
        mockRequestPasswordReset.mockRejectedValue(new ApiError(429, "Too many requests.", null))
        render(<ForgotPasswordScreen navigation={navigation} />)

        fireEvent.changeText(screen.getByPlaceholderText("you@email.com"), "you@email.com")
        fireEvent.press(screen.getByText("Send code"))

        await waitFor(() => expect(screen.getByText("Too many requests.")).toBeTruthy())
        expect(mockNavigate).not.toHaveBeenCalled()
    })

    it("still advances when a non-ApiError is thrown (never blocks on an unexpected error)", async () => {
        mockRequestPasswordReset.mockRejectedValue(new Error("network glitch"))
        render(<ForgotPasswordScreen navigation={navigation} />)

        fireEvent.changeText(screen.getByPlaceholderText("you@email.com"), "you@email.com")
        fireEvent.press(screen.getByText("Send code"))

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith("ResetPassword", { email: "you@email.com" })
        })
    })
})
