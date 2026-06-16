// RootNavigator — decides which navigator to show based on auth state.
// Two states:
//   No user → AuthNavigator (Welcome, Login, Register)
//   User logged in → AppNavigator (main app)

import { useEffect, useRef } from "react"
import { ActivityIndicator, View } from "react-native"

// NavigationContainer is the top-level wrapper required by React Navigation — must have exactly one.
import { NavigationContainer, useNavigationContainerRef } from "@react-navigation/native"

import { useAuth } from "../features/auth/AuthContext"
import { promptResumeIfActiveSession } from "../features/comparison/comparisonResume"
import { AppStackParamList } from "./types"
import AppNavigator from "./AppNavigator"
import AuthNavigator from "./AuthNavigator"

export default function RootNavigator() {
    const { user, token, isLoading } = useAuth()
    const navigationRef = useNavigationContainerRef<AppStackParamList>()
    const resumeChecked = useRef(false)

    // Once per launch, after the user is authenticated, offer to resume any in-flight
    // comparison the server still holds (crash/kill/reinstall recovery). Best-effort —
    // failures inside the helper never disturb launch.
    useEffect(() => {
        if (!user || !token || resumeChecked.current) return
        resumeChecked.current = true
        promptResumeIfActiveSession(token, navigationRef)
    }, [user, token, navigationRef])

    // Show a spinner while AuthContext checks for a stored token on launch —
    // prevents flashing the login screen for users who are already logged in.
    if (isLoading) {
        return (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator size="large" />
            </View>
        )
    }

    return (
        <NavigationContainer ref={navigationRef}>
            {user === null ? <AuthNavigator /> : <AppNavigator />}
        </NavigationContainer>
    )
}
