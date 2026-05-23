import { type ReactNode } from "react"
import { StyleSheet, View } from "react-native"
import Svg, { Circle, Path } from "react-native-svg"

import { colors } from "../theme"

type ScoreArcProps = {
    score: number
    max?: number
    size: number
    strokeWidth?: number
    color: string
    trackColor?: string
    sweepDegrees?: number
    children?: ReactNode
    testID?: string
}

export default function ScoreArc({
    score,
    max = 10,
    size,
    strokeWidth = 4,
    color,
    trackColor = colors.sand,
    sweepDegrees = 360,
    children,
    testID,
}: ScoreArcProps) {
    const clamped = Math.max(0, Math.min(max, score))
    const cx = size / 2
    const cy = size / 2
    const radius = (size - strokeWidth) / 2 - 2
    const circumference = 2 * Math.PI * radius
    const pct = clamped / max
    const isPartial = sweepDegrees < 360

    // Partial arc: gap centered at bottom (90° in SVG = 6 o'clock).
    // Sweeps clockwise from lower-left to lower-right.
    const halfGap = (360 - sweepDegrees) / 2
    const startAngleRad = ((90 + halfGap) * Math.PI) / 180
    const endAngleRad = ((90 - halfGap) * Math.PI) / 180
    const startX = cx + radius * Math.cos(startAngleRad)
    const startY = cy + radius * Math.sin(startAngleRad)
    const endX = cx + radius * Math.cos(endAngleRad)
    const endY = cy + radius * Math.sin(endAngleRad)
    const largeArcFlag = sweepDegrees > 180 ? 1 : 0
    const arcPath = `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}`
    const arcLength = (sweepDegrees / 360) * circumference

    return (
        <View
            testID={testID}
            accessibilityRole="image"
            accessibilityLabel={`${clamped.toFixed(1)} out of ${max} score arc`}
            style={[styles.wrapper, { width: size, height: size }]}
        >
            <Svg width={size} height={size} style={styles.svg}>
                {isPartial ? (
                    <>
                        <Path
                            d={arcPath}
                            stroke={trackColor}
                            strokeWidth={strokeWidth}
                            fill="none"
                            strokeLinecap="round"
                        />
                        <Path
                            d={arcPath}
                            stroke={color}
                            strokeWidth={strokeWidth}
                            fill="none"
                            strokeDasharray={`${arcLength} ${arcLength}`}
                            strokeDashoffset={arcLength * (1 - pct)}
                            strokeLinecap="round"
                        />
                    </>
                ) : (
                    <>
                        <Circle
                            cx={cx}
                            cy={cy}
                            r={radius}
                            stroke={trackColor}
                            strokeWidth={strokeWidth}
                            fill="none"
                        />
                        <Circle
                            cx={cx}
                            cy={cy}
                            r={radius}
                            stroke={color}
                            strokeWidth={strokeWidth}
                            fill="none"
                            strokeDasharray={`${circumference} ${circumference}`}
                            strokeDashoffset={circumference * (1 - pct)}
                            strokeLinecap="round"
                            transform={`rotate(-90 ${cx} ${cy})`}
                        />
                    </>
                )}
            </Svg>
            {children}
        </View>
    )
}

const styles = StyleSheet.create({
    wrapper: {
        alignItems: "center",
        justifyContent: "center",
    },
    svg: {
        position: "absolute",
    },
})
