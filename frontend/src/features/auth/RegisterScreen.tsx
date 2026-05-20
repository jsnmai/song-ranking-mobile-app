// Multi-step registration screen — all form data stored as local state here.
// Steps: 1. Email → 2. Password → 3. Name + Username
// Nothing is submitted to the backend until the user completes step 3.

import { useState } from "react"
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native"

import { NativeStackNavigationProp } from "@react-navigation/native-stack"

import { ApiError } from "../../api/client"
import { useAuth } from "./AuthContext"
import { AuthStackParamList } from "../../navigation/AuthNavigator"

type RegisterNavigationProp = NativeStackNavigationProp<AuthStackParamList, "Register">

type Props = {
    navigation: RegisterNavigationProp;
}

export function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export default function RegisterScreen({ navigation }: Props) {
    const [currentStep, setCurrentStep] = useState(1)

    // All registration data lives here — nothing is passed between screens
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [name, setName] = useState("")
    const [username, setUsername] = useState("")

    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const { register } = useAuth()

    const handleBack = () => {
        setError(null)
        if (currentStep === 1) {
            navigation.navigate("Welcome")
        } else {
            setCurrentStep(currentStep - 1)
        }
    }

    const handleEmailNext = () => {
        if (!email) {
            setError("Please enter your email.")
            return
        }
        if (!isValidEmail(email)) {
            setError("Please enter a valid email address.")
            return
        }
        setError(null)
        setCurrentStep(2)
    }

    const handlePasswordNext = () => {
        if (!password) {
            setError("Please enter a password.")
            return
        }
        if (password.length < 8) {
            setError("Password must be at least 8 characters.")
            return
        }
        setError(null)
        setCurrentStep(3)
    }

    const handleSubmit = async () => {
        if (!name) {
            setError("Please enter your name.")
            return
        }
        if (!username) {
            setError("Please choose a username.")
            return
        }
        setError(null)
        setIsLoading(true)

        try {
            // User + profile are created atomically on the backend — no separate profile call needed.
            // RootNavigator sees user is set in AuthContext and switches to AppNavigator automatically.
            await register(email, password, name, username)
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.detail)
            } else if (err instanceof Error) {
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
            {/* Step indicator e.g. "Step 1 of 3" */}
            <Text style={styles.stepIndicator}>Step {currentStep} of 3</Text>

            {currentStep === 1 && (
                <View style={styles.stepContainer}>
                    <Text style={styles.title}>What's your email?</Text>

                    <TextInput
                        style={styles.input}
                        placeholder="Email"
                        value={email}
                        onChangeText={setEmail}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        autoFocus
                    />

                    {error !== null && <Text style={styles.errorText}>{error}</Text>}

                    <TouchableOpacity style={styles.primaryButton} onPress={handleEmailNext}>
                        <Text style={styles.primaryButtonText}>Next</Text>
                    </TouchableOpacity>
                </View>
            )}

            {currentStep === 2 && (
                <View style={styles.stepContainer}>
                    <Text style={styles.title}>Create a password</Text>

                    <TextInput
                        style={styles.input}
                        placeholder="Password"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                        autoFocus
                    />

                    {error !== null && <Text style={styles.errorText}>{error}</Text>}

                    <TouchableOpacity style={styles.primaryButton} onPress={handlePasswordNext}>
                        <Text style={styles.primaryButtonText}>Next</Text>
                    </TouchableOpacity>
                </View>
            )}

            {currentStep === 3 && (
                <View style={styles.stepContainer}>
                    <Text style={styles.title}>Set up your profile</Text>

                    <TextInput
                        style={styles.input}
                        placeholder="Name"
                        value={name}
                        onChangeText={setName}
                        autoFocus
                    />

                    <TextInput
                        style={styles.input}
                        placeholder="Username"
                        value={username}
                        onChangeText={setUsername}
                        autoCapitalize="none"
                    />

                    {error !== null && <Text style={styles.errorText}>{error}</Text>}

                    <TouchableOpacity
                        style={styles.primaryButton}
                        onPress={handleSubmit}
                        disabled={isLoading}
                    >
                        {isLoading
                            ? <ActivityIndicator color="#fff" />
                            : <Text style={styles.primaryButtonText}>Create Account</Text>
                        }
                    </TouchableOpacity>
                </View>
            )}

            <TouchableOpacity style={styles.backButton} onPress={handleBack}>
                <Text style={styles.backButtonText}>Back</Text>
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
    stepIndicator: {
        fontSize: 14,
        color: "#999",
        marginBottom: 24,
    },
    stepContainer: {
        width: "100%",
    },
    title: {
        fontSize: 28,
        fontWeight: "bold",
        marginBottom: 24,
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
    },
    primaryButtonText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "600",
    },
    backButton: {
        marginTop: 24,
    },
    backButtonText: {
        color: "#666",
        fontSize: 14,
    },
})
