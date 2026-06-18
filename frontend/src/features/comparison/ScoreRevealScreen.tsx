import { useEffect, useState } from "react"
import { Image, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import Svg, { Defs, LinearGradient as SvgGradient, Path, Rect, Stop } from "react-native-svg"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { NativeStackScreenProps } from "@react-navigation/native-stack"

import { useAuth } from "../auth/AuthContext"
import { AppStackParamList } from "../../navigation/types"
import { colors, fonts, bucketColor } from "../../theme"
import { RankingResponse } from "../comparison/types"
import { listMyBucketRankings } from "../rankings/apiRequests"

type ScoreRevealProps = NativeStackScreenProps<AppStackParamList, "ScoreReveal">

const HERO_H = 300

function CloseIcon() {
    return (
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none"
            stroke="white" strokeWidth={2.2} strokeLinecap="round">
            <Path d="M18 6 6 18M6 6l12 12" />
        </Svg>
    )
}

function ShareIcon() {
    return (
        <Svg width={15} height={15} viewBox="0 0 24 24" fill="none"
            stroke="white" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <Path d="m16 6-4-4-4 4" />
            <Path d="M12 2v13" />
        </Svg>
    )
}

function HeartSmIcon({ color }: { color: string }) {
    return (
        <Svg width={11} height={11} viewBox="0 0 24 24">
            <Path
                d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                fill={color}
            />
        </Svg>
    )
}

function ListIcon({ color }: { color: string }) {
    return (
        <Svg width={15} height={15} viewBox="0 0 24 24" fill="none"
            stroke={color} strokeWidth={2.3} strokeLinecap="round">
            <Path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
        </Svg>
    )
}

export default function ScoreRevealScreen({ navigation, route }: ScoreRevealProps) {
    const { token } = useAuth()
    const insets = useSafeAreaInsets()
    const { result } = route.params
    const { ranking } = result
    const accent = bucketColor(ranking.bucket)
    const bucketLabel = ranking.bucket === "alright" ? "OKAY" : ranking.bucket.toUpperCase()
    const bucketLabelSingular = ranking.bucket === "alright" ? "okay" : ranking.bucket

    const [neighbors, setNeighbors] = useState<RankingResponse[]>([])
    const [bucketTotal, setBucketTotal] = useState<number | null>(null)

    useEffect(() => {
        if (!token) return
        listMyBucketRankings(ranking.bucket, token)
            .then((res) => {
                const all = res.rankings
                setBucketTotal(all.length)
                const idx = all.findIndex((r) => r.id === ranking.id)
                if (idx === -1) {
                    // Fallback: match by song id
                    const byId = all.findIndex((r) => r.song_id === ranking.song_id)
                    if (byId === -1) return
                    const start = Math.max(0, byId - 2)
                    setNeighbors(all.slice(start, start + 5))
                    return
                }
                const start = Math.max(0, idx - 2)
                setNeighbors(all.slice(start, start + 5))
            })
            .catch(() => {})
    }, [])

    const topPct = bucketTotal !== null
        ? Math.max(1, Math.round((ranking.position / bucketTotal) * 100))
        : null

    const handleClose = () => navigation.navigate("MainTabs", { screen: "Rankings" })
    const handleShare = async () => {
        try {
            await Share.share({
                message: `Just rated "${ranking.song.title}" by ${ranking.song.artist}: ${ranking.score.toFixed(1)}/10 on LISTn`,
            })
        } catch {}
    }
    const handleViewRankings = () => navigation.navigate("MainTabs", { screen: "Rankings" })
    const handleDone = () => navigation.navigate("MainTabs", { screen: "Discover" })

    return (
        <View style={styles.root}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 80 + insets.bottom }}
            >
                {/* ── Hero ──────────────────────────────────────────────── */}
                {/* Full-bleed album art that melts down into the warm paper page.
                    The gradient keeps the art clear until ~70% down, with only a
                    subtle dark band at the very top for button legibility, so far
                    more of the cover shows through than a hard fade would. */}
                <View style={styles.hero}>
                    {ranking.song.cover_url
                        ? <Image source={{ uri: ranking.song.cover_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                        : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.sand }]} />
                    }
                    <Svg style={StyleSheet.absoluteFill} width="100%" height={HERO_H}>
                        <Defs>
                            <SvgGradient id="sr-fade" x1="0" y1="0" x2="0" y2="1">
                                <Stop offset="0" stopColor={colors.ink} stopOpacity="0.34" />
                                <Stop offset="0.32" stopColor={colors.bg} stopOpacity="0" />
                                <Stop offset="0.7" stopColor={colors.bg} stopOpacity="0.72" />
                                <Stop offset="1" stopColor={colors.bg} stopOpacity="1" />
                            </SvgGradient>
                        </Defs>
                        <Rect x="0" y="0" width="100%" height={HERO_H} fill="url(#sr-fade)" />
                    </Svg>
                    <View style={[StyleSheet.absoluteFill, styles.heroOverlay, { paddingTop: insets.top + 8 }]}>
                        <View style={styles.heroButtons}>
                            <TouchableOpacity style={styles.ghostBtn} onPress={handleClose}>
                                <CloseIcon />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.ghostBtn} onPress={handleShare}>
                                <ShareIcon />
                            </TouchableOpacity>
                        </View>
                        <View style={{ flex: 1 }} />
                        {/* Caption overlaid on the lower (paper-faded) part of the art */}
                        <View style={styles.heroCaption}>
                            <View style={[styles.badge, { backgroundColor: accent }]}>
                                <HeartSmIcon color="#fff" />
                                <Text style={styles.badgeText}>
                                    YOU {ranking.bucket === "like" ? "LIKED" : ranking.bucket === "alright" ? "OKAYED" : "DISLIKED"} THIS
                                </Text>
                            </View>
                            <Text style={styles.songTitle} numberOfLines={2}>{ranking.song.title}</Text>
                            <Text style={styles.artistName}>{ranking.song.artist}</Text>
                        </View>
                    </View>
                </View>

                {/* ── Below hero ────────────────────────────────────────── */}
                <View style={styles.content}>
                    {/* Score */}
                    <View style={styles.scoreRow}>
                        <Text style={[styles.scoreBig, { color: accent }]}>{ranking.score.toFixed(1)}</Text>
                        <Text style={styles.scoreDenom}>/10</Text>
                    </View>

                    {/* Stat line */}
                    <Text style={styles.statLine}>
                        #{ranking.position}{bucketTotal !== null ? ` OF ${bucketTotal}` : ""}
                        {topPct !== null ? `  ·  TOP ${topPct}% OF YOUR ${bucketLabel}S` : ""}
                    </Text>

                    {/* Slot list */}
                    <Text style={styles.slotKicker}>ITS PLACE IN YOUR {bucketLabel}S</Text>
                    <View style={styles.slotList}>
                        {neighbors.map((r) => {
                            const isNew = r.id === ranking.id
                            return (
                                <View
                                    key={r.id}
                                    style={[
                                        styles.slotRow,
                                        isNew && { backgroundColor: `${accent}12` },
                                    ]}
                                >
                                    <Text style={styles.slotRank}>{r.position}</Text>
                                    <View style={[
                                        styles.slotArtWrap,
                                        isNew && { borderColor: accent, borderWidth: 2 },
                                    ]}>
                                        {r.song.cover_url
                                            ? <Image source={{ uri: r.song.cover_url }} style={styles.slotArt} />
                                            : <View style={[styles.slotArt, { backgroundColor: colors.sand }]} />
                                        }
                                    </View>
                                    <View style={styles.slotInfo}>
                                        <View style={styles.slotTitleRow}>
                                            <Text style={styles.slotTitle} numberOfLines={1}>{r.song.title}</Text>
                                            {isNew && (
                                                <View style={[styles.newBadge, { backgroundColor: `${accent}22` }]}>
                                                    <Text style={[styles.newBadgeText, { color: accent }]}>NEW</Text>
                                                </View>
                                            )}
                                        </View>
                                        <Text style={styles.slotArtist} numberOfLines={1}>{r.song.artist}</Text>
                                    </View>
                                    <Text style={[styles.slotScore, isNew && { color: accent }]}>
                                        {r.score.toFixed(1)}
                                    </Text>
                                </View>
                            )
                        })}
                    </View>
                </View>
            </ScrollView>

            {/* ── Footer ────────────────────────────────────────────────── */}
            <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
                <TouchableOpacity style={[styles.viewBtn, { backgroundColor: accent }]} onPress={handleViewRankings}>
                    <ListIcon color="#fff" />
                    <Text style={styles.viewBtnText}>View in Rankings</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.doneBtn} onPress={handleDone}>
                    <Text style={styles.doneBtnText}>Done</Text>
                </TouchableOpacity>
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: colors.bg,
    },
    // ── Hero ──────────────────────────────────────────────────────────────
    hero: {
        height: HERO_H,
        overflow: "hidden",
    },
    heroOverlay: {
        flexDirection: "column",
    },
    heroButtons: {
        flexDirection: "row",
        justifyContent: "space-between",
        paddingHorizontal: 16,
    },
    heroCaption: {
        paddingHorizontal: 16,
        paddingBottom: 14,
    },
    ghostBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: "rgba(0,0,0,0.28)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.22)",
        alignItems: "center",
        justifyContent: "center",
    },
    // ── Content ───────────────────────────────────────────────────────────
    content: {
        paddingHorizontal: 16,
        paddingTop: 12,
    },
    badge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        alignSelf: "flex-start",
        borderRadius: 999,
        paddingHorizontal: 11,
        paddingVertical: 5,
        marginBottom: 9,
    },
    badgeText: {
        fontFamily: fonts.mono,
        fontSize: 9,
        fontWeight: "700",
        letterSpacing: 1.2,
        color: "#fff",
    },
    songTitle: {
        fontFamily: fonts.display,
        fontSize: 26,
        color: colors.ink,
        lineHeight: 28,
        marginBottom: 3,
    },
    artistName: {
        fontSize: 13,
        color: colors.inkSoft,
    },
    // ── Score ─────────────────────────────────────────────────────────────
    scoreRow: {
        flexDirection: "row",
        alignItems: "flex-end",
        gap: 4,
        marginBottom: 4,
    },
    scoreBig: {
        fontFamily: fonts.display,
        fontSize: 72,
    },
    scoreDenom: {
        fontFamily: fonts.display,
        fontSize: 22,
        color: colors.inkDim,
        marginBottom: 6,
    },
    statLine: {
        fontFamily: fonts.mono,
        fontSize: 9,
        letterSpacing: 1.6,
        color: colors.inkDim,
        fontWeight: "700",
        marginBottom: 20,
    },
    // ── Slot list ─────────────────────────────────────────────────────────
    slotKicker: {
        fontFamily: fonts.mono,
        fontSize: 8.5,
        letterSpacing: 2.4,
        color: colors.inkDim,
        fontWeight: "700",
        marginBottom: 8,
    },
    slotList: {
        borderRadius: 14,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: colors.line,
    },
    slotRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 7,
        paddingHorizontal: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.line,
    },
    slotRank: {
        fontFamily: fonts.serif,
        fontStyle: "italic",
        fontSize: 12,
        color: colors.inkDim,
        width: 18,
        textAlign: "center",
        flexShrink: 0,
    },
    slotArtWrap: {
        width: 36,
        height: 36,
        borderRadius: 7,
        overflow: "hidden",
        flexShrink: 0,
        borderWidth: 0,
        borderColor: "transparent",
    },
    slotArt: {
        width: "100%",
        height: "100%",
    },
    slotInfo: {
        flex: 1,
        minWidth: 0,
    },
    slotTitleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        flexWrap: "nowrap",
    },
    slotTitle: {
        fontFamily: fonts.serif,
        fontSize: 13,
        color: colors.ink,
        flexShrink: 1,
    },
    newBadge: {
        borderRadius: 999,
        paddingHorizontal: 5,
        paddingVertical: 2,
        flexShrink: 0,
    },
    newBadgeText: {
        fontFamily: fonts.mono,
        fontSize: 7,
        letterSpacing: 1.2,
        fontWeight: "700",
    },
    slotArtist: {
        fontSize: 10,
        color: colors.inkDim,
        marginTop: 1,
    },
    slotScore: {
        fontFamily: fonts.display,
        fontSize: 15,
        color: colors.ink,
        flexShrink: 0,
    },
    // ── Footer ────────────────────────────────────────────────────────────
    footer: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: "row",
        gap: 10,
        paddingHorizontal: 16,
        paddingTop: 12,
        backgroundColor: colors.bg,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.line,
    },
    viewBtn: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        borderRadius: 13,
        paddingVertical: 15,
        shadowColor: colors.ink,
        shadowOpacity: 0.18,
        shadowRadius: 0,
        shadowOffset: { width: 3, height: 3 },
        elevation: 4,
    },
    viewBtnText: {
        fontFamily: fonts.display,
        fontSize: 14,
        color: "#fff",
    },
    doneBtn: {
        borderRadius: 13,
        paddingVertical: 15,
        paddingHorizontal: 20,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1.5,
        borderColor: colors.line,
    },
    doneBtnText: {
        fontFamily: fonts.display,
        fontSize: 13,
        color: colors.ink,
    },
})
