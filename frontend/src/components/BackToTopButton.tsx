// A floating "back to top" button for long scrollable lists. It fades + scales in once the
// user has scrolled a fair way down, and scrolls the list back to the top on tap. Dark ink
// circle (distinct from the gold rate FAB in the tab bar) with a cream up-arrow.
import { StyleSheet } from "react-native"
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Svg, { Path } from "react-native-svg"

import BouncyPressable from "./BouncyPressable"
import { colors } from "../theme"

const TIMING = { duration: 180 }
// Matches the frosted tab bar's base height in AppNavigator (56 + safe-area inset).
const TAB_BAR_HEIGHT = 56

type Props = {
    visible: boolean;
    onPress: () => void;
    // Set on screens that sit inside the tab navigator, so the button clears the tab bar.
    aboveTabBar?: boolean;
}

export default function BackToTopButton({ visible, onPress, aboveTabBar = false }: Props) {
    const insets = useSafeAreaInsets()
    const bottom = insets.bottom + (aboveTabBar ? TAB_BAR_HEIGHT : 0) + 32

    const animStyle = useAnimatedStyle(() => ({
        opacity: withTiming(visible ? 1 : 0, TIMING),
        transform: [
            { translateY: withTiming(visible ? 0 : 14, TIMING) },
            { scale: withTiming(visible ? 1 : 0.8, TIMING) },
        ],
    }))

    return (
        <Animated.View
            // When hidden, let touches pass straight through to the list behind it.
            pointerEvents={visible ? "box-none" : "none"}
            style={[styles.wrap, { bottom }, animStyle]}
        >
            <BouncyPressable
                accessibilityRole="button"
                accessibilityLabel="Scroll back to top"
                onPress={onPress}
                style={styles.btn}
            >
                <Svg width={17} height={17} viewBox="0 0 24 24" fill="none"
                    stroke={colors.cream} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M12 19V5M5 12l7-7 7 7" />
                </Svg>
            </BouncyPressable>
        </Animated.View>
    )
}

const styles = StyleSheet.create({
    wrap: {
        position: "absolute",
        right: 18,
        // Sits above the frosted tab bar (zIndex 20) so it stays tappable on the Rankings tab.
        zIndex: 30,
    },
    btn: {
        width: 40,
        height: 40,
        borderRadius: 999,
        // Translucent ink so list content stays faintly visible behind it.
        backgroundColor: "rgba(17,19,28,0.55)",
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOpacity: 0.18,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 6,
    },
})
