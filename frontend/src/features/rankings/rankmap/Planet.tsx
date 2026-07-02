// Rank Map — the interactive star nodes.
// Planet: an album disc that flies out from the sun and settles onto its orbit
// (staggered entrance), then sits upright and tappable. Sun: your #1, a glowing
// disc that breathes with a pulsing halo.
import { useEffect, useMemo } from "react"
import { Image, Pressable, StyleSheet, Text, View } from "react-native"
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg"
import Animated, {
    Easing,
    useAnimatedStyle,
    useReducedMotion,
    useSharedValue,
    withDelay,
    withRepeat,
    withTiming,
} from "react-native-reanimated"

import { BucketName } from "../../comparison/types"
import { bucketColor, colors, fonts } from "../../../theme"
import { rng } from "./layouts"

const SETTLE_EASING = Easing.bezier(0.2, 0.85, 0.25, 1)
const COVER_OVERSCAN = 1.1

// Circular album art with a graceful fallback when there's no cover. `size` arrives already
// supersampled (RankMapScreen renders the whole world at RENDER_SCALE× resolution, then
// base-scales it back by 1/RENDER_SCALE), so the image frame — and therefore the native
// decode — is high-res, and the world's net down-scale keeps it crisp at every zoom. No
// per-image transform trick needed (that just adds an extra resample step).
export function Cover({ cover, size, bucket }: { cover: string | null; size: number; bucket: BucketName }) {
    if (cover) {
        const imageSize = size * COVER_OVERSCAN
        const offset = (size - imageSize) / 2
        return (
            <Image
                source={{ uri: cover }}
                resizeMode="cover"
                style={{
                    position: "absolute",
                    left: offset,
                    top: offset,
                    width: imageSize,
                    height: imageSize,
                    borderRadius: imageSize / 2,
                }}
            />
        )
    }
    return (
        <View
            style={{
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: colors.navyHi,
                alignItems: "center",
                justifyContent: "center",
            }}
        >
            <View
                style={{
                    width: size * 0.32,
                    height: size * 0.32,
                    borderRadius: size,
                    backgroundColor: bucketColor(bucket),
                    opacity: 0.7,
                }}
            />
        </View>
    )
}

export type PlanetProps = {
    x: number
    y: number
    size: number
    cover: string | null
    bucket: BucketName
    glow: string
    /** entrance origin offset (toward the sun / cluster center) */
    fromX: number
    fromY: number
    delay: number
    /** gold top-3 ring */
    ring?: boolean
    /** filtered/dimmed target opacity */
    targetOpacity?: number
    glowRadius?: number
    onPress?: () => void
    label?: string
    /**
     * Counter-scale against the map's camera zoom (see RankMapScreen's `zoomDamp`)
     * so orb size grows/shrinks slower than the positions around it — the same
     * trick map pins use to stay legible at every zoom instead of just getting
     * uniformly bigger/smaller with everything else. That gap between "how much
     * the gap grew" and "how much the orb grew" is what actually reads as
     * spacing changing as you zoom, not a static layout merely being rescaled.
     */
    zoomDamp?: number
    /** world supersample factor — scales fixed px (border) that must not shrink with the base 1/RS scale */
    renderScale?: number
}

export function Planet({
    x,
    y,
    size,
    cover,
    bucket,
    glow,
    fromX,
    fromY,
    delay,
    ring = false,
    targetOpacity = 1,
    glowRadius = 12,
    onPress,
    label,
    zoomDamp = 1,
    renderScale = 1,
}: PlanetProps) {
    const reduced = useReducedMotion()
    const progress = useSharedValue(reduced ? 1 : 0)
    const dim = useSharedValue(targetOpacity)
    const damp = useSharedValue(zoomDamp)

    // Idle drift once settled — a slow, gentle Lissajous-ish wander (independent x/y
    // periods) so orbs feel alive instead of pinned in place. Seeded from each orb's own
    // settled position so every star gets a different phase/period/amplitude without
    // needing an extra identity prop, and neighbors never drift in lockstep.
    const float = useMemo(() => {
        const r = rng(`${x.toFixed(1)}:${y.toFixed(1)}`)
        return {
            durX: 3200 + r() * 2200,
            durY: 3200 + r() * 2200,
            ampX: 2 + r() * 2.5,
            ampY: 2 + r() * 2.5,
            delay: r() * 1200,
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    const floatX = useSharedValue(-1)
    const floatY = useSharedValue(-1)

    useEffect(() => {
        if (reduced) {
            progress.value = 1
            return
        }
        progress.value = withDelay(delay, withTiming(1, { duration: 1050, easing: SETTLE_EASING }))
    }, [reduced, delay, progress])

    useEffect(() => {
        dim.value = withTiming(targetOpacity, { duration: 400 })
    }, [targetOpacity, dim])

    useEffect(() => {
        // Instant, not eased — the map's own zoom scale (the `world` transform in
        // RankMapScreen) changes instantly too. Animating this counter-scale on a
        // delay while that snaps immediately made every zoom step visibly "settle"
        // a beat late, reading as a bounce. Keeping both perfectly in lockstep removes it.
        damp.value = zoomDamp
    }, [zoomDamp, damp])

    useEffect(() => {
        if (reduced) return
        floatX.value = withDelay(float.delay, withRepeat(withTiming(1, { duration: float.durX, easing: Easing.inOut(Easing.sin) }), -1, true))
        floatY.value = withDelay(float.delay * 1.3, withRepeat(withTiming(1, { duration: float.durY, easing: Easing.inOut(Easing.sin) }), -1, true))
    }, [reduced, float, floatX, floatY])

    const style = useAnimatedStyle(() => {
        const p = progress.value
        return {
            opacity: p * dim.value,
            transform: [
                { translateX: fromX * (1 - p) + floatX.value * float.ampX * p },
                { translateY: fromY * (1 - p) + floatY.value * float.ampY * p },
                { scale: (0.25 + 0.75 * p) * damp.value },
            ],
        }
    })

    return (
        <Animated.View
            style={[
                {
                    position: "absolute",
                    left: x - size / 2,
                    top: y - size / 2,
                    width: size,
                    height: size,
                    // colored glow (iOS); Android approximates with elevation
                    shadowColor: glow,
                    shadowOpacity: 0.85,
                    shadowRadius: glowRadius,
                    shadowOffset: { width: 0, height: 0 },
                    elevation: 6,
                },
                style,
            ]}
        >
            <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}>
                <View
                    style={{
                        width: size,
                        height: size,
                        borderRadius: size / 2,
                        overflow: "hidden",
                        borderWidth: (ring ? 2 : 1) * renderScale,
                        borderColor: ring ? colors.gold : "rgba(255,255,255,0.18)",
                    }}
                >
                    <Cover cover={cover} size={size} bucket={bucket} />
                </View>
            </Pressable>
        </Animated.View>
    )
}

// The sun — your #1 ranked song, pulsing at the gravitational center.
export function Sun({
    x,
    y,
    size = 74,
    cover,
    bucket,
    onPress,
    targetOpacity = 1,
    zoomDamp = 1,
    renderScale = 1,
    hideBadge = false,
}: {
    x: number
    y: number
    size?: number
    cover: string | null
    bucket: BucketName
    onPress?: () => void
    targetOpacity?: number
    /** see Planet's zoomDamp — keeps the sun in visual proportion as planets around it resize */
    zoomDamp?: number
    /** world supersample factor — scales the fixed-px gold border so it doesn't hairline out */
    renderScale?: number
    /** the "NO.1" badge is rendered crisp in RankMapScreen's screen-space overlay instead */
    hideBadge?: boolean
}) {
    const reduced = useReducedMotion()
    const pulse = useSharedValue(0)
    const dim = useSharedValue(targetOpacity)
    const damp = useSharedValue(zoomDamp)
    useEffect(() => {
        if (reduced) return
        pulse.value = withRepeat(withTiming(1, { duration: 2250, easing: Easing.inOut(Easing.sin) }), -1, true)
    }, [reduced, pulse])

    useEffect(() => {
        dim.value = withTiming(targetOpacity, { duration: 400 })
    }, [targetOpacity, dim])

    useEffect(() => {
        // Instant, not eased — the map's own zoom scale (the `world` transform in
        // RankMapScreen) changes instantly too. Animating this counter-scale on a
        // delay while that snaps immediately made every zoom step visibly "settle"
        // a beat late, reading as a bounce. Keeping both perfectly in lockstep removes it.
        damp.value = zoomDamp
    }, [zoomDamp, damp])

    const sunStyle = useAnimatedStyle(() => ({
        opacity: dim.value,
        transform: [{ scale: (1 + pulse.value * 0.06) * damp.value }],
    }))
    const haloStyle = useAnimatedStyle(() => ({
        opacity: (0.62 + pulse.value * 0.24) * dim.value,
        transform: [{ scale: (1 + pulse.value * 0.12) * damp.value }],
    }))

    const haloSize = size * 2.45
    return (
        <>
            <Animated.View
                pointerEvents="none"
                style={[
                    {
                        position: "absolute",
                        left: x - haloSize / 2,
                        top: y - haloSize / 2,
                        width: haloSize,
                        height: haloSize,
                        borderRadius: haloSize / 2,
                    },
                    haloStyle,
                ]}
            >
                <Svg width={haloSize} height={haloSize}>
                    <Defs>
                        <RadialGradient id="rankMapSunHalo" cx="50%" cy="50%" rx="50%" ry="50%">
                            <Stop offset="0%" stopColor={colors.gold} stopOpacity={0.34} />
                            <Stop offset="40%" stopColor={colors.gold} stopOpacity={0.11} />
                            <Stop offset="74%" stopColor={colors.gold} stopOpacity={0} />
                        </RadialGradient>
                    </Defs>
                    <Circle
                        cx={haloSize / 2}
                        cy={haloSize / 2}
                        r={haloSize / 2}
                        fill="url(#rankMapSunHalo)"
                    />
                </Svg>
            </Animated.View>
            <Animated.View
                style={[
                    {
                        position: "absolute",
                        left: x - size / 2,
                        top: y - size / 2,
                        width: size,
                        height: size,
                        shadowColor: colors.gold,
                        shadowOpacity: 0.9,
                        shadowRadius: 28,
                        shadowOffset: { width: 0, height: 0 },
                        elevation: 10,
                    },
                    sunStyle,
                ]}
            >
                <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={"Your #1"}>
                    <View
                        style={{
                            width: size,
                            height: size,
                            borderRadius: size / 2,
                            overflow: "hidden",
                            borderWidth: 3 * renderScale,
                            borderColor: colors.gold,
                        }}
                    >
                        <Cover cover={cover} size={size} bucket={bucket} />
                    </View>
                    {!hideBadge && (
                        <View style={styles.sunBadge}>
                            <Text style={styles.sunBadgeText}>★ NO.1</Text>
                        </View>
                    )}
                </Pressable>
            </Animated.View>
        </>
    )
}

const styles = StyleSheet.create({
    sunBadge: {
        position: "absolute",
        top: -7,
        alignSelf: "center",
        backgroundColor: colors.gold,
        borderRadius: 999,
        paddingHorizontal: 6,
        paddingVertical: 2,
    },
    sunBadgeText: {
        fontFamily: fonts.mono,
        fontSize: 7.5,
        fontWeight: "700",
        letterSpacing: 1,
        color: colors.navy,
    },
})
