// A filled, gold progress tick that breathes a gold glow. Used on the Getting Started
// meter once all 10 songs are rated but the 3 follows aren't in yet: the rating work is
// done, so the whole bar pulses to celebrate it and pull the eye toward the "follow
// people" CTA. Solid gold (never hollow) — it pulses brightness + a soft gold halo.
// Honors reduced motion.
import { useEffect } from "react"
import { StyleProp, StyleSheet, ViewStyle } from "react-native"
import Animated, {
    Easing,
    interpolate,
    interpolateColor,
    useAnimatedStyle,
    useReducedMotion,
    useSharedValue,
    withRepeat,
    withTiming,
} from "react-native-reanimated"

import { colors, meterSegment } from "../theme"

export function GlowingMeterTick({ style, testID }: { style?: StyleProp<ViewStyle>; testID?: string }) {
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
        // Brightness climbs from the standard gold to a luminous top-of-ramp gold and back.
        backgroundColor: interpolateColor(pulse.value, [0, 1], [colors.gold, "#ffe496"]),
        // Gold halo swells with the brightness so the whole bar reads as "shining".
        shadowOpacity: interpolate(pulse.value, [0, 1], [0.25, 0.85]),
        shadowRadius: interpolate(pulse.value, [0, 1], [1, 7]),
    }))
    return <Animated.View testID={testID} style={[meterSegment, style, styles.glow, pulseStyle]} />
}

const styles = StyleSheet.create({
    glow: {
        backgroundColor: colors.gold,
        shadowColor: colors.gold,
        shadowOffset: { width: 0, height: 0 },
    },
})
