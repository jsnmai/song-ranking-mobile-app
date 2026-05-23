import { type ReactNode } from "react"
import { StyleSheet, View } from "react-native"
import Svg, { Circle } from "react-native-svg"

import { colors } from "../theme"

type ScoreArcProps = {
    score: number
    max?: number
    size: number
    strokeWidth?: number
    color: string
    trackColor?: string
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
    children,
    testID,
}: ScoreArcProps) {
    const clamped = Math.max(0, Math.min(max, score))
    const cx = size / 2
    const cy = size / 2
    const radius = (size - strokeWidth) / 2 - 2
    const circumference = 2 * Math.PI * radius
    const pct = clamped / max
    const strokeDasharray = `${circumference} ${circumference}`
    const strokeDashoffset = circumference * (1 - pct)

    return (
        <View
            testID={testID}
            accessibilityRole="image"
            accessibilityLabel={`${clamped.toFixed(1)} out of ${max} score arc`}
            style={[styles.wrapper, { width: size, height: size }]}
        >
            <Svg width={size} height={size} style={styles.svg}>
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
                    strokeDasharray={strokeDasharray}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    transform={`rotate(-90 ${cx} ${cy})`}
                />
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
