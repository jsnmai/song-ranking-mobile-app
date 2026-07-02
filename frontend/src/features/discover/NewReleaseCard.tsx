// NewReleaseCard — an art-forward "poster" tile for one of this week's fresh drops
// (global weekly feed, one rotating pick per day; Bento Orbit design). Colourful by
// way of the album art itself (full-bleed cover under a dark scrim), deliberately
// distinct from the flat brand-colour social tiles AND the navy starry Most-rated
// orbit, so it reads as an editorial pick rather than a friend-driven signal.
//
// item={null} (feed empty, e.g. before the first weekly batch lands) renders the
// placeholder state so the 2-col row keeps its shape.
import { useEffect } from "react"
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from "react-native-reanimated"

import { colors, fonts } from "../../theme"
import { NewReleaseItem } from "./types"

// The poster's own dark tint (a warm near-black, not the orbit navy).
const SCRIM = "rgba(12,9,16,0.32)"
const SCRIM_HEAVY = "rgba(12,9,16,0.82)"
const PLACEHOLDER_BG = "#221826"

function NewReleasePulseDot() {
    const pulse = useSharedValue(0)

    useEffect(() => {
        pulse.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.out(Easing.ease) }), -1, false)
    }, [pulse])

    const ringStyle = useAnimatedStyle(() => ({
        opacity: 0.52 * (1 - pulse.value),
        transform: [{ scale: 0.58 + pulse.value * 1.45 }],
    }))
    const coreStyle = useAnimatedStyle(() => ({
        transform: [{ scale: 0.94 + pulse.value * 0.1 }],
    }))

    return (
        <View style={styles.flagDotWrap}>
            <Animated.View style={[styles.flagDotRing, ringStyle]} />
            <Animated.View style={[styles.flagDot, coreStyle]} />
        </View>
    )
}

export default function NewReleaseCard({
    item,
    width,
    onOpen,
    onRate,
}: {
    item: NewReleaseItem | null
    // Pinned width so the two-col row splits dead-centre with the Most-rated card.
    width?: number
    onOpen?: () => void
    onRate?: () => void
}) {
    if (!item) {
        // Coming-soon placeholder — same poster mood, ghost content.
        return (
            <View style={[styles.card, width != null ? { width } : { flex: 1 }, styles.placeholderCard]} testID="new-release-card-placeholder">
                <View style={styles.flagRow}>
                    <View style={styles.flagDot} />
                    <Text style={styles.flagText}>NEW RELEASE</Text>
                </View>
                <View style={styles.ghostLines}>
                    <View style={[styles.ghostLine, { width: "74%" }]} />
                    <View style={[styles.ghostLine, { width: "46%", opacity: 0.6 }]} />
                </View>
                <Text style={styles.placeholderBody}>
                    This week's fresh drops will land here.
                </Text>
            </View>
        )
    }

    return (
        <TouchableOpacity
            style={[styles.card, width != null ? { width } : { flex: 1 }]}
            activeOpacity={0.85}
            onPress={onOpen}
            accessibilityLabel={`Open ${item.song.title}`}
            testID="new-release-card"
        >
            {item.song.cover_url ? (
                <Image source={{ uri: item.song.cover_url }} style={StyleSheet.absoluteFillObject} />
            ) : (
                <View style={[StyleSheet.absoluteFillObject, { backgroundColor: PLACEHOLDER_BG }]} />
            )}
            {/* Legibility scrims: a light full-card tint plus a heavier band behind the text. */}
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: SCRIM }]} />
            <View style={styles.bottomScrim} />
            <View style={styles.inner}>
                <View style={styles.flagRow}>
                    <NewReleasePulseDot />
                    <Text style={styles.flagText}>NEW RELEASE</Text>
                </View>
                <View>
                    <Text style={styles.title} numberOfLines={1}>{item.song.title}</Text>
                    <View style={styles.metaRow}>
                        <Text style={styles.artist} numberOfLines={1}>
                            {item.song.artist.toUpperCase()}
                        </Text>
                        <TouchableOpacity
                            style={styles.ratePill}
                            onPress={onRate}
                            accessibilityLabel={`Rate ${item.song.title}`}
                        >
                            <Text style={styles.ratePillLabel}>Rate →</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </TouchableOpacity>
    )
}

const styles = StyleSheet.create({
    card: {
        // Width comes from the caller (pinned to match the Most-rated card); flex:1 is only a
        // fallback when no width is passed. Keeping `flex` out of the base style avoids a
        // shorthand-vs-width precedence conflict in Yoga.
        borderRadius: 16,
        minHeight: 150,
        overflow: "hidden",
        shadowColor: colors.ink,
        shadowOpacity: 0.14,
        shadowRadius: 7,
        shadowOffset: { width: 0, height: 4 },
    },
    inner: {
        flex: 1,
        padding: 12,
        justifyContent: "space-between",
    },
    flagRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
    },
    flagDotWrap: {
        width: 16,
        height: 16,
        alignItems: "center",
        justifyContent: "center",
    },
    flagDotRing: {
        position: "absolute",
        width: 14,
        height: 14,
        borderRadius: 7,
        borderWidth: 1.4,
        borderColor: colors.accent,
    },
    flagDot: {
        width: 9,
        height: 9,
        borderRadius: 4.5,
        backgroundColor: colors.accent,
        // A soft accent halo stands in for the design's ping animation.
        shadowColor: colors.accent,
        shadowOpacity: 0.8,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 0 },
    },
    flagText: {
        fontFamily: fonts.mono,
        fontSize: 8,
        letterSpacing: 1.3,
        fontWeight: "700",
        color: "#fff",
    },
    // Heavier band across the lower half so title + artist always read over busy art.
    bottomScrim: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: "58%",
        backgroundColor: SCRIM_HEAVY,
        opacity: 0.78,
    },
    title: {
        fontFamily: fonts.display,
        fontSize: 19,
        lineHeight: 22,
        color: "#fff",
    },
    metaRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        marginTop: 5,
    },
    artist: {
        flex: 1,
        minWidth: 0,
        fontFamily: fonts.mono,
        fontSize: 7.5,
        letterSpacing: 0.6,
        color: "rgba(255,255,255,0.85)",
    },
    ratePill: {
        flexShrink: 0,
        backgroundColor: colors.accent,
        borderRadius: 999,
        paddingVertical: 4,
        paddingHorizontal: 10,
    },
    ratePillLabel: {
        fontFamily: fonts.display,
        fontSize: 11,
        color: "#fff",
    },
    // ── Placeholder (backend pending) ─────────────────────────────────
    placeholderCard: {
        backgroundColor: PLACEHOLDER_BG,
        padding: 12,
        justifyContent: "space-between",
    },
    ghostLines: {
        gap: 7,
    },
    ghostLine: {
        height: 10,
        borderRadius: 5,
        backgroundColor: "rgba(255,255,255,0.16)",
    },
    placeholderBody: {
        fontFamily: fonts.mono,
        fontSize: 9.5,
        lineHeight: 14,
        color: "rgba(255,255,255,0.62)",
    },
})
