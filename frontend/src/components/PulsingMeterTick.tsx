// The next empty tick on a 10-song progress meter. It stays hollow — a transparent
// centre with a gold outline that pulses — so it points at where the next rating
// lands without ever reading as a solid, filled-in tick. Honors reduced motion.
import { useEffect } from "react"
import { StyleProp, StyleSheet, ViewStyle } from "react-native"
import Animated, {
    Easing,
    interpolateColor,
    useAnimatedStyle,
    useReducedMotion,
    useSharedValue,
    withRepeat,
    withTiming,
} from "react-native-reanimated"

import { meterSegment } from "../theme"

export function PulsingMeterTick({ style }: { style?: StyleProp<ViewStyle> }) {
    const reduced = useReducedMotion()
    const pulse = useSharedValue(0)
    useEffect(() => {
        if (reduced) return
        pulse.value = withRepeat(
            withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.ease) }),
            -1,
            true,
        )
    }, [reduced, pulse])
    const pulseStyle = useAnimatedStyle(() => ({
        borderColor: interpolateColor(
            pulse.value,
            [0, 1],
            ["rgba(245,238,220,0.25)", "rgba(245,184,64,0.85)"],
        ),
    }))
    // Hollow: clear the faint track fill and outline it instead.
    return <Animated.View style={[meterSegment, style, styles.hollow, pulseStyle]} />
}

const styles = StyleSheet.create({
    hollow: {
        backgroundColor: "transparent",
        borderWidth: 1,
    },
})
