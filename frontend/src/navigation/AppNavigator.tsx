// Screens shown when the user IS logged in.
// Will become a tab navigator in Phase 2 (Rankings, Search, Feed, Profile).
// Placeholder home screen until Phase 2 screens are built.

import { StyleSheet, Text, TouchableOpacity, View } from "react-native"

import { createNativeStackNavigator } from "@react-navigation/native-stack"

import { useAuth } from "../features/auth/AuthContext"

export type AppStackParamList = {
    Home: undefined;
}

const Stack = createNativeStackNavigator<AppStackParamList>()

// Temporary placeholder — replace with tab navigator in Phase 2
function HomeScreen() {
    const { logout } = useAuth()

    return (
        <View style={styles.container}>
            <Text style={styles.text}>Logged in! (Home placeholder)</Text>
            <TouchableOpacity style={styles.logoutButton} onPress={logout}>
                <Text style={styles.logoutText}>Log Out</Text>
            </TouchableOpacity>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    text: {
        fontSize: 16,
        marginBottom: 24,
    },
    logoutButton: {
        paddingVertical: 12,
        paddingHorizontal: 32,
        borderWidth: 1,
        borderColor: "#000",
        borderRadius: 8,
    },
    logoutText: {
        fontSize: 16,
    },
})

export default function AppNavigator() {
    return (
        <Stack.Navigator>
            <Stack.Screen name="Home" component={HomeScreen} />
        </Stack.Navigator>
    )
}
