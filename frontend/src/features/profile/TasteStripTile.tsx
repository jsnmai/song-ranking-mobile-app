// A single Taste Profile strip tile: shows a label + value, and on tap reveals a
// small dark popover explaining what the stat means (and how it's found). Mirrors
// the streak popover pattern in StreakBadge — a measure-anchored Modal popover
// with a pointer — so the two explainers feel like the same family.
import { useRef, useState } from "react"
import { Dimensions, Modal, Pressable, StyleSheet, Text, View } from "react-native"

import { colors, fonts } from "../../theme"

// Same charcoal as the streak popover so the explainers read as one family.
const SURFACE = "#1e2029"
const POPOVER_WIDTH = 230
const POINTER = 11
const SCREEN_W = Dimensions.get("window").width

export default function TasteStripTile({
    label,
    value,
    title,
    description,
    statValue,
    statLabel,
    testID,
}: {
    label: string
    value: string
    title: string
    description: string
    // Optional prominent stat shown in the popover (e.g. a bold "12 SONGS RATED").
    statValue?: string
    statLabel?: string
    testID?: string
}) {
    const [open, setOpen] = useState(false)
    const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
    const anchorRef = useRef<View>(null)

    const toggle = () => {
        if (open) {
            setOpen(false)
            return
        }
        setOpen(true)
        // Render immediately, then refine the popover's position once the tile
        // has been measured — so it never depends on layout to appear.
        anchorRef.current?.measureInWindow?.((x, y, w, h) => setAnchor({ x, y, w, h }))
    }

    // Center the popover under the tapped tile, clamped to the screen, and aim the
    // pointer at the tile's center wherever the card ends up landing.
    const center = anchor ? anchor.x + anchor.w / 2 : SCREEN_W / 2
    const left = Math.min(Math.max(8, center - POPOVER_WIDTH / 2), SCREEN_W - POPOVER_WIDTH - 8)
    const top = anchor ? anchor.y + anchor.h + 8 : 200
    const pointerLeft = Math.min(Math.max(12, center - left - POINTER / 2), POPOVER_WIDTH - 24)

    return (
        <View ref={anchorRef} collapsable={false} style={styles.tile}>
            <Pressable
                onPress={toggle}
                style={styles.tileInner}
                accessibilityRole="button"
                accessibilityLabel={`${title}. ${description}`}
                testID={testID}
            >
                <Text style={styles.label}>{label}</Text>
                <Text style={styles.value} numberOfLines={1}>{value}</Text>
            </Pressable>
            <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
                <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)}>
                    {/* Swallow presses inside the popover so only the backdrop closes it. */}
                    <Pressable
                        style={[styles.popover, { top, left }]}
                        onPress={() => {}}
                        testID={testID ? `${testID}-popover` : undefined}
                    >
                        <View style={[styles.pointer, { left: pointerLeft }]} />
                        <Text style={styles.popTitle}>{title}</Text>
                        {statValue ? (
                            <View style={styles.statRow}>
                                <Text style={styles.statValue}>{statValue}</Text>
                                {statLabel ? <Text style={styles.statLabel}>{statLabel}</Text> : null}
                            </View>
                        ) : null}
                        <Text style={styles.popDesc}>{description}</Text>
                    </Pressable>
                </Pressable>
            </Modal>
        </View>
    )
}

const styles = StyleSheet.create({
    tile: {
        flex: 1,
    },
    tileInner: {
        gap: 4,
    },
    label: {
        fontFamily: fonts.mono,
        fontSize: 8.5,
        letterSpacing: 1,
        color: colors.inkDim,
        fontWeight: "700",
    },
    value: {
        fontFamily: fonts.display,
        fontSize: 14,
        letterSpacing: -0.2,
        color: colors.ink,
    },
    popover: {
        position: "absolute",
        width: POPOVER_WIDTH,
        backgroundColor: SURFACE,
        borderRadius: 13,
        paddingVertical: 13,
        paddingHorizontal: 14,
        shadowColor: colors.ink,
        shadowOpacity: 0.34,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 12 },
        elevation: 12,
    },
    pointer: {
        position: "absolute",
        top: -5,
        width: POINTER,
        height: POINTER,
        backgroundColor: SURFACE,
        transform: [{ rotate: "45deg" }],
    },
    popTitle: {
        fontFamily: fonts.display,
        fontSize: 14,
        letterSpacing: -0.2,
        color: "#fff",
        marginBottom: 5,
    },
    statRow: {
        flexDirection: "row",
        alignItems: "baseline",
        gap: 6,
        marginTop: 1,
        marginBottom: 7,
    },
    statValue: {
        fontFamily: fonts.display,
        fontSize: 28,
        letterSpacing: -0.5,
        color: "#fff",
        lineHeight: 30,
    },
    statLabel: {
        fontFamily: fonts.mono,
        fontSize: 8,
        letterSpacing: 1.2,
        fontWeight: "700",
        color: "rgba(241,236,221,0.6)",
    },
    popDesc: {
        fontFamily: fonts.sans,
        fontSize: 11,
        color: "rgba(241,236,221,0.72)",
        lineHeight: 15,
    },
})
