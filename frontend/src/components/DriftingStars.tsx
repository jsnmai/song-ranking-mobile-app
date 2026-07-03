// Shared starfield backdrop for the app's "cosmic" cards — Getting Started, the locked
// social teasers, Most-rated, and Auxstrology. One component so each screen stops inventing
// its own version.
//
// PERF: the dots are NOT animated individually. Moving each dot's cx/cy would re-render the
// SVG every frame and lag the Feed (several of these cards can be on screen at once). Instead
// the field is split into 2–3 layers, and each layer is a single Reanimated view drifting on a
// slow loop via GPU-composited transforms (translate/rotate/scale) on the UI thread. The
// relative parallax between layers reads as individual stars drifting, but the JS thread does
// no per-frame work — a screenful of these costs almost nothing.
//
// The container is measured (onLayout) and each layer's SVG is drawn at explicit pixel size
// with pixel-space dot coords — the same approach as rankmap/Cosmos. Relying on width="100%"
// + percentage cx/cy silently collapses to nothing inside content-height-driven cards.
//
// Honors reduced motion: freezes to a static field.
import { useEffect, useState } from "react"
import { LayoutChangeEvent, StyleProp, StyleSheet, View, ViewStyle } from "react-native"
import Animated, {
    Easing,
    useAnimatedStyle,
    useReducedMotion,
    useSharedValue,
    withDelay,
    withRepeat,
    withTiming,
} from "react-native-reanimated"
import Svg, { Circle } from "react-native-svg"

export type StarDot = {
    // In percent mode (no `viewBox`) x/y are 0–100 percentages of the card, r is px.
    // When `viewBox` is set, x/y/r are in that viewBox's units.
    x: number
    y: number
    r: number
    o: number // opacity 0–1
    c?: string // fill colour; defaults to the `color` prop
}

// One slow drift preset per layer. Calm but perceptible: differing periods/phases keep the
// layers from ever lining back up. Layers are transparent apart from their dots, so drift
// never reveals a hard edge — the card's own background shows through continuously.
const LAYER_DRIFTS = [
    { dx: 14, dy: -10, rot: 2.5, scale: 1.05, duration: 14000, delay: 0 },
    { dx: -17, dy: 12, rot: -3, scale: 1.06, duration: 11000, delay: 900 },
    { dx: 10, dy: 16, rot: 2, scale: 1.04, duration: 17000, delay: 500 },
] as const

type Drift = (typeof LAYER_DRIFTS)[number]

function StarLayer({
    dots,
    color,
    width,
    height,
    viewBox,
    preserveAspectRatio,
    drift,
    reduced,
}: {
    dots: readonly StarDot[]
    color: string
    width: number
    height: number
    viewBox?: string
    preserveAspectRatio?: string
    drift: Drift
    reduced: boolean
}) {
    const { dx, dy, rot, scale, duration, delay } = drift
    const t = useSharedValue(0)
    useEffect(() => {
        if (reduced) {
            t.value = 0 // assigning a plain value cancels any in-flight loop → static field
            return
        }
        t.value = withDelay(
            delay,
            withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.ease) }), -1, true),
        )
    }, [reduced, t, dx, dy, rot, scale, duration, delay])
    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: t.value * dx },
            { translateY: t.value * dy },
            { rotate: `${t.value * rot}deg` },
            { scale: 1 + t.value * (scale - 1) },
        ],
    }))
    return (
        <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]} pointerEvents="none">
            <Svg
                width={width}
                height={height}
                viewBox={viewBox}
                preserveAspectRatio={viewBox ? preserveAspectRatio : undefined}
            >
                {dots.map((d, i) => (
                    <Circle
                        key={i}
                        cx={viewBox ? d.x : (d.x / 100) * width}
                        cy={viewBox ? d.y : (d.y / 100) * height}
                        r={d.r}
                        fill={d.c ?? color}
                        opacity={d.o}
                    />
                ))}
            </Svg>
        </Animated.View>
    )
}

export function DriftingStars({
    dots,
    color = "#fff",
    viewBox,
    preserveAspectRatio = "xMidYMid slice",
    style,
}: {
    dots: readonly StarDot[]
    color?: string
    // Pass a viewBox (e.g. "0 0 100 100") to render in viewBox-unit coordinates with a `slice`
    // fit; omit it to place dots by percentage across the card.
    viewBox?: string
    preserveAspectRatio?: string
    style?: StyleProp<ViewStyle>
}) {
    const reduced = useReducedMotion()
    const [size, setSize] = useState({ w: 0, h: 0 })
    const onLayout = (e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout
        setSize((s) => (s.w === width && s.h === height ? s : { w: width, h: height }))
    }
    // Round-robin the dots across layers so each layer still spans the whole card.
    const layerCount = Math.min(LAYER_DRIFTS.length, Math.max(1, dots.length))
    return (
        <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none" onLayout={onLayout}>
            {size.w > 0 &&
                size.h > 0 &&
                LAYER_DRIFTS.slice(0, layerCount).map((drift, li) => (
                    <StarLayer
                        key={li}
                        dots={dots.filter((_, i) => i % layerCount === li)}
                        color={color}
                        width={size.w}
                        height={size.h}
                        viewBox={viewBox}
                        preserveAspectRatio={preserveAspectRatio}
                        drift={drift}
                        reduced={reduced}
                    />
                ))}
        </View>
    )
}
