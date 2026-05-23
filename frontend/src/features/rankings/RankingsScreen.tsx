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
import { AppStackParamList, TabParamList } from "../../navigation/types"
import { colors, fonts, bucketColor } from "../../theme"
import { useAuth } from "../auth/AuthContext"
import { RankingResponse } from "../comparison/types"
import { listMyRankings } from "./apiRequests"

type RankingsNavigation = CompositeNavigationProp<
    BottomTabNavigationProp<TabParamList, "Rankings">,
    NativeStackNavigationProp<AppStackParamList>
>

// Top ORBIT_COUNT songs fill the orbital constellation; the rest go in the scrolling list.
const ORBIT_COUNT = 6
const DIAL_SIZE = 292
const DIAL_RADIUS = DIAL_SIZE / 2 - 32          // 114 — orbit path radius
const DIAL_START_DEG = -54                       // first satellite angle (upper-right)
const DIAL_SWEEP_DEG = 288                       // total arc covered by all satellites
const ORBIT_COVER_BASE = 60                      // #1 cover diameter
const ORBIT_COVER_STEP = 5                       // shrink per rank step
const CENTER_RING_SIZE = 108                     // center count circle

export default function RankingsScreen() {
    const navigation = useNavigation<RankingsNavigation>()
    const { token } = useAuth()
    const [rankings, setRankings] = useState<RankingResponse[]>([])
    const [nextCursor, setNextCursor] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const loadRankings = useCallback(async (
        cursor: string | null,
        shouldReplace: boolean,
    ) => {
        if (!token) {
            return
        }

        if (shouldReplace) {
            setIsLoading(true)
        } else {
            setIsLoadingMore(true)
        }
        setError(null)

        try {
            const response = await listMyRankings(token, cursor ?? undefined)
            if (shouldReplace) {
                setRankings(response.rankings)
            } else {
                setRankings((currentRankings) => [...currentRankings, ...response.rankings])
            }
            setNextCursor(response.next_cursor)
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
            setIsLoadingMore(false)
        }
    }, [token])

    const handleLoadMore = () => {
        if (!nextCursor || isLoading || isLoadingMore) {
            return
        }

        loadRankings(nextCursor, false)
    }

    function handleRateFirstSong() {
        navigation.navigate("Discover", { focusSearch: true })
    }

    const handleRankingPress = (ranking: RankingResponse) => {
        navigation.navigate("SongDetail", { ranking })
    }

    const handleReorderPress = () => {
        navigation.navigate("Reorder")
    }

    const renderFooter = () => {
        if (!isLoadingMore) {
            return null
        }

        return <ActivityIndicator color={colors.clay} style={styles.footerSpinner} />
    }

    // Renders the orbit constellation + list separator as the FlashList header.
    const renderListHeader = () => {
        const orbitItems = rankings.slice(0, Math.min(ORBIT_COUNT, rankings.length))
        const n = orbitItems.length
        const listItems = rankings.slice(ORBIT_COUNT)

        return (
            <View>
                {/* Screen heading */}
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        <Text style={styles.kicker}>{rankings.length} SONGS · YOUR LIST</Text>
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
                                testID={`ranking-row-${item.id}`}
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

                {/* List separator — only shown when there are songs below the orbit */}
                {listItems.length > 0 && (
                    <View style={styles.separator}>
                        <Text style={styles.separatorRange}>
                            {ORBIT_COUNT + 1} — {rankings.length}
                        </Text>
                        <Text style={styles.separatorRight}>full list →</Text>
                    </View>
                )}
            </View>
        )
    }

    const renderRanking = ({ item }: { item: RankingResponse }) => {
        const accent = bucketColor(item.bucket)

        return (
            <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.song.title} details`}
                testID={`ranking-row-${item.id}`}
                style={styles.rankingRow}
                onPress={() => handleRankingPress(item)}
                activeOpacity={0.8}
            >
                <Text style={styles.position}>{item.position}</Text>
                <View style={styles.coverFrame}>
                    {item.song.cover_url ? (
                        <Image source={{ uri: item.song.cover_url }} style={styles.coverImage} />
                    ) : null}
                </View>
                <View style={styles.songInfo}>
                    <Text style={styles.title} numberOfLines={1}>{item.song.title}</Text>
                    <Text style={styles.artist} numberOfLines={1}>{item.song.artist}</Text>
                </View>
                <View style={styles.scoreArea}>
                    <DiamondScore score={item.score} total={5} size={7} color={accent} />
                    <ScoreArc
                        score={item.score}
                        max={10}
                        size={44}
                        strokeWidth={4}
                        color={accent}
                        trackColor={colors.sand}
                    >
                        <Text style={[styles.wheelScore, { color: accent }]}>
                            {item.score.toFixed(1)}
                        </Text>
                    </ScoreArc>
                </View>
            </TouchableOpacity>
        )
    }

    useFocusEffect(
        useCallback(() => {
            loadRankings(null, true)
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
                <TouchableOpacity style={styles.button} onPress={() => loadRankings(null, true)}>
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
            </View>
        )
    }

    return (
        <View style={styles.container}>
            {error !== null && <Text style={styles.inlineError}>{error}</Text>}
            <FlashList
                data={rankings.slice(ORBIT_COUNT)}
                renderItem={renderRanking}
                keyExtractor={(item) => item.id.toString()}
                onEndReached={handleLoadMore}
                onEndReachedThreshold={0.6}
                ListHeaderComponent={renderListHeader()}
                ListFooterComponent={renderFooter}
                maintainVisibleContentPosition={{ disabled: true }}
                contentContainerStyle={styles.listContent}
            />
        </View>
    )
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
        paddingTop: 60,
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
    // List rows
    listContent: {
        paddingBottom: 24,
    },
    rankingRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        paddingHorizontal: 18,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
        backgroundColor: colors.paper,
    },
    position: {
        color: colors.inkDim,
        fontSize: 11,
        fontFamily: fonts.mono,
        minWidth: 28,
        letterSpacing: 0.4,
    },
    coverFrame: {
        width: 40,
        height: 40,
        borderRadius: 20,
        marginRight: 10,
        backgroundColor: colors.sand,
        overflow: "hidden",
    },
    coverImage: {
        width: "100%",
        height: "100%",
    },
    songInfo: {
        flex: 1,
        minWidth: 0,
    },
    title: {
        color: colors.ink,
        fontSize: 14,
        fontWeight: "600",
        marginBottom: 3,
    },
    artist: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 11,
    },
    scoreArea: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginLeft: 8,
        flexShrink: 0,
    },
    wheelScore: {
        fontFamily: fonts.serif,
        fontSize: 14,
        lineHeight: 16,
    },
    footerSpinner: {
        marginVertical: 18,
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
    errorText: {
        color: colors.dislike,
        fontSize: 15,
        marginBottom: 24,
        textAlign: "center",
    },
})
