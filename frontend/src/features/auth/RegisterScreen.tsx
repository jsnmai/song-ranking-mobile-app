// Register screen — email + password form.
// Calls register() from AuthContext on submit.
// register() also calls login() internally, so on success the user is logged in automatically.

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

type RegisterNavigationProp = NativeStackNavigationProp<AuthStackParamList, "Register">

type Props = {
    navigation: RegisterNavigationProp;
}

export default function RegisterScreen({ navigation }: Props) {
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const { register } = useAuth()

    const handleRegister = async () => {
        setError(null)
        setIsLoading(true)

        try {
            await register(email, password)
            // Same as LoginScreen: register() calls login() internally, which sets the user
            // in AuthContext. RootNavigator detects the user and switches to the app stack.
        } catch (err) {
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
            <Text style={styles.title}>Create Account</Text>

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

            {error !== null && <Text style={styles.errorText}>{error}</Text>}

            <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleRegister}
                disabled={isLoading}
            >
                {isLoading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.primaryButtonText}>Create Account</Text>
                }
            </TouchableOpacity>

            <TouchableOpacity onPress={() => navigation.navigate("Login")}>
                <Text style={styles.linkText}>Already have an account? Log in</Text>
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
