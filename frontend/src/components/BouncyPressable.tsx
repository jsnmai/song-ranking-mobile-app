// A Pressable that gives a quick, springy "squish then bounce back" reaction on tap — a bit of
// playful feedback for cards that respond to a press without navigating (e.g. the locked Feed
// modules). Scale is a transform, so the bounce never nudges surrounding layout.
import { ReactNode } from "react"
import { Pressable, PressableProps, StyleProp, ViewStyle } from "react-native"
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSequence,
    withSpring,
    withTiming,
} from "react-native-reanimated"

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

type BouncyPressableProps = Omit<PressableProps, "style"> & {
    style?: StyleProp<ViewStyle>;
    children?: ReactNode;
}

export default function BouncyPressable({ children, onPress, style, ...rest }: BouncyPressableProps) {
    const scale = useSharedValue(1)
    const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

    return (
        <AnimatedPressable
            style={[style, animatedStyle]}
            onPress={(event) => {
                // Squish in fast, then snap back with just a hint of overshoot. High damping +
                // stiffness keeps it crisp — it settles quickly instead of wobbling, so the UI
                // feels solid rather than flimsy.
                scale.value = withSequence(
                    withTiming(0.96, { duration: 60 }),
                    withSpring(1, { damping: 14, stiffness: 400, mass: 0.5 }),
                )
                onPress?.(event)
            }}
            {...rest}
        >
            {children}
        </AnimatedPressable>
    )
}
