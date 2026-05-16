// Navigation structure for the whole app.
//
// There are two stacks:
//   AuthStack — screens shown when the user is NOT logged in (Welcome, Login, Register)
//   AppStack  — screens shown when the user IS logged in (placeholder for now)
//
// RootNavigator picks which stack to show based on whether there is a logged-in user.

import React from "react"
import { ActivityIndicator, Text, View } from "react-native"

// NavigationContainer is the top-level wrapper required by React Navigation, must have exactly one.
import { NavigationContainer } from "@react-navigation/native"

// createNativeStackNavigator creates a stack navigator — screens slide in from the right.
// The <Stack.Navigator> component is the container; <Stack.Screen> registers each screen.
import { createNativeStackNavigator } from "@react-navigation/native-stack"

import { useAuth } from "../features/auth/AuthContext"
import LoginScreen from "../features/auth/LoginScreen"
import WelcomeScreen from "../features/auth/WelcomeScreen"
import RegisterScreen from "../features/auth/RegisterScreen"

// type xyzParamList tell TypeScript what screens exist in each stack and what params they accept.
// 'undefined' means the screen takes no params when navigated to.
export type AuthStackParamList = {
    Welcome: undefined;
    Login: undefined;
    Register: undefined;
}
const AuthStack = createNativeStackNavigator<AuthStackParamList>()

const AuthNavigator = () => (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
        <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
        <AuthStack.Screen name="Login" component={LoginScreen} />
        <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
)


export type AppStackParamList = {
    // Placeholder — will add more screens
    Home: undefined;
}
const AppStack = createNativeStackNavigator<AppStackParamList>()

// Temporary placeholder until the main app screens are built 
const AppNavigator = () => (
    <AppStack.Navigator>
        <AppStack.Screen name="Home" component={HomeScreen} />
    </AppStack.Navigator>
)

// Inline placeholder 
function HomeScreen() {
    return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Text>Logged in! (Home placeholder)</Text>
        </View>
    )
}


// RootNavigator decides which stack to show.
// isLoading is true on first launch while AuthContext checks for a stored token —
// show a spinner instead of flashing the login screen unnecessarily.
export default function RootNavigator() {
    const { user, isLoading } = useAuth()

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
