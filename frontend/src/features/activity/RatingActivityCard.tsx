// Feed-style rating activity card, shared so the Profile "Your Activity" list
// matches the Feed event cards: a left text column (actor row, song, bucket
// badge) beside album art ringed by a colored score arc, with an optional note
// and an action row (the like button) below.
import { ReactNode } from "react"
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import Svg, { Circle } from "react-native-svg"

import { bucketColor, colors, fonts } from "../../theme"

// Ring arc geometry — matches the Feed event card's album-art ring.
const RING_SIZE = 84
const RING_CX = 42
const RING_CY = 42
const RING_R = 31
const RING_C = 2 * Math.PI * RING_R
const RING_ARC = (290 / 360) * RING_C // 290° colored arc
const RING_GAP = RING_C - RING_ARC // 70° gap at the bottom

function bucketBgColor(bucket: string): string {
    if (bucket === "like") return "rgba(255,90,60,0.1)"
    if (bucket === "okay" || bucket === "alright") return "rgba(91,141,239,0.1)"
    if (bucket === "dislike") return "rgba(122,58,208,0.1)"
    return "rgba(139,143,156,0.1)"
}

function bucketLabel(bucket: string): string {
    return bucket === "alright" ? "OKAY" : bucket.toUpperCase()
}

type RatingActivityCardProps = {
    initial: string
    avatarColor: string
    who: string
    actionLabel: string
    timeAgo: string
    song: { title: string; artist: string; cover_url: string | null }
    bucket: string
    score: number
    // When true, the numeric score badge is hidden (bucket + ring still show).
    // Used to keep the viewer's OWN scores locked until they've rated 10 songs.
    hideScore?: boolean
    note?: string | null
    onPress?: () => void
    // When provided, renders a "···" options button in the action row (e.g. your own activity).
    onOptions?: () => void
    optionsTestID?: string
    children?: ReactNode
    testID?: string
}

export default function RatingActivityCard({
    initial,
    avatarColor,
    who,
    actionLabel,
    timeAgo,
    song,
    bucket,
    score,
    hideScore,
    note,
    onPress,
    onOptions,
    optionsTestID,
    children,
    testID,
}: RatingActivityCardProps) {
    const bColor = bucketColor(bucket)
    return (
        <View style={styles.card} testID={testID}>
            <View style={styles.cardTopRow}>
                <View style={styles.cardLeft}>
                    <View style={styles.actorRow}>
                        <View style={[styles.actorAvatar, { backgroundColor: avatarColor }]}>
                            <Text style={styles.actorInitial}>{initial}</Text>
                        </View>
                        <Text style={styles.actorMeta} numberOfLines={1}>
                            <Text style={styles.actorHandle}>{who}</Text>
                            <Text style={styles.actorActionWord}> {actionLabel.toLowerCase()}</Text>
                            <Text style={styles.actorTime}> · {timeAgo}</Text>
                        </Text>
                    </View>
                    {/* Only the song title/artist text opens the song — not the blank areas. */}
                    <TouchableOpacity
                        onPress={onPress}
                        activeOpacity={0.75}
                        disabled={!onPress}
                        testID={testID ? `${testID}-song` : undefined}
                    >
                        <Text style={styles.songTitle} numberOfLines={2}>{song.title}</Text>
                        <Text style={styles.songArtist} numberOfLines={1}>{song.artist}</Text>
                    </TouchableOpacity>
                    <View style={[styles.bucketBadge, { backgroundColor: bucketBgColor(bucket) }]}>
                        <Text style={[styles.bucketBadgeText, { color: bColor }]}>
                            IN {bucketLabel(bucket)}
                        </Text>
                    </View>
                </View>

                {/* The album art / score ring also opens the song. */}
                <TouchableOpacity
                    style={styles.ringWrap}
                    onPress={onPress}
                    activeOpacity={0.9}
                    disabled={!onPress}
                >
                    <Svg width={RING_SIZE} height={RING_SIZE} style={{ position: "absolute", top: 0, left: 0 }}>
                        <Circle
                            cx={RING_CX}
                            cy={RING_CY}
                            r={RING_R}
                            stroke={bColor}
                            strokeWidth={4}
                            fill="none"
                            strokeDasharray={`${RING_ARC} ${RING_GAP}`}
                            transform={`rotate(125 ${RING_CX} ${RING_CY})`}
                            strokeLinecap="round"
                        />
                    </Svg>
                    <View style={styles.ringArtWrap}>
                        {song.cover_url ? (
                            <Image style={styles.ringArt} source={{ uri: song.cover_url }} />
                        ) : (
                            <View style={[styles.ringArt, { backgroundColor: colors.paper2 }]} />
                        )}
                    </View>
                    <View style={styles.scoreBadgeWrap}>
                        <View style={[styles.scoreBadge, { borderColor: bColor }]}>
                            <Text style={styles.scoreBadgeText}>{hideScore ? "?" : score.toFixed(1)}</Text>
                        </View>
                    </View>
                </TouchableOpacity>
            </View>

            {note !== null && note !== undefined && note !== "" && (
                <Text style={styles.noteQuote}>"{note}"</Text>
            )}

            {(children || onOptions) && (
                <View style={styles.actionRow}>
                    <View style={styles.actionBtns}>{children}</View>
                    {onOptions && (
                        <TouchableOpacity
                            style={styles.moreBtn}
                            onPress={onOptions}
                            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                            accessibilityLabel="Activity options"
                            testID={optionsTestID}
                        >
                            <Text style={styles.moreDots}>···</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}
        </View>
    )
}

// Mirrors the Feed event-card styles (minus horizontal margin — the caller's
// container controls horizontal placement).
const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.paper,
        borderRadius: 16,
        padding: 14,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: colors.line,
        shadowColor: colors.ink,
        shadowOpacity: 0.04,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
    },
    cardTopRow: {
        flexDirection: "row",
        gap: 12,
        marginBottom: 10,
    },
    cardLeft: {
        flex: 1,
        minWidth: 0,
    },
    actorRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        marginBottom: 8,
    },
    actorAvatar: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    actorInitial: {
        color: "#fff",
        fontWeight: "700",
        fontSize: 12,
    },
    actorMeta: {
        flex: 1,
        fontSize: 12,
        color: colors.inkSoft,
    },
    actorHandle: {
        fontWeight: "700",
        color: colors.ink,
    },
    actorActionWord: {
        color: colors.inkSoft,
    },
    actorTime: {
        fontFamily: fonts.mono,
        fontSize: 10,
        color: colors.inkDim,
    },
    songTitle: {
        fontFamily: fonts.display,
        fontSize: 20,
        letterSpacing: -0.4,
        lineHeight: 22,
        color: colors.ink,
        marginBottom: 3,
    },
    songArtist: {
        fontSize: 13,
        color: colors.inkSoft,
        marginBottom: 9,
    },
    bucketBadge: {
        alignSelf: "flex-start",
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 3.5,
    },
    bucketBadgeText: {
        fontFamily: fonts.mono,
        fontSize: 9,
        fontWeight: "700",
        letterSpacing: 0.5,
    },
    ringWrap: {
        width: RING_SIZE,
        height: RING_SIZE + 12,
        flexShrink: 0,
    },
    ringArtWrap: {
        position: "absolute",
        top: 15,
        left: 15,
        width: 54,
        height: 54,
        borderRadius: 27,
        overflow: "hidden",
    },
    ringArt: {
        width: 54,
        height: 54,
    },
    scoreBadgeWrap: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        alignItems: "center",
    },
    scoreBadge: {
        backgroundColor: colors.paper,
        borderRadius: 9,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderWidth: 1.5,
    },
    scoreBadgeText: {
        fontFamily: fonts.display,
        fontSize: 13,
        letterSpacing: -0.2,
        color: colors.ink,
    },
    noteQuote: {
        fontStyle: "italic",
        fontSize: 13.5,
        color: colors.inkSoft,
        lineHeight: 19,
        marginBottom: 10,
    },
    actionRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingTop: 10,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.line,
    },
    actionBtns: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        flex: 1,
    },
    moreBtn: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        flexShrink: 0,
    },
    moreDots: {
        fontSize: 18,
        lineHeight: 18,
        color: colors.inkDim,
        fontWeight: "700",
    },
})
