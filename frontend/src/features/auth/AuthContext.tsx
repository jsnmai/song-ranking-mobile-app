// AuthContext.tsx is a shared storage box for auth state that any screen in the app can reach into.
// Tracks who is logged in, and exposes login/register/logout functions.
// Any screen that needs the current user or auth actions reads from here via useAuth().
import { createContext, useCallback, useContext, useEffect, useState } from "react"
import * as SecureStore from "expo-secure-store"

import { ApiError, setUnauthorizedHandler } from "../../api/client"
import { KEYS } from "../../constants/keys"
import {
    deleteAccount as deleteAccountRequest,
    login as loginRequest,
    me,
    register as registerRequest,
} from "./apiRequests"
import { getMyProfile, updateMyProfile } from "../profile/apiRequests"
import { Profile } from "../profile/types"
import { User } from "./types"

// The shape of everything this context contains - a user, a JWT token, a loading flag, and 3 functions.
type AuthContextType = {
    user: User | null;      // the logged-in user, or null if not logged in
    profile: Profile | null; // the logged-in user's own profile (display_name, username, etc.)
    token: string | null;   // the raw JWT — available if screens ever need to call authenticated endpoints directly
    isLoading: boolean;     // true while checking the stored token on app launch
    login: (email: string, password: string) => Promise<void>;
    register: (
        birthdate: string,
        email: string,
        password: string,
        display_name: string,
        username: string,
    ) => Promise<void>;
    deleteAccount: (confirmation: string) => Promise<void>;
    logout: () => Promise<void>;
    refreshProfile: () => Promise<void>;
    // True once this device has ever completed login/register — lets the Welcome
    // screen skip straight to the Create account/Sign in step after a logout,
    // instead of replaying the intro carousel like a brand-new device would see.
    hasOnboarded: boolean;
}
// Create the actual context box. Starts empty: (null)
const AuthContext = createContext<AuthContextType | null>(null)

type AuthProviderProps = {
    children: React.ReactNode;  // React.ReactNode: the TS type for anything React can render ie components, text, arrays, null, etc.
}
// AuthProvider is the component that fills AuthContext and wraps the whole app, and makes auth state available everywhere inside it.
// children is everything nested inside <AuthProvider>...</AuthProvider> in App.tsx
// Everything inside <AuthProvider> has access to the box.    
export function AuthProvider({ children }: AuthProviderProps) {
    // [value, updater] = useState(starting value) 
    const [user, setUser] = useState<User | null>(null)
    const [profile, setProfile] = useState<Profile | null>(null)
    const [token, setToken] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [hasOnboarded, setHasOnboarded] = useState(false)

    const markOnboarded = async () => {
        await SecureStore.setItemAsync(KEYS.HAS_ONBOARDED, "true")
        setHasOnboarded(true)
    }

    const tryFetchProfile = async (jwt: string) => {
        try {
            const p = await getMyProfile(jwt)
            setProfile(p)
            await trySyncTimezone(jwt, p)
        } catch {
            // profile may not exist yet (new user pre-setup) — silently ignore
        }
    }

    // Keep the profile's IANA timezone in step with the device so the backend can
    // interpret rating timestamps in the user's local clock (auxstrology nocturnality).
    // Best-effort: a failure here must never disturb login or profile load.
    const trySyncTimezone = async (jwt: string, p: Profile) => {
        try {
            const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
            if (!deviceTimezone || p.timezone === deviceTimezone) return
            const updated = await updateMyProfile({ timezone: deviceTimezone }, jwt)
            setProfile(updated)
        } catch {
            // silently ignore — timezone capture is best-effort analytics context
        }
    }

    const login = async (email: string, password: string) => {
        const tokenResponse = await loginRequest(email, password)
        await SecureStore.setItemAsync(KEYS.JWT_TOKEN, tokenResponse.access_token)
        const currentUser = await me(tokenResponse.access_token)
        setToken(tokenResponse.access_token)
        setUser(currentUser)
        await tryFetchProfile(tokenResponse.access_token)
        await markOnboarded()
    }

    const register = async (
        birthdate: string,
        email: string,
        password: string,
        display_name: string,
        username: string,
    ): Promise<void> => {
        // The register endpoint returns a JWT alongside the new user in one response —
        // no separate login or /me call needed after registration.
        const response = await registerRequest(birthdate, email, password, display_name, username)
        await SecureStore.setItemAsync(KEYS.JWT_TOKEN, response.access_token)
        setToken(response.access_token)
        setUser(response.user)
        await markOnboarded()
    }

    const logout = async () => {
        await SecureStore.deleteItemAsync(KEYS.JWT_TOKEN)
        setUser(null)
        setProfile(null)
        setToken(null)
    }

    const refreshProfile = useCallback(async () => {
        if (!token) return
        await tryFetchProfile(token)
    }, [token])

    const deleteAccount = async (confirmation: string) => {
        if (!token) {
            throw new Error("You must be logged in to delete your account.")
        }
        await deleteAccountRequest(token, confirmation)
        await logout()
    }

    const checkStoredToken = async () => {
        try {
            const onboarded = await SecureStore.getItemAsync(KEYS.HAS_ONBOARDED)
            if (onboarded) setHasOnboarded(true)

            const token = await SecureStore.getItemAsync(KEYS.JWT_TOKEN)
            // NO token: means user has never logged in or previously logged out
            if (!token) {
                return
            }
            // YES token: validate the token is still accepted by the backend and get the user
            const currentUser = await me(token)  // me() will throw ApiError if token is expired/invalid
            setToken(token)
            setUser(currentUser)
            await tryFetchProfile(token)
        } catch (err) {
            if (err instanceof ApiError && err.status === 401) {
                await SecureStore.deleteItemAsync(KEYS.JWT_TOKEN)  // delete it so the user sees the login screen
            }
        } finally {  // always runs whether the try succeeded or the catch fired
            setIsLoading(false)  // make loading spinner disappear
        }
    }
    useEffect(() => {
        setUnauthorizedHandler(logout)

        return () => {
            setUnauthorizedHandler(null)
        }
    }, [])

    // useEffect runs any time any state in the component changes,
    // but empty [] means run it only once when the component mounts — not on every re-render.
    useEffect(() => { 
        checkStoredToken()
    }, []) 

    return (
        <AuthContext.Provider value={{ user, profile, token, isLoading, login, register, deleteAccount, logout, refreshProfile, hasOnboarded }}>
            {children}
        </AuthContext.Provider>
    )
}

// useAuth is the hook every screen calls to access the box with auth state and functions.
// Throwing here catches the mistake of using useAuth outside of AuthProvider early.
export function useAuth() {
    const context = useContext(AuthContext)
    if (!context) {
        throw new Error("useAuth must be used inside AuthProvider")
    }
    return context
}
