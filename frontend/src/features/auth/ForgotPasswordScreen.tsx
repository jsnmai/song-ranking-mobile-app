// Forgot-password screen — step 1 of the in-app reset flow.
// Collects the email, asks the backend to send a 6-digit code, then advances to
// ResetPassword. We always advance regardless of the response: the backend never
// reveals whether the email has an account (no enumeration), so neither does the UI.
// Visual language mirrors LoginScreen/RegisterScreen exactly.
import { useState } from "react"
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { ApiError } from "../../api/client"
import { requestPasswordReset } from "./apiRequests"
import { isValidEmail } from "./RegisterScreen"
import { AuthStackParamList } from "../../navigation/AuthNavigator"
import { fonts } from "../../theme"

type ForgotPasswordNavigationProp = NativeStackNavigationProp<AuthStackParamList, "ForgotPassword">
type Props = { navigation: ForgotPasswordNavigationProp }

const BG = "#f4f1eb"
const CARD = "#fdfbf4"
const INK = "#11131c"
const INK_SOFT = "#3d4350"
const INK_DIM = "#8b8f9c"
const LINE = "rgba(17,19,28,0.10)"

export default function ForgotPasswordScreen({ navigation }: Props) {
    const [email, setEmail] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSend = async () => {
        setError(null)
        if (!email.trim() || !isValidEmail(email)) {
            setError("Enter a valid email.")
            return
        }
        setIsLoading(true)
        try {
            await requestPasswordReset(email.trim())
        } catch (err) {
            // A network/server error is worth surfacing; an account-not-found is
            // never reported (the backend returns a generic 200), so success and
            // "no such account" are indistinguishable here by design.
            if (err instanceof ApiError) {
                setError(err.detail)
                setIsLoading(false)
                return
            }
        }
        setIsLoading(false)
        // Always advance — the code (if any) is on its way and the next screen
        // explains that without confirming the address exists.
        navigation.navigate("ResetPassword", { email: email.trim() })
    }

    return (
        <KeyboardAvoidingView
            style={styles.root}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
            <ScrollView
                contentContainerStyle={styles.scroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                {/* Back + wordmark */}
                <View style={styles.navRow}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                        <Text style={styles.backArrow}>‹</Text>
                    </TouchableOpacity>
                    <Text style={styles.wordmark}>LISTn</Text>
                </View>

                {/* Heading */}
                <Text style={styles.heading}>Reset your{"\n"}password.</Text>
                <Text style={styles.sub}>
                    Enter your email and we'll send you a 6-digit code to set a new password.
                </Text>

                {/* Email field */}
                <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Email</Text>
                    <View style={styles.fieldRow}>
                        <TextInput
                            style={styles.fieldInput}
                            value={email}
                            onChangeText={setEmail}
                            placeholder="you@email.com"
                            placeholderTextColor={INK_DIM}
                            autoCapitalize="none"
                            keyboardType="email-address"
                            autoCorrect={false}
                            autoFocus
                        />
                        {email.length > 0 && (
                            <TouchableOpacity onPress={() => setEmail("")} hitSlop={8}>
                                <Text style={styles.clearBtn}>✕</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* Non-enumerating reassurance */}
                <Text style={styles.note}>
                    If that email has an account, a code is on its way.
                </Text>

                {/* Error */}
                {error !== null && <Text style={styles.error}>{error}</Text>}

                {/* Send code button */}
                <TouchableOpacity
                    style={[styles.primaryBtn, isLoading && { opacity: 0.7 }]}
                    onPress={handleSend}
                    disabled={isLoading}
                    activeOpacity={0.85}
                >
                    {isLoading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <>
                            <Text style={styles.primaryBtnText}>Send code</Text>
                            <Text style={styles.arrow}>→</Text>
                        </>
                    )}
                </TouchableOpacity>

                <View style={{ flex: 1, minHeight: 24 }} />

                {/* Footer link */}
                <TouchableOpacity
                    style={styles.footerLink}
                    onPress={() => navigation.navigate("Login")}
                >
                    <Text style={styles.footerText}>
                        Remembered it?{" "}
                        <Text style={{ color: INK, fontWeight: "700" }}>Sign in</Text>
                    </Text>
                </TouchableOpacity>
            </ScrollView>
        </KeyboardAvoidingView>
    )
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: BG,
    },
    scroll: {
        flexGrow: 1,
        paddingHorizontal: 22,
        paddingTop: 56,
        paddingBottom: 32,
    },
    navRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        marginBottom: 26,
    },
    backBtn: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: CARD,
        borderWidth: 1,
        borderColor: LINE,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: INK,
        shadowOpacity: 0.05,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
    },
    backArrow: {
        fontSize: 22,
        color: INK,
        lineHeight: 24,
        marginTop: -1,
    },
    wordmark: {
        fontFamily: fonts.serif,
        fontSize: 20,
        color: INK,
        letterSpacing: -0.3,
    },
    heading: {
        fontSize: 32,
        fontWeight: "800",
        color: INK,
        letterSpacing: -0.8,
        lineHeight: 36,
    },
    sub: {
        fontSize: 14,
        color: INK_SOFT,
        marginTop: 11,
        lineHeight: 21,
    },
    fieldGroup: {
        marginTop: 16,
    },
    fieldLabel: {
        fontSize: 12,
        fontWeight: "600",
        color: INK_SOFT,
        marginBottom: 7,
    },
    fieldRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: CARD,
        borderWidth: 1,
        borderColor: LINE,
        borderRadius: 14,
        paddingVertical: 14,
        paddingHorizontal: 16,
        shadowColor: INK,
        shadowOpacity: 0.03,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
    },
    fieldInput: {
        flex: 1,
        fontSize: 15,
        color: INK,
        fontWeight: "500",
        padding: 0,
    },
    clearBtn: {
        fontSize: 13,
        fontWeight: "600",
        color: INK_DIM,
    },
    note: {
        fontSize: 12.5,
        color: INK_DIM,
        marginTop: 12,
        lineHeight: 18,
    },
    error: {
        color: "#e0492e",
        fontSize: 13,
        marginTop: 10,
        textAlign: "center",
    },
    primaryBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 9,
        backgroundColor: INK,
        borderRadius: 999,
        paddingVertical: 15,
        marginTop: 18,
        shadowColor: INK,
        shadowOpacity: 0.18,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
    },
    primaryBtnText: {
        color: "#fff",
        fontSize: 15,
        fontWeight: "600",
    },
    arrow: {
        color: "#fff",
        fontSize: 16,
    },
    footerLink: {
        alignItems: "center",
    },
    footerText: {
        fontSize: 13.5,
        color: INK_SOFT,
    },
})
