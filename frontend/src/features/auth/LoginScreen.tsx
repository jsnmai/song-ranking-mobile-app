// Sign-in screen — "Welcome back" design.
// Clean cream canvas, large heading, pill inputs, dark pill CTA.
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
import { useAuth } from "./AuthContext"
import { AuthStackParamList } from "../../navigation/AuthNavigator"
import { fonts } from "../../theme"

type LoginNavigationProp = NativeStackNavigationProp<AuthStackParamList, "Login">
type Props = { navigation: LoginNavigationProp }

const BG = "#f4f1eb"
const CARD = "#fdfbf4"
const INK = "#11131c"
const INK_SOFT = "#3d4350"
const INK_DIM = "#8b8f9c"
const LINE = "rgba(17,19,28,0.10)"

export default function LoginScreen({ navigation }: Props) {
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [showPassword, setShowPassword] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const { login } = useAuth()

    const handleLogin = async () => {
        setError(null)
        setIsLoading(true)
        try {
            await login(email, password)
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
                <Text style={styles.heading}>Welcome{"\n"}back.</Text>

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
                        />
                        {email.length > 0 && (
                            <TouchableOpacity onPress={() => setEmail("")} hitSlop={8}>
                                <Text style={styles.clearBtn}>✕</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* Password field */}
                <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Password</Text>
                    <View style={styles.fieldRow}>
                        <TextInput
                            style={styles.fieldInput}
                            value={password}
                            onChangeText={setPassword}
                            placeholder="Your password"
                            placeholderTextColor={INK_DIM}
                            secureTextEntry={!showPassword}
                        />
                        {password.length > 0 && (
                            <>
                                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                                    <Text style={styles.showHide}>{showPassword ? "Hide" : "Show"}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setPassword("")} hitSlop={8}>
                                    <Text style={styles.clearBtn}>✕</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                </View>

                {/* Forgot password */}
                <TouchableOpacity
                    style={{ alignSelf: "flex-end", marginTop: 10 }}
                    onPress={() => navigation.navigate("ForgotPassword")}
                >
                    <Text style={styles.forgotText}>Forgot password?</Text>
                </TouchableOpacity>

                {/* Error */}
                {error !== null && <Text style={styles.error}>{error}</Text>}

                {/* Sign in button */}
                <TouchableOpacity
                    style={[styles.primaryBtn, isLoading && { opacity: 0.7 }]}
                    onPress={handleLogin}
                    disabled={isLoading}
                    activeOpacity={0.85}
                >
                    {isLoading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <>
                            <Text style={styles.primaryBtnText}>Sign in</Text>
                            <Text style={styles.arrow}>→</Text>
                        </>
                    )}
                </TouchableOpacity>

                {/* Divider */}
                <View style={styles.divider}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerLabel}>or</Text>
                    <View style={styles.dividerLine} />
                </View>

                {/* Social placeholders */}
                <View style={styles.socialBtn}>
                    <Text style={styles.socialBtnText}>Continue with Apple</Text>
                </View>
                <View style={[styles.socialBtn, { marginTop: 10 }]}>
                    <Text style={styles.socialBtnText}>Continue with Google</Text>
                </View>

                <View style={{ flex: 1, minHeight: 24 }} />

                {/* Footer link */}
                <TouchableOpacity
                    style={styles.footerLink}
                    onPress={() => navigation.replace("Register")}
                >
                    <Text style={styles.footerText}>
                        New here?{" "}
                        <Text style={{ color: INK, fontWeight: "700" }}>Create account</Text>
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
    showHide: {
        fontSize: 12.5,
        fontWeight: "600",
        color: INK_SOFT,
    },
    clearBtn: {
        fontSize: 13,
        fontWeight: "600",
        color: INK_DIM,
    },
    forgotText: {
        fontSize: 12.5,
        fontWeight: "600",
        color: INK_SOFT,
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
    divider: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        marginVertical: 18,
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: LINE,
    },
    dividerLabel: {
        fontSize: 11.5,
        fontWeight: "500",
        color: INK_DIM,
    },
    socialBtn: {
        backgroundColor: CARD,
        borderWidth: 1,
        borderColor: LINE,
        borderRadius: 999,
        paddingVertical: 14,
        alignItems: "center",
        shadowColor: INK,
        shadowOpacity: 0.04,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
    },
    socialBtnText: {
        fontSize: 14.5,
        fontWeight: "600",
        color: INK,
    },
    footerLink: {
        alignItems: "center",
    },
    footerText: {
        fontSize: 13.5,
        color: INK_SOFT,
    },
})
