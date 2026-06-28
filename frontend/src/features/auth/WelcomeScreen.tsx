// 3-step intro carousel shown to logged-out users.
// Step 1: Rate it in one tap  →  Step 2: Pick by pick  →  Step 3: Your ranking, always live
// Step 3 ends with Create account / Sign in CTAs.
import { useCallback, useRef, useState } from "react"
import {
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from "react-native"
import { Gesture, GestureDetector } from "react-native-gesture-handler"
import Svg, { Path, Rect, ClipPath, Defs } from "react-native-svg"
import Animated, {
    Easing,
    FadeIn,
    interpolate,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSequence,
    withSpring,
    withTiming,
} from "react-native-reanimated"
import { useFocusEffect } from "@react-navigation/native"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { AuthStackParamList } from "../../navigation/AuthNavigator"
import { fonts } from "../../theme"

type WelcomeNavigationProp = NativeStackNavigationProp<AuthStackParamList, "Welcome">
type Props = { navigation: WelcomeNavigationProp }

// Auth-screen palette (cream canvas)
const BG = "#f4f1eb"
const CARD = "#fdfbf4"
const INK = "#11131c"
const INK_SOFT = "#3d4350"
const INK_DIM = "#8b8f9c"
const LINE = "rgba(17,19,28,0.10)"
const ACCENT = "#ff5a3c"
const SKY = "#5b8def"
const PLUM = "#7a3ad0"
const GOLD = "#f5b840"

// Bucket heart glyphs (full / left-half / broken), matching the real rating UI.
const HEART = "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
// `crackColor` is the surface behind the heart so the broken-heart split stays visible whether the
// heart is filled with the bucket color (crack = light bg) or white (crack = the bucket color).
function BucketHeart({ bucket, color, size = 16, crackColor = "#fff" }: { bucket: "like" | "okay" | "dislike"; color: string; size?: number; crackColor?: string }) {
    if (bucket === "okay") {
        return (
            <Svg width={size} height={size} viewBox="0 0 24 24">
                <Defs>
                    <ClipPath id="welcome-lhalf"><Rect x="0" y="0" width="12" height="24" /></ClipPath>
                </Defs>
                <Path d={HEART} fill="none" stroke={color} strokeWidth={1.6} />
                <Path d={HEART} fill={color} clipPath="url(#welcome-lhalf)" />
            </Svg>
        )
    }
    if (bucket === "dislike") {
        return (
            <Svg width={size} height={size} viewBox="0 0 24 24">
                <Path d={HEART} fill={color} />
                <Path d="M12 5.5 10 11h4l-2 5.5" stroke={crackColor} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </Svg>
        )
    }
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
            <Path d={HEART} fill={color} />
        </Svg>
    )
}

const SNAP = { duration: 320, easing: Easing.out(Easing.cubic) }
const N = 3 // step count
const NEXT_H = 52  // height of the Next button alone
const CTA_H = 100  // height of Create account + Sign in together

// Solid color tile simulating the design's gradient album art
function AlbumTile({ bg, size, radius = 12 }: { bg: string; size: number; radius?: number }) {
    return (
        <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: bg, overflow: "hidden" }}>
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(255,255,255,0.08)" }]} />
        </View>
    )
}

// ── Step 1 visual: song card + tappable Like/Okay/Dislike chips ──────────
const RATE_BUCKETS = [
    { key: "like", label: "Like", color: ACCENT },
    { key: "okay", label: "Okay", color: SKY },
    { key: "dislike", label: "Dislike", color: PLUM },
] as const

function VisRate() {
    // Demo-only: tapping a chip selects it and swaps the song-art heart to match.
    const [bucket, setBucket] = useState<"like" | "okay" | "dislike">("like")
    const selectedColor = RATE_BUCKETS.find((b) => b.key === bucket)!.color
    return (
        <View style={[styles.stage, { backgroundColor: "rgba(255,90,60,0.07)" }]}>
            <View style={styles.visCard}>
                <View style={{ alignItems: "center" }}>
                    <View>
                        <AlbumTile bg="#4a3880" size={88} radius={16} />
                        <View style={[styles.heartBadge, { backgroundColor: selectedColor, shadowColor: selectedColor }]}>
                            <BucketHeart bucket={bucket} color="#fff" size={16} crackColor={selectedColor} />
                        </View>
                    </View>
                    <Text style={styles.visSongTitle}>Song</Text>
                    <Text style={styles.visArtist}>Artist</Text>
                </View>
                <View style={{ gap: 9, marginTop: 14 }}>
                    {RATE_BUCKETS.map((b) => {
                        const selected = bucket === b.key
                        return (
                            <TouchableOpacity
                                key={b.key}
                                activeOpacity={0.85}
                                onPress={() => setBucket(b.key)}
                                accessibilityRole="button"
                                accessibilityLabel={b.label}
                                accessibilityState={{ selected }}
                                style={[
                                    styles.bucketChip,
                                    selected
                                        ? { backgroundColor: b.color }
                                        : { backgroundColor: CARD, borderWidth: 1, borderColor: LINE },
                                ]}
                            >
                                <BucketHeart bucket={b.key} color={selected ? "#fff" : b.color} crackColor={selected ? b.color : CARD} />
                                <Text style={[styles.bucketLabel, { color: selected ? "#fff" : INK_SOFT }]}>{b.label}</Text>
                            </TouchableOpacity>
                        )
                    })}
                </View>
            </View>
        </View>
    )
}

// ── Step 2 visual: two VS cards ──────────────────────────────────────────
// One tappable versus card: art matches its glow, and a tap "slams" it (quick squash + spring back).
function VsSong({ glow, title, artist }: { glow: string; title: string; artist: string }) {
    const scale = useSharedValue(1)
    const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
    const onPress = () => {
        scale.value = withSequence(
            withTiming(0.9, { duration: 70, easing: Easing.out(Easing.quad) }),
            withSpring(1, { damping: 5, stiffness: 220, mass: 0.6 }),
        )
    }
    return (
        <Animated.View style={[styles.vsSongWrap, aStyle]}>
            <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={[styles.vsCard, { borderColor: `${glow}55`, shadowColor: glow }]}>
                <AlbumTile bg={glow} size={68} radius={12} />
                <Text style={styles.vsTitle}>{title}</Text>
                <Text style={styles.vsArtist}>{artist}</Text>
            </Pressable>
        </Animated.View>
    )
}

function VisVersus() {
    return (
        <View style={[styles.stage, { backgroundColor: "rgba(91,141,239,0.08)" }]}>
            <View style={{ position: "relative", flexDirection: "row", alignItems: "center", gap: 12, width: 252 }}>
                <VsSong glow={ACCENT} title="Song 1" artist="Artist 1" />
                <VsSong glow={SKY} title="Song 2" artist="Artist 2" />
                <View style={styles.vsBadge}>
                    <Text style={styles.vsText}>VS</Text>
                </View>
            </View>
        </View>
    )
}

// ── Step 3 visual: mini ranked list with #1 highlighted gold ─────────────
function VisRank() {
    const rows = [
        { bg: "#4a3880", barW: 110 },
        { bg: "#2d5a8f", barW: 90 },
        { bg: "#8f3a2d", barW: 72 },
        { bg: "#2d8f5a", barW: 58 },
    ]
    return (
        <View style={[styles.stage, { backgroundColor: "rgba(245,184,64,0.12)" }]}>
            <View style={styles.rankCard}>
                {rows.map((r, i) => (
                    <View
                        key={i}
                        style={[
                            styles.rankRow,
                            i === 0 && {
                                backgroundColor: "rgba(245,184,64,0.14)",
                                borderWidth: 1.5,
                                borderColor: GOLD,
                            },
                        ]}
                    >
                        <Text style={[styles.rankNum, { color: i === 0 ? "#b6841a" : INK_DIM }]}>{i + 1}</Text>
                        <AlbumTile bg={r.bg} size={32} radius={8} />
                        <View style={{ flex: 1, gap: 4 }}>
                            <View style={{ height: 7, width: r.barW, backgroundColor: "rgba(17,19,28,0.16)", borderRadius: 4 }} />
                            <View style={{ height: 5, width: r.barW * 0.65, backgroundColor: "rgba(17,19,28,0.09)", borderRadius: 4 }} />
                        </View>
                        {i === 0 && <Text style={{ color: GOLD, fontSize: 14 }}>★</Text>}
                    </View>
                ))}
            </View>
        </View>
    )
}

// ── Step data ─────────────────────────────────────────────────────────────
type Step = { visual: React.ReactNode; title: string; sub: string }

const STEPS: Step[] = [
    {
        visual: <VisRate />,
        title: "Rate it in\none tap.",
        sub: "Heard a song? Drop it into Like, Okay, or Dislike.\nNo 5-star math — just how it landed.",
    },
    {
        visual: <VisVersus />,
        title: "Pick by\npick.",
        sub: "LISTn lines songs up two at a time and asks which you'd keep. Each choice narrows it down until every song finds its spot.",
    },
    {
        visual: <VisRank />,
        title: "Your ranking,\nalways live.",
        sub: "Every rating snaps into place — fueling your full rankings, stats, and listening insights that grow as you go.",
    },
]

export default function WelcomeScreen({ navigation }: Props) {
    const [step, setStep] = useState(0)
    const { width } = useWindowDimensions()
    const isLast = step === N - 1

    // Prevents spam-tapping CTAs from stacking multiple screens on the back stack.
    // Resets whenever Welcome regains focus (user came back from Login/Register).
    const navigating = useRef(false)
    useFocusEffect(useCallback(() => { navigating.current = false }, []))

    function navigateTo(screen: "Register" | "Login") {
        if (navigating.current) return
        navigating.current = true
        navigation.navigate(screen)
    }

    // Continuous animated position: 0 = step 0, 1 = step 1, 2 = step 2
    const animPos = useSharedValue(0)
    const startPos = useSharedValue(0)
    const startStep = useSharedValue(0)

    function goToStep(n: number) {
        const clamped = Math.max(0, Math.min(N - 1, n))
        setStep(clamped)
        animPos.value = withTiming(clamped, SNAP)
    }

    // Pan gesture tracks finger in real time on UI thread
    const panGesture = Gesture.Pan()
        .activeOffsetX([-12, 12])
        .failOffsetY([-12, 12])
        .onBegin(() => {
            startPos.value = animPos.value
            startStep.value = Math.round(animPos.value)
        })
        .onUpdate(e => {
            // Clamp drag to ±1 step from where gesture started
            const next = startPos.value - e.translationX / width
            const lo = startStep.value - 1
            const hi = startStep.value + 1
            animPos.value = Math.max(lo - 0.1, Math.min(hi + 0.1, next))
        })
        .onEnd(e => {
            const velocity = -e.velocityX / width
            const displacement = animPos.value - startStep.value
            // Move one step if swiped fast enough or past halfway
            let target = startStep.value
            if (velocity > 0.4 || displacement > 0.4) target = startStep.value + 1
            else if (velocity < -0.4 || displacement < -0.4) target = startStep.value - 1
            target = Math.max(0, Math.min(N - 1, target))
            animPos.value = withTiming(target, SNAP)
            runOnJS(setStep)(target)
        })

    // Visual strip: all 3 stages slide as one connected panel
    const slideStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: -animPos.value * width }],
    }))

    // Dots: width + opacity interpolated continuously from animPos
    const dot0Style = useAnimatedStyle(() => ({
        width: interpolate(Math.abs(animPos.value - 0), [0, 1], [22, 7], "clamp"),
        opacity: interpolate(Math.abs(animPos.value - 0), [0, 1], [1, 0.18], "clamp"),
    }))
    const dot1Style = useAnimatedStyle(() => ({
        width: interpolate(Math.abs(animPos.value - 1), [0, 1], [22, 7], "clamp"),
        opacity: interpolate(Math.abs(animPos.value - 1), [0, 1], [1, 0.18], "clamp"),
    }))
    const dot2Style = useAnimatedStyle(() => ({
        width: interpolate(Math.abs(animPos.value - 2), [0, 1], [22, 7], "clamp"),
        opacity: interpolate(Math.abs(animPos.value - 2), [0, 1], [1, 0.18], "clamp"),
    }))

    // Buttons: cross-fade + the button area grows as animPos approaches 2
    const nextBtnStyle = useAnimatedStyle(() => ({
        opacity: interpolate(animPos.value, [1.5, 2], [1, 0], "clamp"),
    }))
    const ctaBtnStyle = useAnimatedStyle(() => ({
        opacity: interpolate(animPos.value, [1.5, 2], [0, 1], "clamp"),
    }))
    // Growing the button area from step 1→2 shrinks stripContainer (flex:1),
    // which is what creates the escalating "level" effect.
    const btnAreaStyle = useAnimatedStyle(() => ({
        height: interpolate(animPos.value, [1, 2], [NEXT_H, CTA_H], "clamp"),
    }))

    return (
        <GestureDetector gesture={panGesture}>
            <View style={styles.container}>
                {/* Header: wordmark + Skip */}
                <View style={styles.header}>
                    <Text style={styles.wordmark}>LISTn</Text>
                    {!isLast && (
                        <TouchableOpacity onPress={() => goToStep(N - 1)}>
                            <Text style={styles.skipText}>Skip</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Visual strip — all 3 stages side by side, clips at container edges */}
                <View style={styles.stripContainer}>
                    <Animated.View style={[styles.strip, { width: width * N }, slideStyle]}>
                        {STEPS.map((s, i) => (
                            <View key={i} style={[styles.slide, { width }]}>
                                {s.visual}
                            </View>
                        ))}
                    </Animated.View>
                </View>

                {/* Bottom */}
                <View style={styles.bottom}>
                    {/* Animated dots */}
                    <View style={styles.dots}>
                        <Animated.View style={[styles.dot, dot0Style]} />
                        <Animated.View style={[styles.dot, dot1Style]} />
                        <Animated.View style={[styles.dot, dot2Style]} />
                    </View>

                    {/* Title + sub: remount with fade on step change */}
                    <Animated.View key={step} entering={FadeIn.duration(220)}>
                        <Text style={styles.title}>{STEPS[step].title}</Text>
                        <Text style={styles.sub}>{STEPS[step].sub}</Text>
                    </Animated.View>

                    {/* Buttons: always rendered, cross-fade + height grows as animPos→2 */}
                    <Animated.View style={[styles.btnArea, btnAreaStyle]}>
                        {/* Next button — fades out approaching step 2 */}
                        <Animated.View
                            style={[StyleSheet.absoluteFill, nextBtnStyle]}
                            pointerEvents={isLast ? "none" : "auto"}
                        >
                            <TouchableOpacity
                                style={styles.primaryBtn}
                                onPress={() => goToStep(step + 1)}
                                activeOpacity={0.85}
                            >
                                <Text style={styles.primaryBtnText}>Next</Text>
                                <Text style={styles.arrow}>→</Text>
                            </TouchableOpacity>
                        </Animated.View>

                        {/* CTAs — fade in on step 2 */}
                        <Animated.View
                            style={ctaBtnStyle}
                            pointerEvents={isLast ? "auto" : "none"}
                        >
                            <TouchableOpacity
                                style={styles.primaryBtn}
                                onPress={() => navigateTo("Register")}
                                activeOpacity={0.85}
                            >
                                <Text style={styles.primaryBtnText}>Create account</Text>
                                <Text style={styles.arrow}>→</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={{ alignItems: "center", marginTop: 20 }}
                                onPress={() => navigateTo("Login")}
                            >
                                <Text style={styles.signInLink}>
                                    Already on LISTn?{" "}
                                    <Text style={{ color: INK, fontWeight: "700" }}>Sign in</Text>
                                </Text>
                            </TouchableOpacity>
                        </Animated.View>
                    </Animated.View>
                </View>
            </View>
        </GestureDetector>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: BG,
        paddingTop: 56,
        paddingBottom: 32,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 22,
    },
    wordmark: {
        fontFamily: fonts.serif,
        fontSize: 20,
        color: INK,
        letterSpacing: -0.3,
    },
    skipText: {
        fontSize: 13.5,
        fontWeight: "600",
        color: INK_SOFT,
    },
    // Visual strip
    stripContainer: {
        flex: 1,
        overflow: "hidden",
        marginTop: 16,
        marginBottom: 18,
    },
    strip: {
        flex: 1,
        flexDirection: "row",
    },
    slide: {
        flex: 1,
        paddingHorizontal: 22,
    },
    // stage wraps each intro visual — fills the slide
    stage: {
        flex: 1,
        borderRadius: 26,
        borderWidth: 1,
        borderColor: LINE,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
    },
    // Bottom section
    bottom: {
        paddingHorizontal: 22,
    },
    dots: {
        flexDirection: "row",
        gap: 7,
        alignItems: "center",
    },
    dot: {
        height: 7,
        borderRadius: 999,
        backgroundColor: INK,
    },
    title: {
        fontSize: 32,
        fontWeight: "800",
        color: INK,
        letterSpacing: -0.8,
        lineHeight: 36,
        marginTop: 16,
    },
    sub: {
        fontSize: 14,
        color: INK_SOFT,
        marginTop: 11,
        lineHeight: 21,
    },
    // Height is driven by btnAreaStyle (animated), overflow clips during growth
    btnArea: {
        marginTop: 22,
        overflow: "hidden",
    },
    primaryBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 9,
        backgroundColor: INK,
        borderRadius: 999,
        paddingVertical: 16,
        paddingHorizontal: 24,
        // No shadow: the button lives inside the `overflow: hidden` btnArea (which clips the
        // height-animated CTA stack), so a shadow gets clipped into a hard rectangle.
    },
    primaryBtnText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "600",
    },
    arrow: {
        color: "#fff",
        fontSize: 16,
    },
    signInLink: {
        fontSize: 14.5,
        color: INK_SOFT,
    },
    // ── Step visuals ──────────────────────────────────────────────────────
    visCard: {
        backgroundColor: CARD,
        borderRadius: 22,
        padding: 18,
        shadowColor: INK,
        shadowOpacity: 0.12,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 10 },
        borderWidth: 1,
        borderColor: LINE,
        width: 248,
    },
    visSongTitle: {
        fontWeight: "800",
        fontSize: 15,
        color: INK,
        marginTop: 12,
    },
    visArtist: {
        fontSize: 12,
        color: INK_DIM,
        marginTop: 2,
    },
    heartBadge: {
        position: "absolute",
        right: -8,
        bottom: -8,
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: ACCENT,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: ACCENT,
        shadowOpacity: 0.4,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        borderWidth: 2.5,
        borderColor: CARD,
    },
    bucketChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 999,
    },
    bucketLabel: {
        fontSize: 13,
        fontWeight: "700",
    },
    vsSongWrap: {
        flex: 1,
    },
    vsCard: {
        backgroundColor: CARD,
        borderRadius: 18,
        padding: 12,
        alignItems: "center",
        borderWidth: 1.5,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
    },
    vsTitle: {
        fontWeight: "800",
        fontSize: 13,
        color: INK,
        marginTop: 10,
        textAlign: "center",
    },
    vsArtist: {
        fontSize: 11,
        color: INK_DIM,
        marginTop: 2,
    },
    vsBadge: {
        position: "absolute",
        left: "50%",
        top: "50%",
        marginLeft: -22,
        marginTop: -22,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: INK,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: INK,
        shadowOpacity: 0.3,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        borderWidth: 3,
        borderColor: BG,
    },
    vsText: {
        fontFamily: fonts.serif,
        fontSize: 12,
        color: "#fff",
        letterSpacing: -0.2,
    },
    rankCard: {
        backgroundColor: CARD,
        borderRadius: 20,
        padding: 12,
        shadowColor: INK,
        shadowOpacity: 0.12,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 10 },
        borderWidth: 1,
        borderColor: LINE,
        width: 252,
        gap: 6,
    },
    rankRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        borderRadius: 12,
        paddingVertical: 7,
        paddingHorizontal: 8,
        borderWidth: 1,
        borderColor: "transparent",
    },
    rankNum: {
        fontFamily: fonts.serif,
        fontSize: 13,
        width: 16,
        textAlign: "center",
    },
})
