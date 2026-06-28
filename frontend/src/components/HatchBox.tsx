import React, { useMemo } from "react"
import { StyleProp, View, ViewStyle } from "react-native"
import Svg, { Line } from "react-native-svg"
import { colors } from "../theme"

// HatchBox — a dashed-outline skeleton "cover art" square filled with diagonal
// hatch lines, matching the empty-state ghost covers in the design system
// (repeating-linear-gradient(135deg, …) + dashed border). Used as the blank
// song-icon placeholder in locked module cards.
type Tone = "light" | "dark"

// "light" sits on dark/coloured tiles (navy, mint, sky, berry) → white hatch.
// "dark" sits on paper tiles → ink hatch.
const PRESETS: Record<Tone, { bg: string; border: string; stripe: string }> = {
    light: { bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.4)", stripe: "rgba(255,255,255,0.18)" },
    dark: { bg: colors.paper2, border: colors.inkDim, stripe: "rgba(17,19,28,0.06)" },
}

type Props = {
    size: number
    radius?: number
    tone?: Tone
    /** Width of each hatch band, in px. */
    weight?: number
    /**
     * Step between band centres along the diagonal, in px. Defaults to
     * `weight × 2√2`, which makes the perpendicular gap between bands equal to
     * the band width (a 50% duty cycle: line thickness == negative space).
     */
    gap?: number
    style?: StyleProp<ViewStyle>
}

export default function HatchBox({ size, radius = 8, tone = "light", weight = 6, gap = weight * 2 * Math.SQRT2, style }: Props) {
    const preset = PRESETS[tone]
    // Diagonal "/" hatch: each band is the segment of x + y = k clipped to the
    // square, stepped by `gap` so the bands tile the whole box.
    const lines = useMemo(() => {
        const out: React.ReactNode[] = []
        for (let k = gap; k < size * 2; k += gap) {
            const within = k <= size
            out.push(
                <Line
                    key={k}
                    x1={within ? k : size}
                    y1={within ? 0 : k - size}
                    x2={within ? 0 : k - size}
                    y2={within ? k : size}
                    stroke={preset.stripe}
                    strokeWidth={weight}
                />
            )
        }
        return out
    }, [size, gap, weight, preset.stripe])

    return (
        <View
            style={[
                {
                    width: size,
                    height: size,
                    borderRadius: radius,
                    borderWidth: 1.5,
                    borderStyle: "dashed",
                    borderColor: preset.border,
                    backgroundColor: preset.bg,
                    overflow: "hidden",
                    flexShrink: 0,
                },
                style,
            ]}
        >
            <Svg width={size} height={size} style={{ position: "absolute", top: 0, left: 0 }}>
                {lines}
            </Svg>
        </View>
    )
}
