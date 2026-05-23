import { StyleSheet, Text, View } from "react-native"
import Svg, { Path } from "react-native-svg"

type StarAvatarProps = {
    initial: string
    outerColor: string
    size?: number
    testID?: string
}

export default function StarAvatar({ initial, outerColor, size = 52, testID }: StarAvatarProps) {
    const cx = size / 2
    const cy = size / 2
    const outerR = size / 2 - 1
    const innerR = outerR * 0.62
    const numPoints = 8

    // Smooth 8-pointed star: quadratic bezier through alternating outer/inner radius points.
    // Control points are the radii vertices; smooth joints land at midpoints between them.
    const pts: { x: number; y: number }[] = []
    for (let i = 0; i < numPoints * 2; i++) {
        const angle = (i * Math.PI) / numPoints - Math.PI / 2
        const r = i % 2 === 0 ? outerR : innerR
        pts.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) })
    }
    const last = pts[pts.length - 1]
    const first = pts[0]
    let path = `M ${(last.x + first.x) / 2} ${(last.y + first.y) / 2}`
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i]
        const next = pts[(i + 1) % pts.length]
        path += ` Q ${p.x} ${p.y} ${(p.x + next.x) / 2} ${(p.y + next.y) / 2}`
    }
    path += " Z"

    const circleSz = innerR * 1.55
    const fontSize = Math.max(9, circleSz * 0.44)

    return (
        <View testID={testID} style={[styles.wrapper, { width: size, height: size }]}>
            <Svg width={size} height={size} style={styles.svg}>
                <Path d={path} fill={outerColor} />
            </Svg>
            <View
                style={[
                    styles.inner,
                    { width: circleSz, height: circleSz, borderRadius: circleSz / 2 },
                ]}
            >
                <Text style={[styles.initial, { fontSize, lineHeight: circleSz }]}>
                    {initial.toUpperCase()}
                </Text>
            </View>
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
    inner: {
        backgroundColor: "rgba(255,255,255,0.35)",
        alignItems: "center",
        justifyContent: "center",
    },
    initial: {
        color: "#fff",
        fontWeight: "700",
        textAlign: "center",
    },
})
