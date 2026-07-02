// Rank Map — the ambient cosmos behind the stars.
// Layered for depth, not a flat wash: an off-center core glow deepening to a
// near-black rim, three faint blurred-looking nebula veils (plum/sky/gold), a
// round multi-tier starfield (dust/mid/hero — no aspect distortion, gentle
// hero twinkle), a slow real-feeling drift, and an edge vignette that focuses
// attention on the galaxy. Plus the faint dashed orbit rings used by Gravity.
// All decorative; sits behind every interactive node.
import { useEffect, useMemo } from "react"
import { StyleSheet, View } from "react-native"
import Animated, {
    Easing,
    useAnimatedStyle,
    useReducedMotion,
    useSharedValue,
    withDelay,
    withRepeat,
    withTiming,
} from "react-native-reanimated"
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from "react-native-svg"

import { colors } from "../../../theme"
import { rng } from "./layouts"

type Star = { x: number; y: number; s: number; o: number }

// Round dust + mid stars — plain SVG circles positioned in real pixel space
// (viewBox matches the container 1:1), so nothing stretches into an oval
// regardless of the screen's aspect ratio.
function Starfield({ seed, width, height }: { seed: string; width: number; height: number }) {
    const { dust, mid } = useMemo(() => {
        const r = rng(seed)
        const dust: Star[] = []
        const mid: Star[] = []
        for (let i = 0; i < 86; i++) dust.push({ x: r() * width, y: r() * height, s: 0.35 + r() * 0.5, o: 0.1 + r() * 0.2 })
        for (let i = 0; i < 24; i++) mid.push({ x: r() * width, y: r() * height, s: 0.8 + r() * 0.6, o: 0.3 + r() * 0.3 })
        return { dust, mid }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [seed, width, height])
    return (
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
            {dust.map((s, i) => (
                <Circle key={`d${i}`} cx={s.x} cy={s.y} r={s.s} fill={colors.cream} opacity={s.o} />
            ))}
            {mid.map((s, i) => (
                <Circle key={`m${i}`} cx={s.x} cy={s.y} r={s.s} fill={colors.cream} opacity={s.o} />
            ))}
        </Svg>
    )
}

type HeroSpec = { x: number; y: number; s: number; duration: number; delay: number }

// A bright hand-picked star with its own slow, independent twinkle — a soft
// glow (not a hard-edged dot) that breathes between dim and bright.
function HeroStar({ x, y, s, duration, delay, reduced }: HeroSpec & { reduced: boolean }) {
    const twinkle = useSharedValue(0.25)
    useEffect(() => {
        if (reduced) {
            twinkle.value = 0.6
            return
        }
        twinkle.value = withDelay(
            delay * 1000,
            withRepeat(withTiming(1, { duration: duration * 1000, easing: Easing.inOut(Easing.sin) }), -1, true),
        )
    }, [reduced, duration, delay, twinkle])

    const style = useAnimatedStyle(() => ({ opacity: 0.25 + twinkle.value * 0.65 }))

    return (
        <Animated.View
            pointerEvents="none"
            style={[
                {
                    position: "absolute",
                    left: `${x}%`,
                    top: `${y}%`,
                    width: s,
                    height: s,
                    borderRadius: s,
                    backgroundColor: "#fff",
                    shadowColor: colors.cream,
                    shadowOpacity: 0.5,
                    shadowRadius: s * 3,
                    shadowOffset: { width: 0, height: 0 },
                },
                style,
            ]}
        />
    )
}

// Soft, low-opacity color washes for depth — reads as layered space, not a flat gradient.
const NEBULA_VEILS = [
    { color: colors.plum, cx: 0.24, cy: 0.24, rx: 0.36, ry: 0.22, opacity: 0.11 },
    { color: colors.sky, cx: 0.81, cy: 0.56, rx: 0.35, ry: 0.24, opacity: 0.07 },
    { color: colors.gold, cx: 0.54, cy: 0.97, rx: 0.38, ry: 0.21, opacity: 0.06 },
]

// Background gradient + a drifting (rotating) starfield layer.
export function Cosmos({
    width,
    height,
    seed = "rm",
    zoom = 1,
    pan = { x: 0, y: 0 },
}: {
    width: number
    height: number
    seed?: string
    /**
     * Live camera state from RankMapScreen. The starfield moves/grows a little
     * with it (well under 1:1) — real parallax, so the backdrop isn't a frozen
     * reference frame fighting the foreground orbs' own zoom growth. Without
     * this, zooming into a small cluster of similar-looking dots against an
     * utterly static field of similar-looking dots reads as "nothing moved."
     */
    zoom?: number
    pan?: { x: number; y: number }
}) {
    const reduced = useReducedMotion()
    const rot = useSharedValue(0)
    const zoomSv = useSharedValue(zoom)
    const panXSv = useSharedValue(pan.x)
    const panYSv = useSharedValue(pan.y)
    useEffect(() => {
        if (reduced) return
        // A slow, calm parallax-like drift rather than a screensaver spin.
        rot.value = withRepeat(withTiming(360, { duration: 260000, easing: Easing.linear }), -1, false)
    }, [reduced, rot])

    useEffect(() => { zoomSv.value = withTiming(zoom, { duration: 180 }) }, [zoom, zoomSv])
    useEffect(() => { panXSv.value = withTiming(pan.x, { duration: 80 }) }, [pan.x, panXSv])
    useEffect(() => { panYSv.value = withTiming(pan.y, { duration: 80 }) }, [pan.y, panYSv])

    const driftStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: panXSv.value * 0.1 },
            { translateY: panYSv.value * 0.1 },
            { scale: 1 + (zoomSv.value - 1) * 0.18 },
            { rotate: `${rot.value}deg` },
        ],
    }))

    const heroes = useMemo(() => {
        const r = rng(`${seed}-hero`)
        const out: HeroSpec[] = []
        for (let i = 0; i < 7; i++) {
            const d = r() * 5
            out.push({ x: r() * 100, y: r() * 100, s: 1.7 + r() * 1.0, duration: 5.5 + d, delay: d })
        }
        return out
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [seed])

    // oversize the drift layer so rotation (and the parallax above) never reveals an empty corner
    const pad = Math.max(width, height) * 0.4
    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
                <Defs>
                    <RadialGradient id="cosmosBg" cx="50%" cy="28%" rx="135%" ry="105%">
                        <Stop offset="0%" stopColor={colors.navyHi} />
                        <Stop offset="44%" stopColor={colors.navy} />
                        <Stop offset="100%" stopColor={colors.navy2} />
                    </RadialGradient>
                    {NEBULA_VEILS.map((v, i) => (
                        <RadialGradient key={i} id={`cosmosVeil${i}`} cx="50%" cy="50%" r="50%">
                            <Stop offset="0%" stopColor={v.color} stopOpacity={v.opacity} />
                            <Stop offset="100%" stopColor={v.color} stopOpacity={0} />
                        </RadialGradient>
                    ))}
                    <RadialGradient id="cosmosVignette" cx="50%" cy="40%" rx="125%" ry="92%">
                        <Stop offset="50%" stopColor="#05070d" stopOpacity={0} />
                        <Stop offset="100%" stopColor="#05070d" stopOpacity={0.6} />
                    </RadialGradient>
                </Defs>
                <Rect x={0} y={0} width={width} height={height} fill="url(#cosmosBg)" />
                {NEBULA_VEILS.map((v, i) => (
                    <Rect
                        key={i}
                        x={(v.cx - v.rx) * width}
                        y={(v.cy - v.ry) * height}
                        width={v.rx * 2 * width}
                        height={v.ry * 2 * height}
                        fill={`url(#cosmosVeil${i})`}
                    />
                ))}
            </Svg>
            <Animated.View
                style={[{ position: "absolute", left: -pad, top: -pad, right: -pad, bottom: -pad }, driftStyle]}
            >
                <Starfield seed={seed} width={width + pad * 2} height={height + pad * 2} />
                {heroes.map((h, i) => (
                    <HeroStar key={i} {...h} reduced={reduced} />
                ))}
            </Animated.View>
            {/* vignette — focuses the center, deepens the edges; sits above the drift layer, unaffected by it */}
            <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
                <Rect x={0} y={0} width={width} height={height} fill="url(#cosmosVignette)" />
            </Svg>
        </View>
    )
}

// Faint dashed orbit rings — score bands for the Gravity lens. `scale` is the world's
// supersample factor: cx/cy/radii already arrive supersampled, and stroke/dash are
// authored ×scale so they don't hairline out when the world is base-scaled back by 1/scale.
export function OrbitRings({ cx, cy, radii, scale = 1 }: { cx: number; cy: number; radii: number[]; scale?: number }) {
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
                    strokeWidth={0.8 * scale}
                    strokeDasharray={`${2 * scale} ${5 * scale}`}
                />
            ))}
        </Svg>
    )
}
