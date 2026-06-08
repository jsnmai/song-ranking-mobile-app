// Rankings tab — shows the user's ranked songs sorted by score.
import { useCallback, useState } from "react"
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { FlashList } from "@shopify/flash-list"
import { CompositeNavigationProp, useFocusEffect, useNavigation } from "@react-navigation/native"
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"

import { ApiError } from "../../api/client"
import DiamondScore from "../../components/DiamondScore"
import ScoreArc from "../../components/ScoreArc"
import { AppStackParamList, RankingsStackParamList, TabParamList } from "../../navigation/types"
import { colors, fonts, bucketColor } from "../../theme"
import { useAuth } from "../auth/AuthContext"
import { BucketName, RankingAnchorsResponse, RankingResponse } from "../comparison/types"
import { getMyRankingAnchors, listMyRankings } from "./apiRequests"

type RankingsNavigation = CompositeNavigationProp<
    NativeStackNavigationProp<RankingsStackParamList, "RankingsOverview">,
    CompositeNavigationProp<
        BottomTabNavigationProp<TabParamList, "Rankings">,
        NativeStackNavigationProp<AppStackParamList>
    >
>

// Top ORBIT_COUNT songs fill the orbital constellation; PREVIEW_COUNT rows appear below the separator.
const ORBIT_COUNT = 6
const PREVIEW_COUNT = 5
const DIAL_SIZE = 292
const DIAL_RADIUS = DIAL_SIZE / 2 - 32          // 114 — orbit path radius
const DIAL_START_DEG = -54                       // first satellite angle (upper-right)
const DIAL_SWEEP_DEG = 288                       // total arc covered by all satellites
const ORBIT_COVER_BASE = 60                      // #1 cover diameter
const ORBIT_COVER_STEP = 5                       // shrink per rank step
const CENTER_RING_SIZE = 108                     // center count circle
const EMPTY_ANCHORS: RankingAnchorsResponse = {
    top_like: null,
    median_okay: null,
    lowest_dislike: null,
}
const ANCHOR_DEFS: readonly {
    key: keyof RankingAnchorsResponse;
    label: string;
    empty: string;
}[] = [
    { key: "top_like", label: "Top Like", empty: "No Like ratings yet." },
    { key: "median_okay", label: "Median Okay", empty: "No Okay ratings yet." },
    { key: "lowest_dislike", label: "Lowest Dislike", empty: "No Dislike ratings yet." },
]
export default function RankingsScreen() {
    const navigation = useNavigation<RankingsNavigation>()
    const { token } = useAuth()
    const [rankings, setRankings] = useState<RankingResponse[]>([])
    const [anchors, setAnchors] = useState<RankingAnchorsResponse>(EMPTY_ANCHORS)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const loadRankings = useCallback(async () => {
        if (!token) {
            return
        }

        setIsLoading(true)
        setError(null)

        try {
            const allRankings: RankingResponse[] = []
            let cursor: string | null = null
            do {
                const response = await listMyRankings(token, cursor ?? undefined)
                allRankings.push(...response.rankings)
                cursor = response.next_cursor
            } while (cursor !== null)
            const anchorResponse = await getMyRankingAnchors(token)
            setRankings(allRankings)
            setAnchors(anchorResponse)
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.detail)
            } else if (err instanceof Error) {
                setError(err.message)
            } else {
                setError("Rankings are temporarily unavailable.")
            }
        } finally {
            setIsLoading(false)
        }
    }, [token])

    function handleRateFirstSong() {
        navigation.navigate("Discover", { focusSearch: true })
    }

    const handleRankingPress = (ranking: RankingResponse) => {
        navigation.navigate("SongDetail", { ranking })
    }

    const handleReorderPress = () => {
        navigation.navigate("Reorder")
    }

    const handleVersusHistoryPress = () => {
        navigation.navigate("VersusHistory")
    }

    const handleFullRankingsPress = () => {
        navigation.navigate("FullRankings")
    }

    const renderAnchor = (
        label: string,
        anchor: RankingResponse | null,
        emptyText: string,
    ) => {
        if (anchor === null) {
            return (
                <View style={styles.anchorCard}>
                    <Text style={styles.anchorLabel}>{label}</Text>
                    <Text style={styles.anchorEmpty}>{emptyText}</Text>
                </View>
            )
        }

        const accent = bucketColor(anchor.bucket)
        return (
            <View style={styles.anchorCard}>
                <Text
                    style={styles.anchorLabel}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                >
                    {label}
                </Text>
                <View style={styles.anchorContent}>
                    <View style={styles.anchorCover}>
                        {anchor.song.cover_url ? (
                            <Image source={{ uri: anchor.song.cover_url }} style={styles.anchorCoverImage} />
                        ) : null}
                    </View>
                    <View style={styles.anchorText}>
                        <Text style={styles.anchorTitle} numberOfLines={1}>{anchor.song.title}</Text>
                        <Text style={styles.anchorArtist} numberOfLines={1}>{anchor.song.artist}</Text>
                    </View>
                </View>
                <View style={styles.anchorMetaRow}>
                    <Text style={[styles.anchorScore, { color: accent }]}>{anchor.score.toFixed(1)}</Text>
                    <Text style={styles.anchorBucket}>{bucketLabel(anchor.bucket)} · #{anchor.position}</Text>
                </View>
            </View>
        )
    }

    // Renders the orbit constellation + list separator as the FlashList header.
    const renderListHeader = () => {
        const orbitItems = rankings.slice(0, Math.min(ORBIT_COUNT, rankings.length))
        const n = orbitItems.length

        return (
            <View>
                {/* Screen heading */}
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        <Text style={styles.kicker}>{rankings.length} SONGS · YOUR RANKINGS</Text>
                        <Text style={styles.heading}>What you LISTn to</Text>
                    </View>
                    <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel="Reorder rankings"
                        onPress={handleReorderPress}
                        style={styles.reorderButton}
                    >
                        <Text style={styles.reorderButtonText}>Reorder</Text>
                    </TouchableOpacity>
                </View>

                {/* Orbit constellation */}
                <View style={styles.orbitWrapper}>
                    {orbitItems.map((item, i) => {
                        const step = n > 1 ? DIAL_SWEEP_DEG / (n - 1) : 0
                        const angleDeg = DIAL_START_DEG + step * i
                        const angleRad = (angleDeg * Math.PI) / 180
                        const orbitX = DIAL_SIZE / 2 + DIAL_RADIUS * Math.cos(angleRad)
                        const orbitY = DIAL_SIZE / 2 + DIAL_RADIUS * Math.sin(angleRad)
                        const coverSz = ORBIT_COVER_BASE - i * ORBIT_COVER_STEP
                        const ringW = i === 0 ? 2.5 : 1.5
                        const ringSz = coverSz + ringW * 2 + 4
                        const wrapW = Math.max(ringSz, 64)
                        const accent = bucketColor(item.bucket)

                        return (
                            <TouchableOpacity
                                key={item.id}
                                testID={`ranking-orbit-${item.id}`}
                                accessibilityRole="button"
                                accessibilityLabel={`Open ${item.song.title} details`}
                                onPress={() => handleRankingPress(item)}
                                activeOpacity={0.8}
                                style={[
                                    styles.orbitSatellite,
                                    {
                                        left: orbitX,
                                        top: orbitY,
                                        width: wrapW,
                                        transform: [
                                            { translateX: -wrapW / 2 },
                                            { translateY: -ringSz / 2 },
                                        ],
                                    },
                                ]}
                            >
                                {/* Ring border */}
                                <View style={{
                                    width: ringSz,
                                    height: ringSz,
                                    borderRadius: ringSz / 2,
                                    borderWidth: ringW,
                                    borderColor: accent,
                                    alignItems: "center",
                                    justifyContent: "center",
                                }}>
                                    {/* Circular cover art */}
                                    <View style={{
                                        width: coverSz,
                                        height: coverSz,
                                        borderRadius: coverSz / 2,
                                        overflow: "hidden",
                                        backgroundColor: colors.sand,
                                    }}>
                                        {item.song.cover_url ? (
                                            <Image
                                                source={{ uri: item.song.cover_url }}
                                                style={styles.orbitCoverImage}
                                            />
                                        ) : null}
                                    </View>
                                </View>
                                <Text style={styles.orbitPosition}>#{item.position}</Text>
                                <Text style={[styles.orbitScore, { color: accent }]}>
                                    {item.score.toFixed(1)}
                                </Text>
                                <Text style={styles.orbitTitle} numberOfLines={1}>
                                    {item.song.title}
                                </Text>
                            </TouchableOpacity>
                        )
                    })}

                    {/* Center count circle */}
                    <View style={[
                        styles.orbitCenter,
                        {
                            left: DIAL_SIZE / 2,
                            top: DIAL_SIZE / 2,
                            transform: [
                                { translateX: -CENTER_RING_SIZE / 2 },
                                { translateY: -CENTER_RING_SIZE / 2 },
                            ],
                        },
                    ]}>
                        <ScoreArc
                            score={10}
                            max={10}
                            size={CENTER_RING_SIZE}
                            strokeWidth={8}
                            color={colors.like}
                            trackColor={colors.sand}
                        >
                            <View style={styles.centerContent}>
                                <Text style={styles.centerCount}>{rankings.length}</Text>
                                <Text style={styles.centerLabel}>SONGS</Text>
                            </View>
                        </ScoreArc>
                    </View>
                </View>

                <View style={styles.anchorsSection}>
                    <Text style={styles.anchorsTitle}>Anchors</Text>
                    <Text style={styles.anchorsCopy}>
                        Your calibration points.
                    </Text>
                    <View style={styles.anchorGrid}>
                        {ANCHOR_DEFS.map((anchorDef) => (
                            <View key={anchorDef.key} style={styles.anchorGridItem}>
                                {renderAnchor(
                                    anchorDef.label,
                                    anchors[anchorDef.key],
                                    anchorDef.empty,
                                )}
                            </View>
                        ))}
                    </View>
                </View>

                <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Open Versus History"
                    style={styles.versusHistoryCard}
                    onPress={handleVersusHistoryPress}
                    activeOpacity={0.8}
                >
                    <View>
                        <Text style={styles.versusHistoryTitle}>Versus History</Text>
                        <Text style={styles.versusHistoryCopy}>See your recent head-to-head decisions</Text>
                    </View>
                    <Text style={styles.versusHistoryArrow}>→</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="View All / Filter Rankings"
                    style={styles.separator}
                    onPress={handleFullRankingsPress}
                >
                    <Text style={styles.separatorRange}>
                        1 — {rankings.length}
                    </Text>
                    <Text style={styles.separatorRight}>View All / Filter →</Text>
                </TouchableOpacity>
            </View>
        )
    }

    useFocusEffect(
        useCallback(() => {
            loadRankings()
        }, [loadRankings]),
    )

    if (isLoading && rankings.length === 0) {
        return (
            <View style={styles.centerState}>
                <ActivityIndicator color={colors.clay} />
            </View>
        )
    }

    if (error !== null && rankings.length === 0) {
        return (
            <View style={styles.centerState}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={styles.button} onPress={loadRankings}>
                    <Text style={styles.buttonText}>Try again</Text>
                </TouchableOpacity>
            </View>
        )
    }

    if (rankings.length === 0) {
        return (
            <View style={styles.centerState}>
                <Text style={styles.emptyText}>Rate your first song</Text>
                <TouchableOpacity style={styles.button} onPress={handleRateFirstSong}>
                    <Text style={styles.buttonText}>Find a song</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.emptyHistoryButton} onPress={handleVersusHistoryPress}>
                    <Text style={styles.emptyHistoryText}>Versus History</Text>
                </TouchableOpacity>
            </View>
        )
    }

    return (
        <View style={styles.container}>
            {error !== null && <Text style={styles.inlineError}>{error}</Text>}
            <FlashList
                data={rankings.slice(0, PREVIEW_COUNT)}
                keyExtractor={(item: RankingResponse) => item.id.toString()}
                ListHeaderComponent={renderListHeader()}
                renderItem={({ item }) => (
                    <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={`Open ${item.song.title} details`}
                        testID={`ranking-preview-row-${item.id}`}
                        style={styles.previewRow}
                        onPress={() => handleRankingPress(item)}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.previewPosition}>#{item.position}</Text>
                        <View style={styles.previewCoverFrame}>
                            {item.song.cover_url ? (
                                <Image source={{ uri: item.song.cover_url }} style={styles.previewCover} />
                            ) : null}
                        </View>
                        <View style={styles.previewSongText}>
                            <Text style={styles.previewTitle} numberOfLines={1}>{item.song.title}</Text>
                            <Text style={styles.previewArtist} numberOfLines={1}>
                                {item.song.artist} · {item.song.album}
                            </Text>
                        </View>
                        <DiamondScore score={item.score} total={5} size={7} color={bucketColor(item.bucket)} />
                        <ScoreArc
                            score={item.score}
                            max={10}
                            size={42}
                            strokeWidth={4}
                            color={bucketColor(item.bucket)}
                            trackColor={colors.sand}
                        >
                            <Text style={[styles.previewScore, { color: bucketColor(item.bucket) }]}>
                                {item.score.toFixed(1)}
                            </Text>
                        </ScoreArc>
                    </TouchableOpacity>
                )}
                maintainVisibleContentPosition={{ disabled: true }}
                contentContainerStyle={styles.listContent}
            />
        </View>
    )
}

function bucketLabel(bucket: BucketName): string {
    if (bucket === "alright") {
        return "Okay"
    }
    return bucket.charAt(0).toUpperCase() + bucket.slice(1)
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.bg,
    },
    centerState: {
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 24,
    },
    inlineError: {
        color: colors.dislike,
        fontSize: 14,
        paddingHorizontal: 18,
        paddingTop: 8,
    },
    header: {
        paddingTop: 84,
        paddingHorizontal: 18,
        paddingBottom: 8,
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        backgroundColor: colors.bg,
    },
    headerLeft: {
        flex: 1,
    },
    kicker: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 10,
        letterSpacing: 1.8,
        marginBottom: 4,
    },
    heading: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 34,
        lineHeight: 36,
    },
    reorderButton: {
        marginTop: 8,
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderColor: colors.ink,
        borderRadius: 8,
    },
    reorderButtonText: {
        color: colors.ink,
        fontSize: 13,
        fontFamily: fonts.mono,
    },
    // Orbit constellation
    orbitWrapper: {
        width: DIAL_SIZE,
        height: DIAL_SIZE + 60,
        alignSelf: "center",
        position: "relative",
    },
    orbitSatellite: {
        position: "absolute",
        alignItems: "center",
    },
    orbitCoverImage: {
        width: "100%",
        height: "100%",
    },
    orbitPosition: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 9,
        lineHeight: 13,
        marginTop: 4,
    },
    orbitScore: {
        fontFamily: fonts.serif,
        fontSize: 13,
        lineHeight: 15,
    },
    orbitTitle: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 7,
        lineHeight: 10,
        marginTop: 1,
        textAlign: "center",
        maxWidth: 64,
    },
    orbitCenter: {
        position: "absolute",
    },
    centerContent: {
        alignItems: "center",
    },
    centerCount: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 32,
        lineHeight: 34,
    },
    centerLabel: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 8,
        letterSpacing: 2,
        marginTop: 2,
    },
    // List separator
    separator: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "baseline",
        paddingHorizontal: 22,
        paddingVertical: 8,
        borderTopWidth: 1,
        borderTopColor: colors.line,
    },
    separatorRange: {
        fontFamily: fonts.mono,
        fontSize: 10,
        color: colors.inkSoft,
        letterSpacing: 1.8,
    },
    separatorRight: {
        fontFamily: fonts.mono,
        fontSize: 10,
        color: colors.inkSoft,
    },
    anchorsSection: {
        paddingHorizontal: 18,
        paddingBottom: 14,
        borderTopWidth: 1,
        borderTopColor: colors.line,
    },
    anchorsTitle: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 24,
        lineHeight: 28,
        marginTop: 14,
    },
    anchorsCopy: {
        color: colors.inkSoft,
        fontSize: 12,
        lineHeight: 17,
        marginTop: 2,
        marginBottom: 10,
    },
    anchorGrid: {
        flexDirection: "row",
        gap: 8,
    },
    anchorGridItem: {
        flex: 1,
        minWidth: 0,
    },
    anchorCard: {
        height: 178,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.paper,
        paddingHorizontal: 9,
        paddingVertical: 12,
        borderRadius: 8,
    },
    anchorLabel: {
        fontFamily: fonts.mono,
        color: colors.clay,
        fontSize: 8,
        letterSpacing: 0.8,
        marginBottom: 8,
    },
    anchorContent: {
        alignItems: "center",
    },
    anchorCover: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: colors.sand,
        overflow: "hidden",
        marginBottom: 9,
    },
    anchorCoverImage: {
        width: "100%",
        height: "100%",
    },
    anchorText: {
        width: "100%",
    },
    anchorTitle: {
        color: colors.ink,
        fontSize: 12,
        fontWeight: "600",
        textAlign: "center",
    },
    anchorArtist: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 9,
        textAlign: "center",
        marginTop: 2,
    },
    anchorMetaRow: {
        alignItems: "center",
        marginTop: 10,
    },
    anchorScore: {
        fontFamily: fonts.serif,
        fontSize: 20,
        lineHeight: 23,
    },
    anchorBucket: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 8,
        letterSpacing: 0.6,
        marginTop: 1,
        textAlign: "center",
    },
    anchorEmpty: {
        color: colors.inkSoft,
        fontSize: 12,
        lineHeight: 16,
        marginTop: 8,
    },
    versusHistoryCard: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginHorizontal: 18,
        marginBottom: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 10,
        backgroundColor: colors.paper,
    },
    versusHistoryTitle: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 18,
        lineHeight: 22,
    },
    versusHistoryCopy: {
        color: colors.inkSoft,
        fontSize: 11,
        marginTop: 3,
    },
    versusHistoryArrow: {
        color: colors.clay,
        fontSize: 20,
        marginLeft: 12,
    },
    listContent: {
        paddingBottom: 24,
    },
    previewRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 18,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
        gap: 10,
    },
    previewPosition: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 11,
        width: 28,
        textAlign: "right",
    },
    previewCoverFrame: {
        width: 40,
        height: 40,
        borderRadius: 4,
        backgroundColor: colors.sand,
        overflow: "hidden",
    },
    previewCover: {
        width: "100%",
        height: "100%",
    },
    previewSongText: {
        flex: 1,
        minWidth: 0,
    },
    previewTitle: {
        color: colors.ink,
        fontSize: 14,
        fontWeight: "600",
    },
    previewArtist: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 10,
        marginTop: 2,
    },
    previewScore: {
        fontFamily: fonts.serif,
        fontSize: 13,
    },
    // Empty/error states
    emptyText: {
        color: colors.ink,
        fontSize: 18,
        marginBottom: 24,
    },
    button: {
        paddingVertical: 12,
        paddingHorizontal: 32,
        borderWidth: 1,
        borderColor: colors.ink,
        borderRadius: 8,
    },
    buttonText: {
        color: colors.ink,
        fontSize: 16,
    },
    emptyHistoryButton: {
        paddingVertical: 12,
        paddingHorizontal: 20,
        marginTop: 8,
    },
    emptyHistoryText: {
        color: colors.clay,
        fontFamily: fonts.mono,
        fontSize: 13,
    },
    errorText: {
        color: colors.dislike,
        fontSize: 15,
        marginBottom: 24,
        textAlign: "center",
    },
})
