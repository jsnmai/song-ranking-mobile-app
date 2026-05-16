// Login screen — email + password form.
// Calls login() from AuthContext on submit.
// On success, AuthContext sets the user and navigation switches to the app stack automatically.

import React, { useState } from "react"
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native"

import { NativeStackNavigationProp } from "@react-navigation/native-stack"

import { useAuth } from "./AuthContext"
import { AuthStackParamList } from "../../navigation"

type LoginNavigationProp = NativeStackNavigationProp<AuthStackParamList, "Login">

type Props = {
    navigation: LoginNavigationProp;
}

export default function LoginScreen({ navigation }: Props) {
    // Local state for the form fields and UI feedback
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)  // null means no error to show; a string means show that error message

    const { login } = useAuth()

    const handleLogin = async () => {
        setError(null)
        setIsLoading(true)

        try {
            await login(email, password)
            // No navigation.navigate() needed here.
            // login() sets the user in AuthContext, which triggers the RootNavigator
            // to switch from AuthStack to AppStack automatically.
        } catch (err) {
            // err is typed as 'unknown' in TypeScript — we check it is an Error before reading .message
            if (err instanceof Error) {
                setError(err.message)
            } else {
                setError("Something went wrong. Please try again.")
            }
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Log In</Text>

            <TextInput
                style={styles.input}
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
            />

            <TextInput
                style={styles.input}
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
            />

            {/* Only render the error message when there is one */}
            {error !== null && <Text style={styles.errorText}>{error}</Text>}

            <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleLogin}
                disabled={isLoading}
            >
                {/* Show a spinner while the request is in flight, otherwise show the label */}
                {isLoading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.primaryButtonText}>Log In</Text>
                }
            </TouchableOpacity>

            <TouchableOpacity onPress={() => navigation.navigate("Register")}>
                <Text style={styles.linkText}>Don't have an account? Sign up</Text>
            </TouchableOpacity>
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
        fontSize: 32,
        fontWeight: "bold",
        marginBottom: 32,
    },
    input: {
        width: "100%",
        borderWidth: 1,
        borderColor: "#ccc",
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 16,
        marginBottom: 12,
    },
    errorText: {
        color: "red",
        marginBottom: 12,
        textAlign: "center",
    },
    primaryButton: {
        width: "100%",
        backgroundColor: "#000",
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: "center",
        marginTop: 8,
        marginBottom: 16,
    },
    primaryButtonText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "600",
    },
    linkText: {
        color: "#666",
        fontSize: 14,
    },
})
