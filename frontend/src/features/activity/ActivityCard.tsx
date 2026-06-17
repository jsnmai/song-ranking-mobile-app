// A feed-style activity card for one rating verdict, reused on the "view all" activity list.
// Self-contained: it owns the note report flow (so any visible note has a report path) and
// the like button, so a list screen only has to map items to <ActivityCard>.
import { useState } from "react"
import { ActivityIndicator, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native"
import Svg, { Circle } from "react-native-svg"

import { ApiError } from "../../api/client"
import { bucketColor, colors, fonts } from "../../theme"
import { formatRelativeTime } from "../../utils/formatRelativeTime"
import { useAuth } from "../auth/AuthContext"
import { reportRatingEvent } from "../feed/apiRequests"
import { RecentRatingItem } from "../profile/types"
import { ReportReason } from "../profile/types"
import ActivityLikeButton from "./ActivityLikeButton"

const RING_SIZE = 84
const RING_R = 31
const RING_C = 2 * Math.PI * RING_R
const RING_ARC = (290 / 360) * RING_C
const RING_GAP = RING_C - RING_ARC

const REPORT_REASONS: readonly { value: ReportReason; label: string }[] = [
    { value: "harassment", label: "Harassment" },
    { value: "hate_or_abuse", label: "Hate or abuse" },
    { value: "impersonation", label: "Impersonation" },
    { value: "inappropriate_content", label: "Inappropriate content" },
    { value: "spam", label: "Spam" },
    { value: "under_13", label: "Under 13" },
    { value: "other", label: "Other" },
]

const AVATAR_PALETTE = [colors.accent, colors.sky, colors.plum, colors.mint, "#d4823a", "#c47ab2"]
function avatarColor(username: string): string {
    let h = 0
    for (let i = 0; i < username.length; i++) h = username.charCodeAt(i) + ((h << 5) - h)
    return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length]
}

function bucketBgColor(bucket: string): string {
    if (bucket === "like") return "rgba(255,90,60,0.1)"
    if (bucket === "okay" || bucket === "alright") return "rgba(91,141,239,0.1)"
    if (bucket === "dislike") return "rgba(122,58,208,0.1)"
    return "rgba(139,143,156,0.1)"
}

type Props = {
    username: string
    item: RecentRatingItem
    onOpenSong: () => void
    onOpenLikers?: (ratingEventId: number) => void
    opening?: boolean
}

export default function ActivityCard({ username, item, onOpenSong, onOpenLikers, opening = false }: Props) {
    const { token } = useAuth()
    const [reportOpen, setReportOpen] = useState(false)
    const [reason, setReason] = useState<ReportReason | null>(null)
    const [details, setDetails] = useState("")
    const [isReporting, setIsReporting] = useState(false)
    const [reported, setReported] = useState(false)
    const [reportError, setReportError] = useState<string | null>(null)

    const bColor = bucketColor(item.bucket)
    const bucketLabel = item.bucket === "alright" ? "OKAY" : item.bucket.toUpperCase()
    const initial = username[0].toUpperCase()
    const canReport = item.note !== null && item.note !== ""

    const submitReport = async () => {
        if (!token || reason === null || isReporting) return
        setIsReporting(true)
        setReportError(null)
        try {
            await reportRatingEvent(item.rating_event_id, { target_type: "rating_note", reason, details }, token)
            setReported(true)
            setReportOpen(false)
            setReason(null)
            setDetails("")
        } catch (err) {
            setReportError(err instanceof ApiError ? err.detail : "Could not submit report.")
        } finally {
            setIsReporting(false)
        }
    }

    return (
        <View style={styles.card} testID={`activity-card-${item.rating_event_id}`}>
            <View style={styles.topRow}>
                <View style={styles.left}>
                    <View style={styles.actorRow}>
                        <View style={[styles.avatar, { backgroundColor: avatarColor(username) }]}>
                            <Text style={styles.avatarLetter}>{initial}</Text>
                        </View>
                        <Text style={styles.actorMeta} numberOfLines={1}>
                            <Text style={styles.handle}>@{username}</Text>
                            <Text style={styles.actionWord}> rated</Text>
                            <Text style={styles.time}> · {formatRelativeTime(item.created_at)}</Text>
                        </Text>
                    </View>
                    <TouchableOpacity onPress={onOpenSong} disabled={opening} activeOpacity={0.75} testID={`activity-song-${item.rating_event_id}`}>
                        <Text style={styles.songTitle} numberOfLines={2}>{item.song.title}</Text>
                        <Text style={styles.songArtist} numberOfLines={1}>{item.song.artist}</Text>
                    </TouchableOpacity>
                    <View style={[styles.bucketBadge, { backgroundColor: bucketBgColor(item.bucket) }]}>
                        <Text style={[styles.bucketBadgeText, { color: bColor }]}>IN {bucketLabel}</Text>
                    </View>
                </View>

                <TouchableOpacity style={styles.ringWrap} onPress={onOpenSong} disabled={opening} activeOpacity={0.9}>
                    <Svg width={RING_SIZE} height={RING_SIZE} style={{ position: "absolute", top: 0, left: 0 }}>
                        <Circle
                            cx={42} cy={42} r={RING_R} stroke={bColor} strokeWidth={4} fill="none"
                            strokeDasharray={`${RING_ARC} ${RING_GAP}`} transform={`rotate(125 42 42)`} strokeLinecap="round"
                        />
                    </Svg>
                    <View style={styles.ringArtWrap}>
                        {item.song.cover_url ? (
                            <Image style={styles.ringArt} source={{ uri: item.song.cover_url }} />
                        ) : (
                            <View style={[styles.ringArt, { backgroundColor: colors.paper2 }]} />
                        )}
                    </View>
                    <View style={styles.scoreBadgeWrap}>
                        <View style={[styles.scoreBadge, { borderColor: bColor }]}>
                            {opening ? (
                                <ActivityIndicator color={bColor} size="small" />
                            ) : (
                                <Text style={styles.scoreBadgeText}>{item.score.toFixed(1)}</Text>
                            )}
                        </View>
                    </View>
                </TouchableOpacity>
            </View>

            {item.note !== null && item.note !== "" && (
                <Text style={styles.noteQuote}>"{item.note}"</Text>
            )}

            {reported && <Text style={styles.reportSuccess}>Thanks. We'll review this report.</Text>}

            {reportOpen && (
                <View style={styles.reportPanel}>
                    <Text style={styles.reportTitle}>Report note</Text>
                    <View style={styles.reasonGrid}>
                        {REPORT_REASONS.map((r) => (
                            <TouchableOpacity
                                key={r.value}
                                style={[styles.reasonButton, reason === r.value && styles.reasonButtonActive]}
                                onPress={() => setReason(r.value)}
                                disabled={isReporting}
                            >
                                <Text style={[styles.reasonText, reason === r.value && styles.reasonTextActive]}>{r.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <TextInput
                        value={details}
                        onChangeText={setDetails}
                        editable={!isReporting}
                        multiline
                        maxLength={1000}
                        placeholder="Add context for review."
                        placeholderTextColor={colors.inkDim}
                        style={styles.reportInput}
                    />
                    {reportError !== null && <Text style={styles.reportError}>{reportError}</Text>}
                    <View style={styles.reportActions}>
                        <TouchableOpacity style={styles.cancelBtn} onPress={() => setReportOpen(false)} disabled={isReporting}>
                            <Text style={styles.cancelText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.submitBtn, (reason === null || isReporting) && styles.submitDisabled]}
                            onPress={submitReport}
                            disabled={reason === null || isReporting}
                        >
                            <Text style={styles.submitText}>{isReporting ? "Submitting..." : "Submit report"}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            <View style={styles.actionRow}>
                <View style={styles.actionBtns}>
                    <ActivityLikeButton
                        ratingEventId={item.rating_event_id}
                        initialLikedByViewer={item.liked_by_viewer}
                        initialLikeCount={item.like_count}
                        onOpenLikers={onOpenLikers}
                    />
                </View>
                {canReport && !reported && (
                    <TouchableOpacity
                        style={styles.moreBtn}
                        onPress={() => setReportOpen((v) => !v)}
                        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                        accessibilityLabel="Report note"
                        testID={`activity-report-${item.rating_event_id}`}
                    >
                        <Text style={styles.moreDots}>···</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.paper,
        marginHorizontal: 14,
        marginBottom: 8,
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: colors.line,
        shadowColor: colors.ink,
        shadowOpacity: 0.04,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
    },
    topRow: { flexDirection: "row", gap: 12, marginBottom: 10 },
    left: { flex: 1, minWidth: 0 },
    actorRow: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 8 },
    avatar: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", flexShrink: 0 },
    avatarLetter: { color: "#fff", fontWeight: "700", fontSize: 12 },
    actorMeta: { flex: 1, fontSize: 12, color: colors.inkSoft },
    handle: { fontWeight: "700", color: colors.ink },
    actionWord: { color: colors.inkSoft },
    time: { fontFamily: fonts.mono, fontSize: 10, color: colors.inkDim },
    songTitle: { fontFamily: fonts.display, fontSize: 20, letterSpacing: -0.4, lineHeight: 22, color: colors.ink, marginBottom: 3 },
    songArtist: { fontSize: 13, color: colors.inkSoft, marginBottom: 9 },
    bucketBadge: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3.5 },
    bucketBadgeText: { fontFamily: fonts.mono, fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
    ringWrap: { width: RING_SIZE, height: RING_SIZE + 12, flexShrink: 0 },
    ringArtWrap: { position: "absolute", top: 15, left: 15, width: 54, height: 54, borderRadius: 27, overflow: "hidden" },
    ringArt: { width: 54, height: 54 },
    scoreBadgeWrap: { position: "absolute", bottom: 0, left: 0, right: 0, alignItems: "center" },
    scoreBadge: { backgroundColor: colors.paper, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1.5 },
    scoreBadgeText: { fontFamily: fonts.display, fontSize: 13, letterSpacing: -0.2, color: colors.ink },
    noteQuote: { fontStyle: "italic", fontSize: 13.5, color: colors.inkSoft, lineHeight: 19, marginBottom: 10 },
    reportSuccess: { fontFamily: fonts.mono, color: colors.like, fontSize: 9.5, letterSpacing: 0.5, marginBottom: 8 },
    actionRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingTop: 10,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.line,
    },
    actionBtns: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
    moreBtn: {},
    moreDots: { color: colors.inkDim, fontSize: 18, letterSpacing: -1 },
    reportPanel: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.bg, padding: 12, marginTop: 8 },
    reportTitle: { fontWeight: "700", color: colors.ink, fontSize: 14, marginBottom: 8 },
    reasonGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
    reasonButton: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 9, backgroundColor: colors.paper },
    reasonButtonActive: { borderColor: colors.ink, backgroundColor: colors.ink },
    reasonText: { fontFamily: fonts.mono, color: colors.ink, fontSize: 10 },
    reasonTextActive: { color: "#fff" },
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
    reportActions: { flexDirection: "row", gap: 8 },
    cancelBtn: { alignItems: "center", borderWidth: 1, borderColor: colors.line, borderRadius: 8, flex: 1, paddingVertical: 9 },
    cancelText: { fontFamily: fonts.mono, color: colors.ink, fontSize: 11 },
    submitBtn: { alignItems: "center", backgroundColor: colors.ink, borderRadius: 8, flex: 1, paddingVertical: 9 },
    submitDisabled: { opacity: 0.45 },
    submitText: { fontFamily: fonts.mono, color: "#fff", fontSize: 11 },
    reportError: { color: colors.danger, fontSize: 13, lineHeight: 18, marginBottom: 8 },
})
