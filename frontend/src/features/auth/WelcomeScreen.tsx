// First screen a logged-out user sees.
// Two buttons: go to Login or go to Register.
// No logic here — just navigation.

import { StyleSheet, Text, TouchableOpacity, View } from "react-native"

// NativeStackNavigationProp is the TypeScript type for the navigation object
// React Navigation passes to every screen automatically.
// It lets us call navigation.navigate() with type-checking on the screen name.
import { NativeStackNavigationProp } from "@react-navigation/native-stack"

import { AuthStackParamList } from "../../navigation/AuthNavigator"

// The type of the navigation prop this screen receives.
// AuthStackParamList is the map of all screens in the auth stack (defined in navigation/index.tsx).
// "Welcome" is the name of this screen within that stack.
type WelcomeNavigationProp = NativeStackNavigationProp<AuthStackParamList, "Welcome">

type Props = {
    navigation: WelcomeNavigationProp;
}

export default function WelcomeScreen({ navigation }: Props) {
    return (
        <View style={styles.container}>
            <Text style={styles.title}>LISTn</Text>
            <Text style={styles.subtitle}>Rank the songs you have listened to.</Text>

            <View style={styles.buttonContainer}>
                <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={() => navigation.navigate("Register")}
                >
                    <Text style={styles.primaryButtonText}>Create Account</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => navigation.navigate("Login")}
                >
                    <Text style={styles.secondaryButtonText}>Log In</Text>
                </TouchableOpacity>
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#fff",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 32,
    },
    title: {
        fontSize: 48,
        fontWeight: "bold",
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: "#666",
        marginBottom: 64,
    },
    buttonContainer: {
        width: "100%",
        gap: 12,
    },
    primaryButton: {
        backgroundColor: "#000",
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: "center",
    },
    primaryButtonText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "600",
    },
    secondaryButton: {
        backgroundColor: "#fff",
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#000",
    },
    secondaryButtonText: {
        color: "#000",
        fontSize: 16,
        fontWeight: "600",
    },
})
