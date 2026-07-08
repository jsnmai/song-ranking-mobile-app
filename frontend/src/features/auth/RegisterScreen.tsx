// Registration screen — clean 2-step design.
// Step 1: Birthday gate (13+ age check) — runs before any account info is collected
// so under-13 users never enter email/username/password (COPPA-conservative ordering).
// Step 2: Create account (username / email / password / terms)
// Nothing is submitted until both steps are complete.
import { useRef, useState } from "react"
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

type RegisterNavigationProp = NativeStackNavigationProp<AuthStackParamList, "Register">
type Props = { navigation: RegisterNavigationProp }

const BG = "#f4f1eb"
const CARD = "#fdfbf4"
const INK = "#11131c"
const INK_SOFT = "#3d4350"
const INK_DIM = "#8b8f9c"
const LINE = "rgba(17,19,28,0.10)"
const MINT = "#1f9d77"
const DANGER = "#e0492e"

// ── Validation helpers ────────────────────────────────────────────────────
export function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function isAtLeast13(birthdate: string): boolean {
    const parts = birthdate.split("-")
    if (parts.length !== 3) return false
    const year = Number(parts[0])
    const month = Number(parts[1])
    const day = Number(parts[2])
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false
    const parsed = new Date(Date.UTC(year, month - 1, day))
    if (
        parsed.getUTCFullYear() !== year
        || parsed.getUTCMonth() !== month - 1
        || parsed.getUTCDate() !== day
    ) return false
    const today = new Date()
    let age = today.getFullYear() - year
    if (
        today.getMonth() + 1 < month
        || (today.getMonth() + 1 === month && today.getDate() < day)
    ) age -= 1
    return age >= 13
}

export function formatBirthdateParts(month: string, day: string, year: string): string | null {
    if (month.length === 0 || day.length === 0 || year.length !== 4) return null
    const m = Number(month)
    const d = Number(day)
    const y = Number(year)
    if (!Number.isInteger(m) || !Number.isInteger(d) || !Number.isInteger(y)) return null
    return `${y}-${m.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`
}

function digitsOnly(value: string, maxLength: number): string {
    return value.replace(/\D/g, "").slice(0, maxLength)
}

function computeAge(month: string, day: string, year: string): number | null {
    const bd = formatBirthdateParts(month, day, year)
    if (!bd) return null
    const today = new Date()
    const y = Number(year)
    const m = Number(month)
    const d = Number(day)
    let age = today.getFullYear() - y
    if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age -= 1
    return age
}

// ── Shared sub-components ─────────────────────────────────────────────────
function NavRow({ onBack, label }: { onBack: () => void; label?: string }) {
    return (
        <View style={styles.navRow}>
            <TouchableOpacity style={styles.backBtn} onPress={onBack}>
                <Text style={styles.backArrow}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.wordmark}>{label ?? "LISTn"}</Text>
        </View>
    )
}

function Field({
    label,
    value,
    onChangeText,
    placeholder,
    secureTextEntry,
    keyboardType,
    autoCapitalize,
    lead,
    suffix,
    autoFocus,
    clearable,
}: {
    label: string
    value: string
    onChangeText: (v: string) => void
    placeholder?: string
    secureTextEntry?: boolean
    keyboardType?: "default" | "email-address" | "number-pad"
    autoCapitalize?: "none" | "words"
    lead?: React.ReactNode
    suffix?: React.ReactNode
    autoFocus?: boolean
    clearable?: boolean
}) {
    return (
        <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <View style={styles.fieldRow}>
                {lead}
                <TextInput
                    style={styles.fieldInput}
                    value={value}
                    onChangeText={onChangeText}
                    placeholder={placeholder}
                    placeholderTextColor={INK_DIM}
                    secureTextEntry={secureTextEntry}
                    keyboardType={keyboardType ?? "default"}
                    autoCapitalize={autoCapitalize ?? "none"}
                    autoCorrect={false}
                    autoFocus={autoFocus}
                />
                {value.length > 0 && suffix}
                {clearable && value.length > 0 && (
                    <TouchableOpacity onPress={() => onChangeText("")} hitSlop={8}>
                        <Text style={styles.clearBtn}>✕</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    )
}

// ── Step 2: Create your account ───────────────────────────────────────────
function StepAccount({
    username, setUsername,
    email, setEmail,
    password, setPassword,
    showPassword, setShowPassword,
    termsAccepted, setTermsAccepted,
    error,
    isLoading,
    onBack,
    onNext,
}: {
    username: string; setUsername: (v: string) => void
    email: string; setEmail: (v: string) => void
    password: string; setPassword: (v: string) => void
    showPassword: boolean; setShowPassword: (v: boolean) => void
    termsAccepted: boolean; setTermsAccepted: (v: boolean) => void
    error: string | null
    isLoading: boolean
    onBack: () => void
    onNext: () => void
}) {
    return (
        <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
        >
            <NavRow onBack={onBack} />
            <Text style={styles.heading}>Create your{"\n"}account.</Text>

            <Field
                label="Username"
                value={username}
                onChangeText={setUsername}
                lead={<Text style={styles.atSign}>@</Text>}
                placeholder="yourname"
                autoFocus
            />
            <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@email.com"
                keyboardType="email-address"
                clearable
            />
            <Field
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="8+ characters"
                secureTextEntry={!showPassword}
                clearable
                suffix={
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                        <Text style={styles.showHide}>{showPassword ? "Hide" : "Show"}</Text>
                    </TouchableOpacity>
                }
            />

            {/* Terms checkbox */}
            <TouchableOpacity
                style={styles.termsRow}
                onPress={() => setTermsAccepted(!termsAccepted)}
                activeOpacity={0.7}
            >
                <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
                    {termsAccepted && <Text style={{ color: "#fff", fontSize: 11, lineHeight: 13 }}>✓</Text>}
                </View>
                <Text style={styles.termsText}>
                    I agree to the{" "}
                    <Text style={{ color: INK, fontWeight: "700" }}>Terms</Text>
                    {" & "}
                    <Text style={{ color: INK, fontWeight: "700" }}>Privacy Policy</Text>
                    .
                </Text>
            </TouchableOpacity>

            {error !== null && <Text style={styles.error}>{error}</Text>}

            <TouchableOpacity
                style={[styles.primaryBtn, isLoading && { opacity: 0.7 }]}
                onPress={onNext}
                disabled={isLoading}
                activeOpacity={0.85}
            >
                {isLoading ? (
                    <ActivityIndicator color="#fff" />
                ) : (
                    <>
                        <Text style={styles.primaryBtnText}>Create account</Text>
                        <Text style={styles.arrow}>→</Text>
                    </>
                )}
            </TouchableOpacity>

            <View style={{ flex: 1, minHeight: 24 }} />
        </ScrollView>
    )
}

// ── Step 1: Birthday gate ─────────────────────────────────────────────────
function StepBirthday({
    birthMonth, setBirthMonth,
    birthDay, setBirthDay,
    birthYear, setBirthYear,
    error,
    blocked,
    onBack,
    onNext,
    onSignIn,
}: {
    birthMonth: string; setBirthMonth: (v: string) => void
    birthDay: string; setBirthDay: (v: string) => void
    birthYear: string; setBirthYear: (v: string) => void
    error: string | null
    blocked: boolean
    onBack: () => void
    onNext: () => void
    onSignIn: () => void
}) {
    const age = computeAge(birthMonth, birthDay, birthYear)
    const ageOk = age !== null && age >= 13

    const dayRef = useRef<TextInput>(null)
    const yearRef = useRef<TextInput>(null)

    return (
        <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
        >
            <NavRow onBack={onBack} />
            <Text style={styles.heading}>When's your{"\n"}birthday?</Text>
            {/* Neutral age screen: do not state the age cutoff before the user answers. */}
            <Text style={styles.sub}>
                We use your birthday to verify your age. It's never shown on your profile.
            </Text>

            {/* Date cells */}
            <View style={styles.dateRow}>
                <View style={styles.dateCell}>
                    <TextInput
                        style={styles.dateCellInput}
                        value={birthMonth}
                        onChangeText={(v) => {
                            const digits = digitsOnly(v, 2)
                            setBirthMonth(digits)
                            if (digits.length === 2) dayRef.current?.focus()
                        }}
                        placeholder="MM"
                        placeholderTextColor={INK_DIM}
                        keyboardType="number-pad"
                        maxLength={2}
                        autoFocus
                    />
                    <Text style={styles.dateCellLabel}>MONTH</Text>
                </View>
                <View style={styles.dateCell}>
                    <TextInput
                        ref={dayRef}
                        style={styles.dateCellInput}
                        value={birthDay}
                        onChangeText={(v) => {
                            const digits = digitsOnly(v, 2)
                            setBirthDay(digits)
                            if (digits.length === 2) yearRef.current?.focus()
                        }}
                        placeholder="DD"
                        placeholderTextColor={INK_DIM}
                        keyboardType="number-pad"
                        maxLength={2}
                    />
                    <Text style={styles.dateCellLabel}>DAY</Text>
                </View>
                <View style={styles.dateCell}>
                    <TextInput
                        ref={yearRef}
                        style={styles.dateCellInput}
                        value={birthYear}
                        onChangeText={(v) => setBirthYear(digitsOnly(v, 4))}
                        placeholder="YYYY"
                        placeholderTextColor={INK_DIM}
                        keyboardType="number-pad"
                        maxLength={4}
                    />
                    <Text style={styles.dateCellLabel}>YEAR</Text>
                </View>
            </View>

            {/* Age confirmation chip */}
            {ageOk && !blocked && (
                <View style={styles.ageChip}>
                    <Text style={{ color: MINT, fontSize: 12.5, fontWeight: "600" }}>
                        ✓ You're {age}, all set
                    </Text>
                </View>
            )}

            {error !== null && <Text style={styles.error}>{error}</Text>}

            <View style={{ flex: 1, minHeight: 32 }} />

            <TouchableOpacity
                style={[styles.primaryBtn, blocked && { opacity: 0.4 }]}
                onPress={onNext}
                disabled={blocked}
                activeOpacity={0.85}
            >
                <Text style={styles.primaryBtnText}>Continue</Text>
                <Text style={styles.arrow}>→</Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={[styles.footerLink, { marginTop: 18 }]}
                onPress={onSignIn}
            >
                <Text style={styles.footerText}>
                    Already have an account?{" "}
                    <Text style={{ color: INK, fontWeight: "700" }}>Sign in</Text>
                </Text>
            </TouchableOpacity>
        </ScrollView>
    )
}

// ── Main screen ───────────────────────────────────────────────────────────
export default function RegisterScreen({ navigation }: Props) {
    const [step, setStep] = useState(1)

    // Step 1 fields — birthday gate runs before any account info is collected.
    const [birthMonth, setBirthMonth] = useState("")
    const [birthDay, setBirthDay] = useState("")
    const [birthYear, setBirthYear] = useState("")
    // Once an under-13 birthday is entered, the gate stays blocked for this session
    // so the user cannot simply re-enter a different date.
    const [ageBlocked, setAgeBlocked] = useState(false)

    // Step 2 fields
    const [username, setUsername] = useState("")
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [showPassword, setShowPassword] = useState(false)
    const [termsAccepted, setTermsAccepted] = useState(false)

    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const { register } = useAuth()

    function handleBirthdayNext() {
        setError(null)
        const birthdate = formatBirthdateParts(birthMonth, birthDay, birthYear)
        if (!birthdate) { setError("Enter your birthday."); return }
        if (!isAtLeast13(birthdate)) {
            setAgeBlocked(true)
            setError("LISTn is for ages 13 and up. You can't create an account right now.")
            return
        }
        setStep(2)
    }

    const handleSubmit = async () => {
        setError(null)
        if (!username.trim()) { setError("Choose a username."); return }
        if (!email.trim() || !isValidEmail(email)) { setError("Enter a valid email."); return }
        if (!password || password.length < 8) { setError("Password must be at least 8 characters."); return }
        if (!termsAccepted) { setError("Accept the Terms & Privacy Policy to continue."); return }
        const birthdate = formatBirthdateParts(birthMonth, birthDay, birthYear)
        // The gate already validated this; re-check defensively before submitting.
        if (!birthdate || !isAtLeast13(birthdate)) { setError("LISTn is for ages 13 and up."); return }
        setIsLoading(true)
        try {
            await register(birthdate, email, password, username, username)
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
            {step === 1 && (
                <StepBirthday
                    birthMonth={birthMonth} setBirthMonth={setBirthMonth}
                    birthDay={birthDay} setBirthDay={setBirthDay}
                    birthYear={birthYear} setBirthYear={setBirthYear}
                    error={error}
                    blocked={ageBlocked}
                    onBack={() => navigation.goBack()}
                    onNext={handleBirthdayNext}
                    onSignIn={() => navigation.replace("Login")}
                />
            )}
            {step === 2 && (
                <StepAccount
                    username={username} setUsername={setUsername}
                    email={email} setEmail={setEmail}
                    password={password} setPassword={setPassword}
                    showPassword={showPassword} setShowPassword={setShowPassword}
                    termsAccepted={termsAccepted} setTermsAccepted={setTermsAccepted}
                    error={error}
                    isLoading={isLoading}
                    onBack={() => { setError(null); setStep(1) }}
                    onNext={handleSubmit}
                />
            )}
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
    atSign: {
        fontSize: 15,
        fontWeight: "700",
        color: INK_DIM,
        width: 18,
        textAlign: "center",
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
    termsRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 10,
        marginTop: 18,
    },
    checkbox: {
        width: 20,
        height: 20,
        borderRadius: 6,
        borderWidth: 1.5,
        borderColor: LINE,
        backgroundColor: CARD,
        alignItems: "center",
        justifyContent: "center",
        marginTop: 1,
    },
    checkboxChecked: {
        backgroundColor: INK,
        borderColor: INK,
    },
    termsText: {
        flex: 1,
        fontSize: 12,
        color: INK_SOFT,
        lineHeight: 18,
    },
    error: {
        color: DANGER,
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
    footerLink: {
        alignItems: "center",
    },
    footerText: {
        fontSize: 13.5,
        color: INK_SOFT,
    },
    // birthday gate
    dateRow: {
        flexDirection: "row",
        gap: 12,
        marginTop: 22,
    },
    dateCell: {
        flex: 1,
        alignItems: "center",
    },
    dateCellInput: {
        backgroundColor: CARD,
        borderWidth: 1,
        borderColor: LINE,
        borderRadius: 16,
        paddingVertical: 18,
        width: "100%",
        textAlign: "center",
        fontSize: 24,
        fontWeight: "800",
        color: INK,
        shadowColor: INK,
        shadowOpacity: 0.03,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
    },
    dateCellLabel: {
        fontFamily: fonts.mono,
        fontSize: 11,
        fontWeight: "600",
        color: INK_DIM,
        marginTop: 7,
        letterSpacing: 0.5,
    },
    ageChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        backgroundColor: "rgba(31,157,119,0.10)",
        borderRadius: 999,
        paddingVertical: 8,
        paddingHorizontal: 14,
        marginTop: 18,
        alignSelf: "flex-start",
    },
})
