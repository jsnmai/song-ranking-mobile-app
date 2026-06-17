// Rank Map — the ambient cosmos behind the stars.
// A navy radial wash + a seeded starfield that drifts very slowly (one full
// rotation every two minutes), plus the faint dashed orbit rings used by the
// Gravity lens. All decorative; sits behind every interactive node.
import { useEffect, useMemo } from "react"
import { StyleSheet, View } from "react-native"
import Animated, {
    Easing,
    useAnimatedStyle,
    useReducedMotion,
    useSharedValue,
    withRepeat,
    withTiming,
} from "react-native-reanimated"
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from "react-native-svg"

import { colors } from "../../../theme"
import { rng } from "./layouts"

// A seeded field of faint stars, sized to its own box (0..100 viewBox, stretched).
function Starfield({ seed, density = 1.4 }: { seed: string; density?: number }) {
    const stars = useMemo(() => {
        const r = rng(seed)
        const out: { x: number; y: number; s: number; o: number }[] = []
        for (let i = 0; i < 42 * density; i++) {
            out.push({ x: r() * 100, y: r() * 100, s: r() < 0.85 ? 0.3 : 0.55, o: 0.16 + r() * 0.5 })
        }
        return out
    }, [seed, density])
    return (
        <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
            {stars.map((s, i) => (
                <Circle key={i} cx={s.x} cy={s.y} r={s.s} fill={colors.cream} opacity={s.o} />
            ))}
        </Svg>
    )
}

// Background gradient + a drifting (rotating) starfield layer.
export function Cosmos({ width, height, seed = "rm" }: { width: number; height: number; seed?: string }) {
    const reduced = useReducedMotion()
    const rot = useSharedValue(0)
    useEffect(() => {
        if (reduced) return
        rot.value = withRepeat(withTiming(360, { duration: 120000, easing: Easing.linear }), -1, false)
    }, [reduced, rot])

    const driftStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }))

    // oversize the drift layer so rotation never reveals an empty corner
    const pad = Math.max(width, height) * 0.4
    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
                <Defs>
                    <RadialGradient id="cosmosBg" cx="50%" cy="36%" rx="120%" ry="90%">
                        <Stop offset="0%" stopColor={colors.navyHi} />
                        <Stop offset="52%" stopColor={colors.navy} />
                        <Stop offset="100%" stopColor={colors.navy2} />
                    </RadialGradient>
                </Defs>
                <Rect x={0} y={0} width={width} height={height} fill="url(#cosmosBg)" />
            </Svg>
            <Animated.View
                style={[{ position: "absolute", left: -pad, top: -pad, right: -pad, bottom: -pad }, driftStyle]}
            >
                <Starfield seed={seed} />
            </Animated.View>
        </View>
    )
}

// Faint dashed orbit rings — score bands for the Gravity lens.
export function OrbitRings({ cx, cy, radii }: { cx: number; cy: number; radii: number[] }) {
    return (
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
            {radii.map((r, i) => (
                <Circle
                    key={i}
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="none"
                    stroke={i === 0 ? colors.gold : colors.cream}
                    strokeOpacity={i === 0 ? 0.32 : 0.1}
                    strokeWidth={0.8}
                    strokeDasharray="2 5"
                />
            ))}
        </Svg>
    )
}
