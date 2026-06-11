// Tests for the Settings menu: navigation rows + account deletion flow.
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import SettingsScreen from "../SettingsScreen"
import { Profile } from "../types"

const mockGoBack = jest.fn()
const mockNavigate = jest.fn()
const mockLogout = jest.fn()
const mockDeleteAccount = jest.fn()
const mockGetMyProfile = jest.fn()
const mockGetBlockedProfiles = jest.fn()

jest.mock("@react-navigation/native", () => {
    const actual = jest.requireActual("@react-navigation/native")
    const React = jest.requireActual("react")
    // Run the focus callback once on mount (like a focused screen) without
    // re-firing on every render, which would loop.
    return { ...actual, useFocusEffect: (cb: () => void) => React.useEffect(cb, [cb]) }
})

jest.mock("../../auth/AuthContext", () => ({
    useAuth: () => ({
        token: "test-token",
        deleteAccount: mockDeleteAccount,
        logout: mockLogout,
    }),
}))

jest.mock("../apiRequests", () => ({
    getMyProfile: (...args: unknown[]) => mockGetMyProfile(...args),
    getBlockedProfiles: (...args: unknown[]) => mockGetBlockedProfiles(...args),
}))

const profile: Profile = {
    id: 1,
    user_id: 1,
    username: "demo_power",
    display_name: "Demo Power",
    is_public: true,
    visibility: "friends_only",
    created_at: "2026-01-01T00:00:00Z",
    follower_count: 4,
    following_count: 8,
    is_following: false,
    is_followed_by: false,
    is_own_profile: true,
    can_view_taste: true,
    is_blocked: false,
    user_stats: null,
}

const blockedProfile: Profile = {
    ...profile,
    id: 2,
    user_id: 2,
    username: "demo_blocked",
    display_name: "Demo Blocked",
    is_own_profile: false,
}

const navigationProp = {
    goBack: mockGoBack,
    navigate: mockNavigate,
} as never

beforeEach(() => {
    jest.resetAllMocks()
    mockGetMyProfile.mockResolvedValue(profile)
    mockGetBlockedProfiles.mockResolvedValue({ profiles: [blockedProfile] })
    mockDeleteAccount.mockResolvedValue(undefined)
})

describe("SettingsScreen", () => {
    it("renders grouped menu rows with current visibility and blocked count", async () => {
        render(<SettingsScreen navigation={navigationProp} route={{} as never} />)

        await waitFor(() => {
            expect(screen.getByText("PRIVACY & SAFETY")).toBeTruthy()
        })
        expect(screen.getByText("Privacy")).toBeTruthy()
        expect(screen.getByText("Friends only")).toBeTruthy()
        expect(screen.getByText("Blocked users")).toBeTruthy()
        expect(screen.getByText("1")).toBeTruthy()
        expect(screen.getByText("ABOUT")).toBeTruthy()
        expect(screen.getByText("Log out")).toBeTruthy()
        expect(screen.getByText("Delete account")).toBeTruthy()
    })

    it("opens the Privacy screen", async () => {
        render(<SettingsScreen navigation={navigationProp} route={{} as never} />)

        await waitFor(() => expect(screen.getByText("Privacy")).toBeTruthy())
        fireEvent.press(screen.getByText("Privacy"))

        expect(mockNavigate).toHaveBeenCalledWith("Privacy")
    })

    it("opens the Blocked users screen", async () => {
        render(<SettingsScreen navigation={navigationProp} route={{} as never} />)

        await waitFor(() => expect(screen.getByText("Blocked users")).toBeTruthy())
        fireEvent.press(screen.getByText("Blocked users"))

        expect(mockNavigate).toHaveBeenCalledWith("BlockedUsers")
    })

    it.each([
        ["Support", "support"],
        ["Privacy Policy", "privacy"],
        ["Terms", "terms"],
        ["Community Guidelines", "guidelines"],
    ])("opens %s from About", async (label, kind) => {
        render(<SettingsScreen navigation={navigationProp} route={{} as never} />)

        await waitFor(() => expect(screen.getByText(label)).toBeTruthy())
        fireEvent.press(screen.getByText(label))

        expect(mockNavigate).toHaveBeenCalledWith("LegalPlaceholder", { kind })
    })

    it("logs out", async () => {
        render(<SettingsScreen navigation={navigationProp} route={{} as never} />)

        await waitFor(() => expect(screen.getByText("Log out")).toBeTruthy())
        fireEvent.press(screen.getByText("Log out"))

        expect(mockLogout).toHaveBeenCalled()
    })

    it("requires DELETE before deleting the account", async () => {
        render(<SettingsScreen navigation={navigationProp} route={{} as never} />)

        await waitFor(() => expect(screen.getByText("Delete account")).toBeTruthy())
        fireEvent.press(screen.getByText("Delete account"))
        fireEvent.press(screen.getByText("Delete"))
        expect(mockDeleteAccount).not.toHaveBeenCalled()

        fireEvent.changeText(screen.getByPlaceholderText("DELETE"), "DELETE")
        fireEvent.press(screen.getByText("Delete"))

        await waitFor(() => {
            expect(mockDeleteAccount).toHaveBeenCalledWith("DELETE")
        })
    })

    it("shows an error and keeps the session when account deletion fails", async () => {
        mockDeleteAccount.mockRejectedValue(new Error("Could not delete right now."))
        render(<SettingsScreen navigation={navigationProp} route={{} as never} />)

        await waitFor(() => expect(screen.getByText("Delete account")).toBeTruthy())
        fireEvent.press(screen.getByText("Delete account"))
        fireEvent.changeText(screen.getByPlaceholderText("DELETE"), "DELETE")
        fireEvent.press(screen.getByText("Delete"))

        await waitFor(() => {
            expect(screen.getByText("Could not delete right now.")).toBeTruthy()
            expect(mockLogout).not.toHaveBeenCalled()
        })
    })
})
