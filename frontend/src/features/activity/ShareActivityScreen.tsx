// Full-screen shareable "art" of a single activity. Renders a navy poster card (album art with a
// colored score ring, the bucket verdict, an optional note, and a LISTn watermark), captures it to a
// PNG with react-native-view-shot, and lets the user Save to Photos (expo-media-library) or push it
// to the system share sheet (expo-sharing). Reached from the share button on RatingActivityCard.
import { useRef, useState } from "react"
import { ActivityIndicator, Alert, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import Svg, { Circle, Path } from "react-native-svg"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { NativeStackScreenProps } from "@react-navigation/native-stack"
import { captureRef } from "react-native-view-shot"
import * as MediaLibrary from "expo-media-library"
import * as Sharing from "expo-sharing"

import { AppStackParamList } from "../../navigation/types"
import { bucketColor, colors, fonts } from "../../theme"

type ShareActivityProps = NativeStackScreenProps<AppStackParamList, "ShareActivity">

// Poster art ring — a larger sibling of the RatingActivityCard ring.
const ART = 132
const RING_SIZE = 168
const RING_C = RING_SIZE / 2
const RING_R = 78
const RING_CIRC = 2 * Math.PI * RING_R
const RING_ARC = (290 / 360) * RING_CIRC
const RING_GAP = RING_CIRC - RING_ARC

// Fixed star field so the poster looks identical every capture (no Math.random at render).
const STARS = [
    { x: 8, y: 12, r: 1.4, o: 0.5 }, { x: 22, y: 30, r: 1.0, o: 0.35 }, { x: 38, y: 8, r: 1.7, o: 0.6 },
    { x: 54, y: 22, r: 1.1, o: 0.4 }, { x: 70, y: 10, r: 1.5, o: 0.55 }, { x: 86, y: 26, r: 1.2, o: 0.45 },
    { x: 92, y: 50, r: 1.6, o: 0.5 }, { x: 12, y: 52, r: 1.2, o: 0.4 }, { x: 30, y: 64, r: 1.0, o: 0.3 },
    { x: 48, y: 74, r: 1.5, o: 0.5 }, { x: 66, y: 66, r: 1.1, o: 0.4 }, { x: 82, y: 78, r: 1.3, o: 0.45 },
    { x: 16, y: 84, r: 1.6, o: 0.5 }, { x: 40, y: 92, r: 1.0, o: 0.3 }, { x: 60, y: 88, r: 1.4, o: 0.5 },
    { x: 78, y: 94, r: 1.1, o: 0.35 }, { x: 6, y: 70, r: 1.2, o: 0.4 }, { x: 96, y: 14, r: 1.3, o: 0.45 },
]

function bucketBgColor(bucket: string): string {
    if (bucket === "like") return "rgba(255,90,60,0.18)"
    if (bucket === "okay" || bucket === "alright") return "rgba(91,141,239,0.18)"
    if (bucket === "dislike") return "rgba(122,58,208,0.2)"
    return "rgba(139,143,156,0.18)"
}

function bucketLabel(bucket: string): string {
    return bucket === "alright" ? "OKAY" : bucket.toUpperCase()
}

function CloseIcon() {
    return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"
            stroke={colors.ink} strokeWidth={2.2} strokeLinecap="round">
            <Path d="M18 6 6 18M6 6l12 12" />
        </Svg>
    )
}

function ShareIcon() {
    return (
        <Svg width={17} height={17} viewBox="0 0 24 24" fill="none"
            stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M12 16V4M8 8l4-4 4 4M5 14v5h14v-5" />
        </Svg>
    )
}

function SaveIcon() {
    return (
        <Svg width={17} height={17} viewBox="0 0 24 24" fill="none"
            stroke={colors.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M12 3v12m0 0 4-4m-4 4-4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
        </Svg>
    )
}

export default function ShareActivityScreen({ navigation, route }: ShareActivityProps) {
    const insets = useSafeAreaInsets()
    const { activity } = route.params
    const { username, initial, avatarColor, actionLabel, song, bucket, score, hideScore, note } = activity
    const bColor = bucketColor(bucket)
    const posterRef = useRef<View>(null)
    const [isSaving, setIsSaving] = useState(false)
    const [isSharing, setIsSharing] = useState(false)
    const busy = isSaving || isSharing

    const capture = async (): Promise<string> =>
        captureRef(posterRef, { format: "png", quality: 1, result: "tmpfile" })

    const handleSave = async () => {
        if (busy) return
        setIsSaving(true)
        try {
            const perm = await MediaLibrary.requestPermissionsAsync(true)
            if (!perm.granted) {
                Alert.alert(
                    "Photo access needed",
                    "Allow LISTn to add to your photo library to save this image.",
                )
                return
            }
            const uri = await capture()
            await MediaLibrary.saveToLibraryAsync(uri)
            Alert.alert("Saved", "Your activity art was saved to Photos.")
        } catch {
            Alert.alert("Couldn't save", "Something went wrong saving the image. Please try again.")
        } finally {
            setIsSaving(false)
        }
    }

    const handleShare = async () => {
        if (busy) return
        setIsSharing(true)
        try {
            if (!(await Sharing.isAvailableAsync())) {
                Alert.alert("Sharing unavailable", "Sharing isn't available on this device.")
                return
            }
            const uri = await capture()
            await Sharing.shareAsync(uri, {
                mimeType: "image/png",
                UTI: "public.png",
                dialogTitle: "Share your LISTn activity",
            })
        } catch {
            Alert.alert("Couldn't share", "Something went wrong preparing the image. Please try again.")
        } finally {
            setIsSharing(false)
        }
    }

    return (
        <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
            <View style={styles.topBar}>
                <TouchableOpacity
                    style={styles.closeBtn}
                    onPress={() => navigation.goBack()}
                    hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                    accessibilityLabel="Close"
                >
                    <CloseIcon />
                </TouchableOpacity>
                <Text style={styles.topTitle}>Share</Text>
                <View style={styles.closeBtn} />
            </View>

            <View style={styles.posterWrap}>
                {/* The captured area — everything inside posterRef becomes the saved/shared image. */}
                <View ref={posterRef} collapsable={false} style={styles.poster}>
                    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
                        {STARS.map((s, i) => (
                            <Circle key={i} cx={`${s.x}%`} cy={`${s.y}%`} r={s.r} fill="#fff" fillOpacity={s.o} />
                        ))}
                    </Svg>

                    <View style={styles.posterHeader}>
                        <View style={[styles.posterAvatar, { backgroundColor: avatarColor }]}>
                            <Text style={styles.posterAvatarText}>{initial}</Text>
                        </View>
                        <Text style={styles.posterWho} numberOfLines={1}>
                            <Text style={styles.posterWhoName}>@{username}</Text>
                            <Text style={styles.posterWhoAction}> {actionLabel.toLowerCase()}</Text>
                        </Text>
                    </View>

                    <View style={styles.ringWrap}>
                        <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
                            <Circle
                                cx={RING_C}
                                cy={RING_C}
                                r={RING_R}
                                stroke={bColor}
                                strokeWidth={6}
                                fill="none"
                                strokeDasharray={`${RING_ARC} ${RING_GAP}`}
                                transform={`rotate(125 ${RING_C} ${RING_C})`}
                                strokeLinecap="round"
                            />
                        </Svg>
                        <View style={styles.artWrap}>
                            {song.cover_url ? (
                                <Image style={styles.art} source={{ uri: song.cover_url }} />
                            ) : (
                                <View style={[styles.art, { backgroundColor: colors.navyHi }]} />
                            )}
                        </View>
                        {!hideScore && (
                            <View style={styles.scoreBadgeWrap}>
                                <View style={[styles.scoreBadge, { borderColor: bColor }]}>
                                    <Text style={styles.scoreBadgeText}>{score.toFixed(1)}</Text>
                                </View>
                            </View>
                        )}
                    </View>

                    <Text style={styles.posterTitle} numberOfLines={2}>{song.title}</Text>
                    <Text style={styles.posterArtist} numberOfLines={1}>{song.artist}</Text>

                    <View style={[styles.verdictPill, { backgroundColor: bucketBgColor(bucket) }]}>
                        <Text style={[styles.verdictText, { color: bColor }]}>IN {bucketLabel(bucket)}</Text>
                    </View>

                    {note !== null && note !== undefined && note !== "" && (
                        <Text style={styles.posterNote} numberOfLines={3}>"{note}"</Text>
                    )}

                    <View style={styles.posterFooter}>
                        <Text style={styles.wordmark}>LISTn</Text>
                        <Text style={styles.tagline}>Your music, calibrated</Text>
                    </View>
                </View>
            </View>

            <View style={[styles.actions, { paddingBottom: insets.bottom + 16 }]}>
                <TouchableOpacity
                    style={[styles.actionBtn, styles.saveBtn, busy && styles.btnDisabled]}
                    onPress={handleSave}
                    disabled={busy}
                    accessibilityLabel="Save to Photos"
                >
                    {isSaving ? (
                        <ActivityIndicator color={colors.ink} />
                    ) : (
                        <>
                            <SaveIcon />
                            <Text style={styles.saveBtnText}>Save to Photos</Text>
                        </>
                    )}
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.actionBtn, styles.shareBtn, busy && styles.btnDisabled]}
                    onPress={handleShare}
                    disabled={busy}
                    accessibilityLabel="Share"
                >
                    {isSharing ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <>
                            <ShareIcon />
                            <Text style={styles.shareBtnText}>Share…</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: colors.bg,
        paddingHorizontal: 20,
    },
    topBar: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 8,
    },
    closeBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
    },
    topTitle: {
        fontFamily: fonts.mono,
        fontSize: 12,
        letterSpacing: 1.6,
        color: colors.inkSoft,
        fontWeight: "700",
    },
    posterWrap: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    poster: {
        width: "100%",
        maxWidth: 360,
        aspectRatio: 4 / 5,
        backgroundColor: colors.navy,
        borderRadius: 24,
        paddingHorizontal: 24,
        paddingVertical: 28,
        alignItems: "center",
        overflow: "hidden",
    },
    posterHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        alignSelf: "stretch",
        marginBottom: 18,
    },
    posterAvatar: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    posterAvatarText: {
        color: "#fff",
        fontWeight: "700",
        fontSize: 13,
    },
    posterWho: {
        flex: 1,
        fontSize: 13,
        color: colors.cdim,
    },
    posterWhoName: {
        fontWeight: "700",
        color: colors.cream,
    },
    posterWhoAction: {
        color: colors.cdim,
    },
    ringWrap: {
        width: RING_SIZE,
        height: RING_SIZE,
        marginBottom: 18,
    },
    artWrap: {
        position: "absolute",
        top: (RING_SIZE - ART) / 2,
        left: (RING_SIZE - ART) / 2,
        width: ART,
        height: ART,
        borderRadius: ART / 2,
        overflow: "hidden",
    },
    art: {
        width: ART,
        height: ART,
    },
    scoreBadgeWrap: {
        position: "absolute",
        bottom: -6,
        left: 0,
        right: 0,
        alignItems: "center",
    },
    scoreBadge: {
        backgroundColor: colors.navy,
        borderRadius: 11,
        paddingHorizontal: 11,
        paddingVertical: 4,
        borderWidth: 2,
    },
    scoreBadgeText: {
        fontFamily: fonts.display,
        fontSize: 17,
        letterSpacing: -0.2,
        color: colors.cream,
    },
    posterTitle: {
        fontFamily: fonts.display,
        fontSize: 26,
        lineHeight: 28,
        letterSpacing: -0.5,
        color: colors.cream,
        textAlign: "center",
        marginBottom: 5,
    },
    posterArtist: {
        fontSize: 14,
        color: colors.cdim,
        textAlign: "center",
        marginBottom: 12,
    },
    verdictPill: {
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 5,
    },
    verdictText: {
        fontFamily: fonts.mono,
        fontSize: 10,
        fontWeight: "700",
        letterSpacing: 0.8,
    },
    posterNote: {
        fontStyle: "italic",
        fontSize: 14,
        color: colors.cream,
        opacity: 0.85,
        lineHeight: 20,
        textAlign: "center",
        marginTop: 14,
    },
    posterFooter: {
        marginTop: "auto",
        alignItems: "center",
    },
    wordmark: {
        fontFamily: fonts.display,
        fontSize: 16,
        letterSpacing: 1,
        color: colors.cream,
    },
    tagline: {
        fontFamily: fonts.mono,
        fontSize: 9,
        letterSpacing: 1.2,
        color: colors.cdim,
        marginTop: 2,
    },
    actions: {
        flexDirection: "row",
        gap: 12,
        paddingTop: 16,
    },
    actionBtn: {
        flex: 1,
        height: 52,
        borderRadius: 14,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
    },
    saveBtn: {
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
    },
    saveBtnText: {
        fontFamily: fonts.mono,
        fontSize: 13,
        fontWeight: "700",
        letterSpacing: 0.4,
        color: colors.ink,
    },
    shareBtn: {
        backgroundColor: colors.ink,
    },
    shareBtnText: {
        fontFamily: fonts.mono,
        fontSize: 13,
        fontWeight: "700",
        letterSpacing: 0.4,
        color: "#fff",
    },
    btnDisabled: {
        opacity: 0.5,
    },
})
