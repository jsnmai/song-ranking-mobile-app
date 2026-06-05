// Multi-step registration screen — all form data stored as local state here.
// Steps: 1. Birthday → 2. Email → 3. Password → 4. Name + Username
// Nothing is submitted to the backend until the user completes step 4.

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

export function isAtLeast13(birthdate: string): boolean {
    const parts = birthdate.split("-")
    if (parts.length !== 3) {
        return false
    }
    const year = Number(parts[0])
    const month = Number(parts[1])
    const day = Number(parts[2])
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
        return false
    }
    const parsed = new Date(Date.UTC(year, month - 1, day))
    if (
        parsed.getUTCFullYear() !== year
        || parsed.getUTCMonth() !== month - 1
        || parsed.getUTCDate() !== day
    ) {
        return false
    }
    const today = new Date()
    let age = today.getFullYear() - year
    if (
        today.getMonth() + 1 < month
        || (today.getMonth() + 1 === month && today.getDate() < day)
    ) {
        age -= 1
    }
    return age >= 13
}

export function formatBirthdateParts(month: string, day: string, year: string): string | null {
    if (month.length === 0 || day.length === 0 || year.length !== 4) {
        return null
    }
    const monthNumber = Number(month)
    const dayNumber = Number(day)
    const yearNumber = Number(year)
    if (!Number.isInteger(monthNumber) || !Number.isInteger(dayNumber) || !Number.isInteger(yearNumber)) {
        return null
    }
    const paddedMonth = monthNumber.toString().padStart(2, "0")
    const paddedDay = dayNumber.toString().padStart(2, "0")
    return `${yearNumber}-${paddedMonth}-${paddedDay}`
}

function digitsOnly(value: string, maxLength: number): string {
    return value.replace(/\D/g, "").slice(0, maxLength)
}

export default function RegisterScreen({ navigation }: Props) {
    const [currentStep, setCurrentStep] = useState(1)

    // All registration data lives here — nothing is passed between screens
    const [birthMonth, setBirthMonth] = useState("")
    const [birthDay, setBirthDay] = useState("")
    const [birthYear, setBirthYear] = useState("")
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

    const handleBirthdayNext = () => {
        const birthdate = formatBirthdateParts(birthMonth, birthDay, birthYear)
        if (!birthdate) {
            setError("Please enter your birthday.")
            return
        }
        if (!isAtLeast13(birthdate)) {
            setError("Sorry, LISTn is only available for users 13 and older.")
            return
        }
        setError(null)
        setCurrentStep(2)
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
        setCurrentStep(3)
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
        setCurrentStep(4)
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
        const birthdate = formatBirthdateParts(birthMonth, birthDay, birthYear)
        if (birthdate === null) {
            setError("Please enter your birthday.")
            setIsLoading(false)
            setCurrentStep(1)
            return
        }

        try {
            // User + profile are created atomically on the backend — no separate profile call needed.
            // RootNavigator sees user is set in AuthContext and switches to AppNavigator automatically.
            await register(birthdate, email, password, name, username)
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
            {/* Step indicator e.g. "Step 1 of 4" */}
            <Text style={styles.stepIndicator}>Step {currentStep} of 4</Text>

            {currentStep === 1 && (
                <View style={styles.stepContainer}>
                    <Text style={styles.title}>Enter your birthday</Text>
                    <Text style={styles.helperText}>LISTn is only available for users 13 and older.</Text>

                    <View style={styles.birthdayRow}>
                        <TextInput
                            style={[styles.input, styles.birthdayInput]}
                            placeholder="MM"
                            value={birthMonth}
                            onChangeText={(value) => setBirthMonth(digitsOnly(value, 2))}
                            keyboardType="number-pad"
                            maxLength={2}
                            autoFocus
                        />
                        <TextInput
                            style={[styles.input, styles.birthdayInput]}
                            placeholder="DD"
                            value={birthDay}
                            onChangeText={(value) => setBirthDay(digitsOnly(value, 2))}
                            keyboardType="number-pad"
                            maxLength={2}
                        />
                        <TextInput
                            style={[styles.input, styles.birthYearInput]}
                            placeholder="YYYY"
                            value={birthYear}
                            onChangeText={(value) => setBirthYear(digitsOnly(value, 4))}
                            keyboardType="number-pad"
                            maxLength={4}
                        />
                    </View>

                    {error !== null && <Text style={styles.errorText}>{error}</Text>}

                    <TouchableOpacity style={styles.primaryButton} onPress={handleBirthdayNext}>
                        <Text style={styles.primaryButtonText}>Next</Text>
                    </TouchableOpacity>
                </View>
            )}

            {currentStep === 2 && (
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

            {currentStep === 3 && (
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

            {currentStep === 4 && (
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
    helperText: {
        color: "#666",
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 16,
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
    birthdayRow: {
        flexDirection: "row",
        gap: 8,
        width: "100%",
    },
    birthdayInput: {
        flex: 1,
        textAlign: "center",
    },
    birthYearInput: {
        flex: 1.4,
        textAlign: "center",
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
