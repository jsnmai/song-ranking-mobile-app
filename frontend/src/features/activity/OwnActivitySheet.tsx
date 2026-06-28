// Bottom-sheet of actions for YOUR OWN rating activity card (Feed + Profile):
// Re-rate · Reorder (locked until 10 ratings) · Remove rating · Hide/Show like counts.
// Presentational only — the host screen owns the data + navigation/side effects.
import { ReactNode } from "react"
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import Svg, { Circle, Line, Path } from "react-native-svg"

import { LockIcon } from "../../components/LockIcon"
import { colors, fonts } from "../../theme"

type OwnActivitySheetProps = {
    visible: boolean
    songTitle?: string
    // Reorder stays locked until the viewer has rated 10 songs (scores/positions hidden).
    reorderLocked: boolean
    hideLikeCounts: boolean
    onReRate: () => void
    onReorder: () => void
    onRemove: () => void
    onToggleLikePrivacy: () => void
    onClose: () => void
}

export default function OwnActivitySheet({
    visible,
    songTitle,
    reorderLocked,
    hideLikeCounts,
    onReRate,
    onReorder,
    onRemove,
    onToggleLikePrivacy,
    onClose,
}: OwnActivitySheetProps) {
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.backdrop}>
                <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={onClose} />
                <View style={styles.sheet}>
                    <View style={styles.handle} />
                    {songTitle ? <Text style={styles.songTitle} numberOfLines={1}>{songTitle}</Text> : null}
                    <Row
                        icon={<RefreshGlyph />}
                        label="Re-rate"
                        sub="Run the compare again"
                        onPress={onReRate}
                        testID="activity-menu-rerate"
                    />
                    <Row
                        icon={<ReorderGlyph color={reorderLocked ? colors.inkDim : colors.ink} />}
                        label="Reorder"
                        sub="Move songs by hand"
                        locked={reorderLocked}
                        onPress={onReorder}
                        testID="activity-menu-reorder"
                    />
                    <Row
                        icon={<TrashGlyph />}
                        label="Remove rating"
                        sub="Takes it out of your Rankings"
                        danger
                        onPress={onRemove}
                        testID="activity-menu-remove"
                    />
                    <Row
                        icon={<EyeGlyph off={hideLikeCounts} />}
                        label={hideLikeCounts ? "Show like counts" : "Hide like counts"}
                        sub={hideLikeCounts ? "Others can't see your like counts" : "Others won't see your like counts"}
                        onPress={onToggleLikePrivacy}
                        testID="activity-menu-like-privacy"
                    />
                </View>
            </View>
        </Modal>
    )
}

type RowProps = {
    icon: ReactNode
    label: string
    sub?: string
    danger?: boolean
    locked?: boolean
    onPress: () => void
    testID?: string
}

function Row({ icon, label, sub, danger, locked, onPress, testID }: RowProps) {
    return (
        <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ disabled: locked === true }}
            style={[styles.row, locked === true && styles.rowLocked]}
            onPress={onPress}
            disabled={locked === true}
            testID={testID}
        >
            <View style={[styles.rowIcon, danger === true && styles.rowIconDanger]}>{icon}</View>
            <View style={styles.rowText}>
                <Text style={[styles.rowLabel, danger === true && styles.rowLabelDanger]}>{label}</Text>
                {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
            </View>
            {locked === true && (
                <View style={styles.lockTag}>
                    <LockIcon color={colors.inkDim} size={12} />
                    <Text style={styles.lockTagText}>LOCKED</Text>
                </View>
            )}
        </TouchableOpacity>
    )
}

const ICON_STROKE = { fill: "none" as const, strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const }

function RefreshGlyph({ color = colors.ink }: { color?: string }) {
    return (
        <Svg width={18} height={18} viewBox="0 0 24 24" stroke={color} {...ICON_STROKE}>
            <Path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
            <Path d="M21 3v5h-5" />
            <Path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
            <Path d="M3 21v-5h5" />
        </Svg>
    )
}

function ReorderGlyph({ color = colors.ink }: { color?: string }) {
    return (
        <Svg width={18} height={18} viewBox="0 0 24 24" stroke={color} {...ICON_STROKE}>
            <Path d="M3 9l4-4 4 4M7 5v14M21 15l-4 4-4-4M17 19V5" />
        </Svg>
    )
}

function TrashGlyph({ color = colors.danger }: { color?: string }) {
    return (
        <Svg width={18} height={18} viewBox="0 0 24 24" stroke={color} {...ICON_STROKE}>
            <Path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6.5 7l.9 12.1a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9L18.5 7" />
        </Svg>
    )
}

function EyeGlyph({ off, color = colors.ink }: { off?: boolean; color?: string }) {
    return (
        <Svg width={18} height={18} viewBox="0 0 24 24" stroke={color} {...ICON_STROKE}>
            <Path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
            <Circle cx={12} cy={12} r={3} />
            {off && <Line x1={4} y1={4} x2={20} y2={20} />}
        </Svg>
    )
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        justifyContent: "flex-end",
        backgroundColor: "rgba(22,20,19,0.4)",
    },
    sheet: {
        backgroundColor: colors.paper,
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 30,
    },
    handle: {
        alignSelf: "center",
        width: 38,
        height: 4,
        borderRadius: 2,
        backgroundColor: colors.line,
        marginBottom: 10,
    },
    songTitle: {
        fontFamily: fonts.display,
        fontSize: 15,
        color: colors.ink,
        marginBottom: 6,
        paddingHorizontal: 4,
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
        gap: 13,
        paddingVertical: 12,
        paddingHorizontal: 4,
    },
    rowLocked: { opacity: 0.55 },
    rowIcon: {
        width: 38,
        height: 38,
        borderRadius: 11,
        backgroundColor: colors.bg,
        borderWidth: 1,
        borderColor: colors.line,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    rowIconDanger: {
        backgroundColor: "rgba(224,73,46,0.10)",
        borderColor: "rgba(224,73,46,0.2)",
    },
    rowText: { flex: 1, minWidth: 0 },
    rowLabel: { fontFamily: fonts.display, fontSize: 15, color: colors.ink },
    rowLabelDanger: { color: colors.danger },
    rowSub: { fontSize: 11, color: colors.inkDim, marginTop: 1 },
    lockTag: { flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 0 },
    lockTagText: {
        fontFamily: fonts.mono,
        fontSize: 9,
        color: colors.inkDim,
        fontWeight: "700",
        letterSpacing: 0.8,
    },
})
