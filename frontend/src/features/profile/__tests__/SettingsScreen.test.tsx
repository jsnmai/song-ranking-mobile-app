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
const mockUpdateMyProfile = jest.fn()
const mockRefreshProfile = jest.fn()

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
        refreshProfile: mockRefreshProfile,
    }),
}))

jest.mock("../apiRequests", () => ({
    getMyProfile: (...args: unknown[]) => mockGetMyProfile(...args),
    getBlockedProfiles: (...args: unknown[]) => mockGetBlockedProfiles(...args),
    updateMyProfile: (...args: unknown[]) => mockUpdateMyProfile(...args),
}))

const profile: Profile = {
    id: 1,
    user_id: 1,
    username: "demo_power",
    display_name: "Demo Power",
    avatar_color: null, timezone: null,
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
    hide_like_counts: false,
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
    mockUpdateMyProfile.mockImplementation(async (data) => ({ ...profile, ...data }))
    mockRefreshProfile.mockResolvedValue(undefined)
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

    it("seeds the edit fields from the profile and disables Save until something changes", async () => {
        render(<SettingsScreen navigation={navigationProp} route={{} as never} />)

        await waitFor(() => expect(screen.getByTestId("edit-display-name").props.value).toBe("Demo Power"))
        expect(screen.getByTestId("edit-username").props.value).toBe("demo_power")
        expect(screen.getByTestId("edit-save").props.accessibilityState.disabled).toBe(true)
    })

    it("saves edited name, username, and color, then refreshes the profile", async () => {
        render(<SettingsScreen navigation={navigationProp} route={{} as never} />)

        await waitFor(() => expect(screen.getByTestId("edit-display-name")).toBeTruthy())
        fireEvent.changeText(screen.getByTestId("edit-display-name"), "Demo Renamed")
        fireEvent.changeText(screen.getByTestId("edit-username"), "demo_renamed")
        fireEvent.press(screen.getByTestId("edit-color-mint"))
        fireEvent.press(screen.getByTestId("edit-save"))

        await waitFor(() => {
            expect(mockUpdateMyProfile).toHaveBeenCalledWith(
                { display_name: "Demo Renamed", username: "demo_renamed", avatar_color: "mint" },
                "test-token",
            )
            expect(mockRefreshProfile).toHaveBeenCalled()
        })
        await waitFor(() => expect(screen.getByText("Saved ✓")).toBeTruthy())
    })

    it("offers the black (ink) icon color and saves it", async () => {
        render(<SettingsScreen navigation={navigationProp} route={{} as never} />)

        await waitFor(() => expect(screen.getByTestId("edit-color-ink")).toBeTruthy())
        fireEvent.press(screen.getByTestId("edit-color-ink"))
        fireEvent.press(screen.getByTestId("edit-save"))

        await waitFor(() => {
            expect(mockUpdateMyProfile).toHaveBeenCalledWith(
                expect.objectContaining({ avatar_color: "ink" }),
                "test-token",
            )
        })
    })

    it("can reset a chosen icon color back to automatic", async () => {
        mockGetMyProfile.mockResolvedValueOnce({ ...profile, avatar_color: "mint" })
        render(<SettingsScreen navigation={navigationProp} route={{} as never} />)

        await waitFor(() => expect(screen.getByTestId("edit-color-default")).toBeTruthy())
        fireEvent.press(screen.getByTestId("edit-color-default"))
        fireEvent.press(screen.getByTestId("edit-save"))

        await waitFor(() => {
            expect(mockUpdateMyProfile).toHaveBeenCalledWith(
                { avatar_color: null },
                "test-token",
            )
        })
    })

    it("blocks save and shows a hint for an invalid username", async () => {
        render(<SettingsScreen navigation={navigationProp} route={{} as never} />)

        await waitFor(() => expect(screen.getByTestId("edit-username")).toBeTruthy())
        fireEvent.changeText(screen.getByTestId("edit-username"), "ab")

        expect(screen.getByTestId("edit-save").props.accessibilityState.disabled).toBe(true)
        fireEvent.press(screen.getByTestId("edit-save"))
        expect(mockUpdateMyProfile).not.toHaveBeenCalled()
    })

    it("surfaces a server error (e.g. taken username) without crashing", async () => {
        const { ApiError } = jest.requireActual("../../../api/client")
        mockUpdateMyProfile.mockRejectedValue(new ApiError(409, "That username is already taken.", null))
        render(<SettingsScreen navigation={navigationProp} route={{} as never} />)

        await waitFor(() => expect(screen.getByTestId("edit-username")).toBeTruthy())
        fireEvent.changeText(screen.getByTestId("edit-username"), "taken")
        fireEvent.press(screen.getByTestId("edit-save"))

        await waitFor(() => expect(screen.getByText("That username is already taken.")).toBeTruthy())
    })
})
