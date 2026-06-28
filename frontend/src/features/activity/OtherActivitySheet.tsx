// Bottom-sheet of actions for ANOTHER user's rating activity card (Feed + User Activity):
// Report note (UGC safety, only when there's a note) · Block the user.
// Mirrors the feed's "···" menu so the two surfaces behave identically. The report
// flow is self-contained here; the host owns the block side effect + list removal.
import { useEffect, useState } from "react"
import { Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native"
import Svg, { Circle, Path } from "react-native-svg"

import { ApiError } from "../../api/client"
import { colors, fonts } from "../../theme"
import { reportRatingEvent } from "../feed/apiRequests"
import { ReportReason } from "../profile/types"

const REPORT_REASONS: readonly { value: ReportReason; label: string }[] = [
    { value: "harassment", label: "Harassment" },
    { value: "hate_or_abuse", label: "Hate or abuse" },
    { value: "impersonation", label: "Impersonation" },
    { value: "inappropriate_content", label: "Inappropriate content" },
    { value: "spam", label: "Spam" },
    { value: "under_13", label: "Under 13" },
    { value: "other", label: "Other" },
]

type OtherActivitySheetProps = {
    visible: boolean
    username: string
    ratingEventId: number | null
    // Only show "Report note" when the card actually carries a note to flag.
    hasNote: boolean
    token: string | null
    bottomInset?: number
    onBlock: () => void
    onClose: () => void
}

export default function OtherActivitySheet({
    visible,
    username,
    ratingEventId,
    hasNote,
    token,
    bottomInset = 12,
    onBlock,
    onClose,
}: OtherActivitySheetProps) {
    const [mode, setMode] = useState<"menu" | "report">("menu")
    const [reason, setReason] = useState<ReportReason | null>(null)
    const [details, setDetails] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [submitted, setSubmitted] = useState(false)

    // Reset to the menu whenever the sheet (re)opens for a fresh card.
    useEffect(() => {
        if (visible) {
            setMode("menu")
            setReason(null)
            setDetails("")
            setError(null)
            setSubmitted(false)
            setIsSubmitting(false)
        }
    }, [visible, ratingEventId])

    const submitReport = async () => {
        if (!token || ratingEventId === null || reason === null || isSubmitting) return
        setIsSubmitting(true)
        setError(null)
        try {
            await reportRatingEvent(ratingEventId, { target_type: "rating_note", reason, details }, token)
            setSubmitted(true)
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.detail)
            } else if (err instanceof Error) {
                setError(err.message)
            } else {
                setError("Could not submit report.")
            }
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable style={styles.menuBackdrop} onPress={onClose}>
                <View
                    style={[styles.sheetCard, { paddingBottom: bottomInset + 12 }]}
                    onStartShouldSetResponder={() => true}
                    testID="other-options-panel"
                >
                    <View style={styles.sheetHandle} />

                    {mode === "menu" ? (
                        <>
                            <Text style={styles.menuHeader}>ACTIVITY OPTIONS</Text>
                            {hasNote && (
                                <TouchableOpacity
                                    style={styles.menuItem}
                                    onPress={() => setMode("report")}
                                    testID="activity-report-option"
                                >
                                    <View style={styles.menuItemIcon}><FlagIcon color={colors.ink} /></View>
                                    <View style={styles.menuItemText}>
                                        <Text style={styles.menuItemLabel}>Report note</Text>
                                        <Text style={styles.menuItemSub}>Flag this note for review</Text>
                                    </View>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity style={styles.menuItem} onPress={onBlock} testID="activity-block-option">
                                <View style={[styles.menuItemIcon, styles.menuItemIconDanger]}><BlockIcon color={colors.danger} /></View>
                                <View style={styles.menuItemText}>
                                    <Text style={[styles.menuItemLabel, { color: colors.danger }]}>Block @{username}</Text>
                                    <Text style={styles.menuItemSub}>Hide them from your feed and taste</Text>
                                </View>
                            </TouchableOpacity>
                        </>
                    ) : submitted ? (
                        <View style={styles.reportPanel}>
                            <Text style={styles.reportSuccess}>Thanks. We'll review this report.</Text>
                            <TouchableOpacity style={styles.submitReportButton} onPress={onClose}>
                                <Text style={styles.submitReportText}>Done</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.reportPanel}>
                            <Text style={styles.reportTitle}>Report note</Text>
                            <Text style={styles.reportLabel}>Why are you reporting this note?</Text>
                            <View style={styles.reasonGrid}>
                                {REPORT_REASONS.map((r) => (
                                    <TouchableOpacity
                                        key={r.value}
                                        style={[styles.reasonButton, reason === r.value && styles.reasonButtonActive]}
                                        onPress={() => setReason(r.value)}
                                        disabled={isSubmitting}
                                    >
                                        <Text style={[styles.reasonText, reason === r.value && styles.reasonTextActive]}>
                                            {r.label}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <Text style={styles.reportLabel}>Add details, optional</Text>
                            <TextInput
                                value={details}
                                onChangeText={setDetails}
                                editable={!isSubmitting}
                                multiline
                                maxLength={1000}
                                placeholder="Add context for review."
                                placeholderTextColor={colors.inkDim}
                                style={styles.reportInput}
                            />
                            {error !== null && <Text style={styles.reportError}>{error}</Text>}
                            <View style={styles.reportActions}>
                                <TouchableOpacity
                                    style={styles.cancelReportButton}
                                    onPress={() => setMode("menu")}
                                    disabled={isSubmitting}
                                >
                                    <Text style={styles.cancelReportText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    accessibilityState={{ disabled: reason === null || isSubmitting }}
                                    style={[styles.submitReportButton, (reason === null || isSubmitting) && styles.submitReportButtonDisabled]}
                                    onPress={submitReport}
                                    disabled={reason === null || isSubmitting}
                                >
                                    <Text style={styles.submitReportText}>{isSubmitting ? "Submitting..." : "Submit report"}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                </View>
            </Pressable>
        </Modal>
    )
}

function FlagIcon({ color, size = 16 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
            <Path d="M4 22v-7" />
        </Svg>
    )
}

function BlockIcon({ color, size = 16 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
            <Circle cx={12} cy={12} r={9} />
            <Path d="M5.6 5.6l12.8 12.8" />
        </Svg>
    )
}

const styles = StyleSheet.create({
    menuBackdrop: {
        flex: 1,
        justifyContent: "flex-end",
        backgroundColor: "rgba(22,20,19,0.4)",
    },
    sheetCard: {
        backgroundColor: colors.paper,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        borderWidth: 1,
        borderColor: colors.line,
        paddingHorizontal: 8,
        paddingTop: 8,
        shadowColor: colors.ink,
        shadowOpacity: 0.18,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: -4 },
        elevation: 12,
    },
    sheetHandle: {
        alignSelf: "center",
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: colors.line,
        marginTop: 2,
        marginBottom: 8,
    },
    menuHeader: {
        fontFamily: fonts.mono,
        fontSize: 8.5,
        letterSpacing: 1.4,
        color: colors.inkDim,
        fontWeight: "700",
        paddingHorizontal: 8,
        paddingTop: 4,
        paddingBottom: 7,
    },
    menuItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 11,
        paddingVertical: 8,
        paddingHorizontal: 8,
        borderRadius: 10,
    },
    menuItemIcon: {
        width: 32,
        height: 32,
        borderRadius: 9,
        backgroundColor: colors.bg,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    menuItemIconDanger: {
        backgroundColor: "rgba(224,73,46,0.10)",
    },
    menuItemText: {
        flex: 1,
        minWidth: 0,
    },
    menuItemLabel: {
        fontSize: 13.5,
        color: colors.ink,
        fontWeight: "600",
    },
    menuItemSub: {
        fontSize: 11,
        color: colors.inkDim,
        marginTop: 1,
    },
    reportPanel: {
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 12,
        backgroundColor: colors.bg,
        padding: 12,
        marginHorizontal: 4,
        marginBottom: 4,
    },
    reportTitle: {
        fontWeight: "700",
        color: colors.ink,
        fontSize: 14,
        marginBottom: 8,
    },
    reportLabel: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 9.5,
        letterSpacing: 0.5,
        marginBottom: 8,
    },
    reasonGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        marginBottom: 12,
    },
    reasonButton: {
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 8,
        paddingVertical: 7,
        paddingHorizontal: 9,
        backgroundColor: colors.paper,
    },
    reasonButtonActive: {
        borderColor: colors.ink,
        backgroundColor: colors.ink,
    },
    reasonText: {
        fontFamily: fonts.mono,
        color: colors.ink,
        fontSize: 10,
    },
    reasonTextActive: {
        color: "#fff",
    },
    reportInput: {
        minHeight: 72,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 8,
        backgroundColor: colors.paper,
        color: colors.ink,
        fontSize: 14,
        lineHeight: 19,
        paddingHorizontal: 10,
        paddingVertical: 9,
        textAlignVertical: "top",
        marginBottom: 10,
    },
    reportActions: {
        flexDirection: "row",
        gap: 8,
    },
    cancelReportButton: {
        alignItems: "center",
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 8,
        flex: 1,
        paddingVertical: 9,
    },
    cancelReportText: {
        fontFamily: fonts.mono,
        color: colors.ink,
        fontSize: 11,
    },
    submitReportButton: {
        alignItems: "center",
        backgroundColor: colors.ink,
        borderRadius: 8,
        flex: 1,
        paddingVertical: 9,
    },
    submitReportButtonDisabled: { opacity: 0.45 },
    submitReportText: {
        fontFamily: fonts.mono,
        color: "#fff",
        fontSize: 11,
    },
    reportError: {
        color: colors.danger,
        fontSize: 13,
        lineHeight: 18,
        marginBottom: 8,
    },
    reportSuccess: {
        fontFamily: fonts.mono,
        color: colors.like,
        fontSize: 9.5,
        letterSpacing: 0.5,
        marginBottom: 10,
    },
})
