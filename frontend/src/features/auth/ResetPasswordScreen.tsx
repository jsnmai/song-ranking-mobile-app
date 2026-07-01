// Reset-password screen — step 2 of the in-app reset flow.
// Enter the 6-digit code from the email + a new password. On success we show an
// inline confirmation and send the user back to Login to sign in (no token is
// issued by the reset endpoint, per the design). All failures surface the same
// generic message the backend returns. Visual language mirrors Login/Register.
import { useEffect, useRef, useState } from "react"
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { RouteProp } from "@react-navigation/native"
import { ApiError } from "../../api/client"
import { confirmPasswordReset, requestPasswordReset } from "./apiRequests"
import { AuthStackParamList } from "../../navigation/AuthNavigator"
import { fonts } from "../../theme"

type ResetPasswordNavigationProp = NativeStackNavigationProp<AuthStackParamList, "ResetPassword">
type ResetPasswordRouteProp = RouteProp<AuthStackParamList, "ResetPassword">
type Props = { navigation: ResetPasswordNavigationProp; route: ResetPasswordRouteProp }

const BG = "#f4f1eb"
const CARD = "#fdfbf4"
const INK = "#11131c"
const INK_SOFT = "#3d4350"
const INK_DIM = "#8b8f9c"
const LINE = "rgba(17,19,28,0.10)"
const MINT = "#1f9d77"

const CODE_LENGTH = 6
const RESEND_COOLDOWN_SECONDS = 60  // mirrors the backend per-email resend cooldown

function digitsOnly(value: string, maxLength: number): string {
    return value.replace(/\D/g, "").slice(0, maxLength)
}

export default function ResetPasswordScreen({ navigation, route }: Props) {
    const { email } = route.params

    const [code, setCode] = useState("")
    const [newPassword, setNewPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [showPassword, setShowPassword] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [done, setDone] = useState(false)
    const [resendNote, setResendNote] = useState<string | null>(null)
    // Resend cooldown mirrors the backend's per-email throttle. Starts non-zero
    // because a code was just sent on the previous screen; each resend restarts it.
    const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_SECONDS)

    const codeInputRef = useRef<TextInput>(null)

    // Tick the resend cooldown down to 0, one second at a time.
    useEffect(() => {
        if (resendCooldown <= 0) return
        const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000)
        return () => clearTimeout(timer)
    }, [resendCooldown])

    const handleReset = async () => {
        setError(null)
        if (code.length !== CODE_LENGTH) {
            setError("Enter the 6-digit code.")
            return
        }
        if (newPassword.length < 8) {
            setError("Password must be at least 8 characters.")
            return
        }
        if (confirmPassword.length > 0 && confirmPassword !== newPassword) {
            setError("Passwords don't match.")
            return
        }
        setIsLoading(true)
        try {
            await confirmPasswordReset(email, code, newPassword)
            setDone(true)
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.detail)
            } else {
                setError("Something went wrong. Please try again.")
            }
        } finally {
            setIsLoading(false)
        }
    }

    const handleResend = async () => {
        if (resendCooldown > 0) return  // guard: matches the server cooldown, prevents spamming the button
        setError(null)
        setResendNote(null)
        setResendCooldown(RESEND_COOLDOWN_SECONDS)
        try {
            await requestPasswordReset(email)
        } catch {
            // Swallow — never reveal whether the address exists. A real outage
            // still lets the user try the code they may already have.
        }
        // The backend enforces the cooldown; the copy stays neutral regardless.
        setResendNote("If that email has an account, a new code is on its way.")
    }

    // ── Success state ─────────────────────────────────────────────────────
    if (done) {
        return (
            <KeyboardAvoidingView style={styles.root}>
                <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                    <View style={styles.navRow}>
                        <Text style={styles.wordmark}>LISTn</Text>
                    </View>
                    <View style={styles.successBadge}>
                        <Text style={{ color: MINT, fontSize: 22 }}>✓</Text>
                    </View>
                    <Text style={styles.heading}>Password{"\n"}updated.</Text>
                    <Text style={styles.sub}>
                        You've been signed out everywhere else. Sign in with your new password.
                    </Text>
                    <View style={{ flex: 1, minHeight: 24 }} />
                    <TouchableOpacity
                        style={styles.primaryBtn}
                        onPress={() => navigation.navigate("Login")}
                        activeOpacity={0.85}
                    >
                        <Text style={styles.primaryBtnText}>Back to sign in</Text>
                        <Text style={styles.arrow}>→</Text>
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        )
    }

    // ── Entry state ───────────────────────────────────────────────────────
    const codeCells = Array.from({ length: CODE_LENGTH }, (_, i) => code[i] ?? "")

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
                <Text style={styles.heading}>Enter your{"\n"}code.</Text>
                <Text style={styles.sub}>
                    If {email} has an account, we sent a 6-digit code. Enter it below to set a new password.
                </Text>

                {/* 6-box code row — one transparent input drives all six cells. */}
                <Pressable style={styles.codeRow} onPress={() => codeInputRef.current?.focus()}>
                    {codeCells.map((digit, i) => (
                        <View
                            key={i}
                            style={[styles.codeCell, i === code.length && styles.codeCellActive]}
                        >
                            <Text style={styles.codeCellText}>{digit}</Text>
                        </View>
                    ))}
                    <TextInput
                        ref={codeInputRef}
                        style={styles.hiddenCodeInput}
                        value={code}
                        onChangeText={(v) => setCode(digitsOnly(v, CODE_LENGTH))}
                        keyboardType="number-pad"
                        maxLength={CODE_LENGTH}
                        autoFocus
                        textContentType="oneTimeCode"
                        autoComplete="one-time-code"
                    />
                </Pressable>

                {/* New password */}
                <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>New password</Text>
                    <View style={styles.fieldRow}>
                        <TextInput
                            style={styles.fieldInput}
                            value={newPassword}
                            onChangeText={setNewPassword}
                            placeholder="8+ characters"
                            placeholderTextColor={INK_DIM}
                            secureTextEntry={!showPassword}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                            <Text style={styles.showHide}>{showPassword ? "Hide" : "Show"}</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Confirm password (optional) */}
                <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Confirm new password</Text>
                    <View style={styles.fieldRow}>
                        <TextInput
                            style={styles.fieldInput}
                            value={confirmPassword}
                            onChangeText={setConfirmPassword}
                            placeholder="Re-enter password"
                            placeholderTextColor={INK_DIM}
                            secureTextEntry={!showPassword}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                    </View>
                </View>

                {/* Error / resend note */}
                {error !== null && <Text style={styles.error}>{error}</Text>}
                {resendNote !== null && error === null && <Text style={styles.note}>{resendNote}</Text>}

                {/* Reset button */}
                <TouchableOpacity
                    style={[styles.primaryBtn, isLoading && { opacity: 0.7 }]}
                    onPress={handleReset}
                    disabled={isLoading}
                    activeOpacity={0.85}
                >
                    {isLoading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <>
                            <Text style={styles.primaryBtnText}>Reset password</Text>
                            <Text style={styles.arrow}>→</Text>
                        </>
                    )}
                </TouchableOpacity>

                {/* Resend + guidance for the "no code" case (covers a mistyped or unregistered email) */}
                <View style={styles.resendLink}>
                    <Text style={styles.note}>
                        No code? Check your spam, or go back and try the email you signed up with.
                    </Text>
                    <TouchableOpacity
                        onPress={handleResend}
                        disabled={resendCooldown > 0}
                        hitSlop={8}
                        style={{ marginTop: 8 }}
                    >
                        <Text
                            style={{
                                color: resendCooldown > 0 ? INK_DIM : INK,
                                fontWeight: "700",
                                fontSize: 13.5,
                            }}
                        >
                            {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
                        </Text>
                    </TouchableOpacity>
                </View>

                <View style={{ flex: 1, minHeight: 24 }} />
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
    // 6-box code row
    codeRow: {
        flexDirection: "row",
        gap: 8,
        marginTop: 22,
        position: "relative",
    },
    codeCell: {
        flex: 1,
        aspectRatio: 0.82,
        backgroundColor: CARD,
        borderWidth: 1,
        borderColor: LINE,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: INK,
        shadowOpacity: 0.03,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
    },
    codeCellActive: {
        borderColor: INK,
    },
    codeCellText: {
        fontSize: 24,
        fontWeight: "800",
        color: INK,
    },
    // Transparent input overlaid on the cells to capture typing/paste.
    hiddenCodeInput: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        opacity: 0,
        color: "transparent",
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
    note: {
        fontSize: 12.5,
        color: INK_DIM,
        marginTop: 12,
        textAlign: "center",
        lineHeight: 18,
    },
    error: {
        color: "#e0492e",
        fontSize: 13,
        marginTop: 12,
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
    resendLink: {
        alignItems: "center",
        marginTop: 18,
    },
    footerText: {
        fontSize: 13.5,
        color: INK_SOFT,
    },
    successBadge: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: "rgba(31,157,119,0.10)",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 18,
    },
})
