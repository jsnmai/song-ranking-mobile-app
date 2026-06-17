// Weekly-streak UI for the Bento Orbit profile surfaces.
// - StreakFlame: the shared two-tone flame mark.
// - StreakChip:  header pill on your OWN profile (flame + week count).
// - StreakBadge: tap-to-reveal flame badge + popover on OTHER profiles.
// The streak value comes from `user_stats.current_streak`, which the backend
// only populates when the viewer can see the profile's taste — so these render
// only when a streak is present, inheriting the profile's visibility rules.
import { useRef, useState } from "react"
import { Modal, Pressable, StyleSheet, Text, View } from "react-native"
import Svg, { Path } from "react-native-svg"

import { colors, fonts } from "../../theme"

// Streak surfaces use a charcoal that is a touch lighter and more neutral than
// the navy Auxstrology card (`colors.navy` #11141d), so a streak popup doesn't
// blend into the Auxstrology card sitting behind it on the profile.
const STREAK_SURFACE = "#1e2029"

// Two-tone flame: orange-red body (accent) with a butter inner tongue. When
// `muted` (no active streak) it renders in a flat grey to read as inactive.
export function StreakFlame({ size = 20, muted = false }: { size?: number; muted?: boolean }) {
    const body = muted ? colors.inkDim : colors.accent
    const tongue = muted ? "#c2c6cf" : colors.butter
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <Path
                d="M12.6 2c.4 3.3-1.4 4.9-2.8 6.4C8.3 9.9 7 11.4 7 13.9a5 5 0 0 0 10 0c0-2-.9-3.4-1.8-4.7.1 1.3-.6 2.2-1.6 2.2-1.2 0-1.7-1-1.4-2.5C12.7 6.7 13.3 4.4 12.6 2Z"
                fill={body}
            />
            <Path
                d="M12.5 10c.6 1 1.2 1.7 1.2 2.9a1.6 1.6 0 0 1-3.2 0c0-.9.5-1.5 1-2 .4-.4.8-.7 1-.9Z"
                fill={tongue}
            />
        </Svg>
    )
}

// Header chip for the OWN profile: a small accent-tinted pill with the flame
// and the current streak length in weeks.
export function StreakChip({ weeks }: { weeks: number }) {
    const active = weeks > 0
    return (
        <View
            style={[chipStyles.chip, !active && chipStyles.chipMuted]}
            accessibilityLabel={active ? `${weeks}-week rating streak` : "No rating streak yet"}
            testID="streak-chip"
        >
            <StreakFlame size={19} muted={!active} />
            <Text style={[chipStyles.weeks, !active && chipStyles.weeksMuted]}>{weeks}</Text>
        </View>
    )
}

// Centered detail modal for your OWN streak, opened by tapping the header chip.
// Handles both states: a celebratory active streak and an encouraging empty
// state inviting you to start one.
export function StreakDetailModal({
    visible,
    onClose,
    weeks,
    longest,
}: {
    visible: boolean
    onClose: () => void
    weeks: number
    longest: number
}) {
    const active = weeks > 0
    const weekWord = weeks === 1 ? "week" : "weeks"
    const longestWord = longest === 1 ? "week" : "weeks"
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable style={modalStyles.overlay} onPress={onClose}>
                <Pressable style={modalStyles.card} onPress={() => {}} testID="streak-detail-modal">
                    <View style={modalStyles.halo}>
                        <StreakFlame size={52} muted={!active} />
                    </View>
                    {active ? (
                        <>
                            <Text style={modalStyles.bigNum}>{weeks}</Text>
                            <Text style={modalStyles.label}>WEEK RATING STREAK</Text>
                            <Text style={modalStyles.body}>
                                You've rated at least one song every week for {weeks} {weekWord} straight.
                                Keep the flame alive — rate something this week.
                            </Text>
                            {longest > weeks && (
                                <Text style={modalStyles.meta}>YOUR BEST · {longest} {longestWord.toUpperCase()}</Text>
                            )}
                            <Pressable style={modalStyles.primaryBtn} onPress={onClose} testID="streak-modal-done">
                                <Text style={modalStyles.primaryBtnText}>Keep it going</Text>
                            </Pressable>
                        </>
                    ) : (
                        <>
                            <Text style={modalStyles.title}>No streak yet</Text>
                            <Text style={modalStyles.body}>
                                Rate at least one song every week to start a rating streak.
                            </Text>
                            {longest > 0 && (
                                <Text style={modalStyles.meta}>YOUR BEST SO FAR · {longest} {longestWord.toUpperCase()}</Text>
                            )}
                        </>
                    )}
                </Pressable>
            </Pressable>
        </Modal>
    )
}

// Own-profile header chip that opens the centered streak detail modal on tap.
export function OwnStreakChip({ weeks, longest }: { weeks: number; longest: number }) {
    const [open, setOpen] = useState(false)
    return (
        <>
            <Pressable
                onPress={() => setOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="View your rating streak"
                testID="streak-chip-button"
            >
                <StreakChip weeks={weeks} />
            </Pressable>
            <StreakDetailModal
                visible={open}
                onClose={() => setOpen(false)}
                weeks={weeks}
                longest={longest}
            />
        </>
    )
}

const POPOVER_WIDTH = 184

// Streak badge for OTHER profiles: a circular flame button on the identity card
// that toggles a small dark popover with the streak count and a one-line summary.
export function StreakBadge({ weeks, name }: { weeks: number; name: string }) {
    const active = weeks > 0
    const [open, setOpen] = useState(false)
    const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
    const anchorRef = useRef<View>(null)

    const toggle = () => {
        if (open) {
            setOpen(false)
            return
        }
        setOpen(true)
        // Position the popover precisely under the badge once it has laid out.
        // The popover renders immediately (open=true) and only refines its spot
        // when the measurement arrives, so it never depends on layout to appear.
        anchorRef.current?.measureInWindow?.((x, y, w, h) => setAnchor({ x, y, w, h }))
    }

    const popoverPosition = anchor
        ? { top: anchor.y + anchor.h + 8, left: Math.max(8, anchor.x + anchor.w - POPOVER_WIDTH) }
        : { top: 104, right: 14 }

    const firstName = name.trim().split(/\s+/)[0] || name
    const weekWord = weeks === 1 ? "week" : "weeks"

    return (
        <>
            <View ref={anchorRef} collapsable={false} style={badgeStyles.anchor}>
                <Pressable
                    onPress={toggle}
                    style={[badgeStyles.badge, !active && badgeStyles.badgeMuted, open && badgeStyles.badgeActive]}
                    accessibilityRole="button"
                    accessibilityLabel="Weekly streak"
                    testID="streak-badge"
                >
                    <StreakFlame size={20} muted={!active} />
                </Pressable>
            </View>
            <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
                <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)}>
                    {/* Swallow presses inside the popover so only the backdrop closes it. */}
                    <Pressable style={[badgeStyles.popover, popoverPosition]} onPress={() => {}} testID="streak-popover">
                        <View style={badgeStyles.pointer} />
                        <View style={badgeStyles.popoverRow}>
                            <StreakFlame size={24} muted={!active} />
                            <View>
                                <Text style={[badgeStyles.popWeeks, !active && badgeStyles.popWeeksMuted]}>
                                    {weeks}
                                    <Text style={badgeStyles.popWeeksUnit}> wk</Text>
                                </Text>
                                <Text style={badgeStyles.popLabel}>RATING STREAK</Text>
                            </View>
                        </View>
                        <Text style={badgeStyles.popDesc}>
                            {active
                                ? `${firstName} has rated at least one song every week for ${weeks} ${weekWord} straight.`
                                : `${firstName} doesn't have an active rating streak right now.`}
                        </Text>
                    </Pressable>
                </Pressable>
            </Modal>
        </>
    )
}

const chipStyles = StyleSheet.create({
    chip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        height: 32,
        paddingLeft: 7,
        paddingRight: 10,
        borderRadius: 999,
        backgroundColor: `${colors.accent}14`,
        borderWidth: 1,
        borderColor: `${colors.accent}33`,
    },
    chipMuted: {
        backgroundColor: `${colors.ink}0a`,
        borderColor: colors.line,
    },
    weeks: {
        fontFamily: fonts.display,
        fontSize: 14,
        color: colors.ink,
        lineHeight: 16,
    },
    weeksMuted: {
        color: colors.inkDim,
    },
})

const badgeStyles = StyleSheet.create({
    anchor: {
        position: "absolute",
        top: 11,
        right: 11,
        zIndex: 30,
    },
    badge: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: `${colors.accent}1a`,
        borderWidth: 1,
        borderColor: `${colors.accent}40`,
        alignItems: "center",
        justifyContent: "center",
    },
    badgeMuted: {
        backgroundColor: `${colors.ink}0a`,
        borderColor: colors.line,
    },
    badgeActive: {
        borderColor: colors.accent,
        borderWidth: 2,
    },
    popover: {
        position: "absolute",
        width: POPOVER_WIDTH,
        backgroundColor: STREAK_SURFACE,
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
        right: 15,
        width: 11,
        height: 11,
        backgroundColor: STREAK_SURFACE,
        transform: [{ rotate: "45deg" }],
    },
    popoverRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 9,
    },
    popWeeks: {
        fontFamily: fonts.display,
        fontSize: 24,
        color: "#fff",
        lineHeight: 24,
    },
    popWeeksMuted: {
        color: "rgba(241,236,221,0.55)",
    },
    popWeeksUnit: {
        fontFamily: fonts.mono,
        fontSize: 11,
        color: "rgba(241,236,221,0.6)",
    },
    popLabel: {
        fontFamily: fonts.mono,
        fontSize: 7,
        letterSpacing: 1.4,
        fontWeight: "700",
        color: "rgba(241,236,221,0.6)",
        marginTop: 3,
    },
    popDesc: {
        fontFamily: fonts.sans,
        fontSize: 10,
        color: "rgba(241,236,221,0.7)",
        lineHeight: 14,
        marginTop: 9,
    },
})

const modalStyles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: "rgba(17,19,28,0.5)",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 28,
    },
    card: {
        width: "100%",
        maxWidth: 320,
        backgroundColor: STREAK_SURFACE,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: colors.cline,
        paddingVertical: 28,
        paddingHorizontal: 24,
        alignItems: "center",
        shadowColor: "#000",
        shadowOpacity: 0.4,
        shadowRadius: 30,
        shadowOffset: { width: 0, height: 16 },
        elevation: 16,
    },
    halo: {
        width: 88,
        height: 88,
        borderRadius: 44,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 12,
        backgroundColor: "rgba(255,255,255,0.06)",
    },
    bigNum: {
        fontFamily: fonts.display,
        fontSize: 60,
        lineHeight: 62,
        letterSpacing: -1,
        color: "#fff",
    },
    label: {
        fontFamily: fonts.mono,
        fontSize: 9,
        letterSpacing: 2,
        fontWeight: "700",
        color: "rgba(241,236,221,0.6)",
        marginTop: 6,
    },
    title: {
        fontFamily: fonts.display,
        fontSize: 24,
        letterSpacing: -0.4,
        color: colors.cream,
        marginTop: 2,
    },
    body: {
        fontFamily: fonts.sans,
        fontSize: 13,
        lineHeight: 19,
        color: "rgba(241,236,221,0.7)",
        textAlign: "center",
        marginTop: 12,
        paddingHorizontal: 4,
    },
    meta: {
        fontFamily: fonts.mono,
        fontSize: 9,
        letterSpacing: 1,
        fontWeight: "700",
        color: "rgba(241,236,221,0.55)",
        marginTop: 14,
    },
    primaryBtn: {
        alignSelf: "stretch",
        backgroundColor: "transparent",
        borderWidth: 1.5,
        borderColor: colors.cline,
        borderRadius: 12,
        paddingVertical: 13,
        alignItems: "center",
        marginTop: 22,
    },
    primaryBtnText: {
        fontFamily: fonts.display,
        fontSize: 14,
        letterSpacing: -0.2,
        color: colors.cream,
    },
})
