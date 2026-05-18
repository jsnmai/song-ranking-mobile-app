// RootNavigator — decides which navigator to show based on auth state.
// Two states:
//   No user → AuthNavigator (Welcome, Login, Register)
//   User logged in → AppNavigator (main app)

import { ActivityIndicator, View } from "react-native"

// NavigationContainer is the top-level wrapper required by React Navigation — must have exactly one.
import { NavigationContainer } from "@react-navigation/native"

import { useAuth } from "../features/auth/AuthContext"
import AppNavigator from "./AppNavigator"
import AuthNavigator from "./AuthNavigator"

export default function RootNavigator() {
    const { user, isLoading } = useAuth()

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
        <NavigationContainer>
            {user === null ? <AuthNavigator /> : <AppNavigator />}
        </NavigationContainer>
    )
}
