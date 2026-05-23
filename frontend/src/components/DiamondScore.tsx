import { View } from "react-native"

import { colors } from "../theme"

type DiamondScoreProps = {
    score: number
    total?: number
    size?: number
    color?: string
    layout?: "row" | "grid"
    testID?: string
}

function Diamond({
    type,
    fraction,
    size,
    color,
    testID,
}: {
    type: "full" | "partial" | "empty"
    fraction?: number
    size: number
    color: string
    testID?: string
}) {
    if (type === "full") {
        return (
            <View
                testID={testID}
                style={{
                    width: size,
                    height: size,
                    backgroundColor: color,
                    transform: [{ rotate: "45deg" }],
                    margin: 2,
                }}
            />
        )
    }

    if (type === "empty") {
        return (
            <View
                testID={testID}
                style={{
                    width: size,
                    height: size,
                    borderWidth: 1,
                    borderColor: color,
                    transform: [{ rotate: "45deg" }],
                    margin: 2,
                }}
            />
        )
    }

    // Partial: overflow hidden clips the inner fill view to the square boundary, then the whole
    // square is rotated — producing a left-to-right partial fill approximation without extra packages.
    return (
        <View
            testID={testID}
            style={{
                width: size,
                height: size,
                borderWidth: 1,
                borderColor: color,
                transform: [{ rotate: "45deg" }],
                margin: 2,
                overflow: "hidden",
            }}
        >
            <View
                style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `${(fraction ?? 0) * 100}%`,
                    backgroundColor: color,
                }}
            />
        </View>
    )
}

export default function DiamondScore({
    score,
    total = 10,
    size = 9,
    color = colors.clay,
    layout = "row",
    testID,
}: DiamondScoreProps) {
    const clamped = Math.max(0, Math.min(10, score))
    const filled = (clamped / 10) * total
    const fullCount = Math.floor(filled)
    const remainder = filled - fullCount
    const hasPartial = remainder > 0
    const emptyCount = total - fullCount - (hasPartial ? 1 : 0)

    return (
        <View
            testID={testID}
            accessibilityLabel={`${score} out of 10`}
            style={{
                flexDirection: "row",
                flexWrap: layout === "grid" ? "wrap" : "nowrap",
                alignItems: "center",
            }}
        >
            {Array.from({ length: fullCount }, (_, i) => (
                <Diamond
                    key={`full-${i}`}
                    type="full"
                    size={size}
                    color={color}
                    testID={testID ? `${testID}-full` : undefined}
                />
            ))}
            {hasPartial && (
                <Diamond
                    key="partial"
                    type="partial"
                    fraction={remainder}
                    size={size}
                    color={color}
                    testID={testID ? `${testID}-partial` : undefined}
                />
            )}
            {Array.from({ length: emptyCount }, (_, i) => (
                <Diamond
                    key={`empty-${i}`}
                    type="empty"
                    size={size}
                    color={color}
                    testID={testID ? `${testID}-empty` : undefined}
                />
            ))}
        </View>
    )
}
