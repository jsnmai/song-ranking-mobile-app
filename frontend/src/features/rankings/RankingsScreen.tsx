// Rankings tab — shows the user's ranked songs sorted by score.
import { useCallback, useState } from "react"
import {
    ActivityIndicator,
    Dimensions,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native"
import { FlashList } from "@shopify/flash-list"
import { CompositeNavigationProp, useFocusEffect, useNavigation } from "@react-navigation/native"
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"
import Svg, { Circle, Ellipse, Path } from "react-native-svg"

import { ApiError } from "../../api/client"
import { AppStackParamList, RankingsStackParamList, TabParamList } from "../../navigation/types"
import { colors, fonts, bucketColor } from "../../theme"
import { useAuth } from "../auth/AuthContext"
import { BucketName, RankingAnchorsResponse, RankingResponse } from "../comparison/types"
import { getMyRankingAnchors, listMyRankings, listMyVersusHistory } from "./apiRequests"
import { ComparisonHistoryReceipt } from "./types"

type RankingsNavigation = CompositeNavigationProp<
    NativeStackNavigationProp<RankingsStackParamList, "RankingsOverview">,
    CompositeNavigationProp<
        BottomTabNavigationProp<TabParamList, "Rankings">,
        NativeStackNavigationProp<AppStackParamList>
    >
>

const PREVIEW_COUNT = 3
const EMPTY_ANCHORS: RankingAnchorsResponse = {
    top_like: null,
    median_okay: null,
    lowest_dislike: null,
}
const ANCHOR_DEFS: readonly {
    key: keyof RankingAnchorsResponse;
    label: string;
    bucketKey: BucketName;
    requiredCount: number;
}[] = [
    { key: "top_like", label: "TOP · LIKE", bucketKey: "like", requiredCount: 1 },
    { key: "median_okay", label: "MEDIAN · OKAY", bucketKey: "alright", requiredCount: 3 },
    { key: "lowest_dislike", label: "FLOOR · DISLIKE", bucketKey: "dislike", requiredCount: 1 },
]

// Pseudo-random star generator for the dark navy orbit surface.
function makeStars(count: number) {
    const stars: Array<{ x: number; y: number; r: number; o: number }> = []
    let s = 20250601
    for (let i = 0; i < count; i++) {
        s = ((s * 1664525 + 1013904223) >>> 0)
        const x = (s & 0x7fffffff) / 0x7fffffff * 100
        s = ((s * 1664525 + 1013904223) >>> 0)
        const y = (s & 0x7fffffff) / 0x7fffffff * 100
        s = ((s * 1664525 + 1013904223) >>> 0)
        const small = (s & 0x7fffffff) / 0x7fffffff < 0.82
        s = ((s * 1664525 + 1013904223) >>> 0)
        const o = 0.14 + (s & 0x7fffffff) / 0x7fffffff * 0.5
        stars.push({ x, y, r: small ? 0.35 : 0.7, o })
    }
    return stars
}
const STARS = makeStars(40)

export default function RankingsScreen() {
    const navigation = useNavigation<RankingsNavigation>()
    const { token, profile } = useAuth()
    const avatarInitial = (profile?.display_name || profile?.username || "?").charAt(0).toUpperCase()
    const [rankings, setRankings] = useState<RankingResponse[]>([])
    const [anchors, setAnchors] = useState<RankingAnchorsResponse>(EMPTY_ANCHORS)
    const [versusReceipts, setVersusReceipts] = useState<ComparisonHistoryReceipt[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const loadRankings = useCallback(async () => {
        if (!token) return
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
            const [anchorResponse, versusResponse] = await Promise.all([
                getMyRankingAnchors(token),
                listMyVersusHistory(token),
            ])
            setRankings(allRankings)
            setAnchors(anchorResponse)
            setVersusReceipts(versusResponse.receipts)
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

    const handleRankingPress = (ranking: RankingResponse) => {
        navigation.navigate("SongDetail", { ranking })
    }
    const handleReorderPress = () => navigation.navigate("Reorder")
    const handleVersusHistoryPress = () => navigation.navigate("VersusHistory")
    const handleFullRankingsPress = () => navigation.navigate("FullRankings")
    const handleRateFirstSong = () => navigation.navigate("Discover", { focusSearch: true })

    const renderRankMap = () => {
        const screenW = Dimensions.get("window").width
        const mapW = screenW - 28
        const mapH = 148
        const cx = mapW / 2
        const cy = mapH / 2
        const innerRx = mapW * 0.25
        const innerRy = mapH * 0.34
        const outerRx = mapW * 0.44
        const outerRy = mapH * 0.46

        const topRanking = rankings[0]
        const topScore = topRanking ? topRanking.score.toFixed(1) : null

        // Orbital positions: 2 on inner, up to 3 on outer
        const innerAngles = [-Math.PI / 2, Math.PI * 0.6]
        const outerAngles = [Math.PI * 0.1, Math.PI * 0.95, Math.PI * 1.55]

        const orbitItems = [
            ...rankings.slice(1, 3).map((r, i) => ({
                ranking: r,
                angle: innerAngles[i],
                rx: innerRx, ry: innerRy,
                size: 26,
            })),
            ...rankings.slice(3, 6).map((r, i) => ({
                ranking: r,
                angle: outerAngles[i],
                rx: outerRx, ry: outerRy,
                size: 20,
            })),
        ]

        return (
            <View style={[styles.rankMap, { width: mapW, height: mapH }]}>
                {/* SVG layer: stars + ellipses */}
                <Svg
                    width={mapW}
                    height={mapH}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                >
                    {STARS.map((st, i) => (
                        <Circle
                            key={i}
                            cx={`${st.x}%`}
                            cy={`${st.y}%`}
                            r={st.r}
                            fill={colors.cream}
                            opacity={st.o}
                        />
                    ))}
                    <Ellipse
                        cx={cx} cy={cy}
                        rx={innerRx} ry={innerRy}
                        fill="none"
                        stroke={colors.gold}
                        strokeOpacity={0.28}
                        strokeDasharray="2 3"
                    />
                    <Ellipse
                        cx={cx} cy={cy}
                        rx={outerRx} ry={outerRy}
                        fill="none"
                        stroke={colors.cream}
                        strokeOpacity={0.12}
                        strokeDasharray="2 3"
                    />
                </Svg>

                {/* "Rank map" label */}
                <View style={styles.rankMapPill}>
                    <Text style={styles.rankMapPillText}>Rank map</Text>
                </View>

                {/* Orbital covers */}
                {orbitItems.map(({ ranking, angle, rx, ry, size }) => (
                    <TouchableOpacity
                        key={ranking.id}
                        accessibilityRole="button"
                        accessibilityLabel={ranking.song.title}
                        onPress={() => handleRankingPress(ranking)}
                        style={[
                            styles.orbCover,
                            {
                                width: size,
                                height: size,
                                borderRadius: size / 2,
                                left: cx + Math.cos(angle) * rx,
                                top: cy + Math.sin(angle) * ry,
                                transform: [
                                    { translateX: -size / 2 },
                                    { translateY: -size / 2 },
                                ],
                            },
                        ]}
                    >
                        {ranking.song.cover_url ? (
                            <Image
                                source={{ uri: ranking.song.cover_url }}
                                style={styles.orbCoverImg}
                            />
                        ) : null}
                    </TouchableOpacity>
                ))}

                {/* Center: #1 song score */}
                {topRanking ? (
                    <TouchableOpacity
                        onPress={() => handleRankingPress(topRanking)}
                        testID={`ranking-orbit-${topRanking.id}`}
                        style={[
                            styles.rankMapCenter,
                            {
                                left: cx - 19,
                                top: cy - 19,
                                shadowColor: colors.accent,
                            },
                        ]}
                    >
                        <Text style={styles.rankMapScore}>{topScore}</Text>
                    </TouchableOpacity>
                ) : (
                    <View style={[styles.rankMapCenter, { left: cx - 19, top: cy - 19 }]}>
                        <Text style={styles.rankMapScore}>—</Text>
                    </View>
                )}
            </View>
        )
    }

    const renderAnchor = (
        label: string,
        anchor: RankingResponse | null,
        bucketKey: BucketName,
        currentCount: number,
        requiredCount: number,
    ) => {
        const accentColor = bucketColor(bucketKey)
        return (
            <View style={styles.anchorCard}>
                <View style={[styles.anchorTopBar, { backgroundColor: accentColor, opacity: anchor === null ? 0.5 : 1 }]} />
                <View style={styles.anchorBody}>
                    <Text style={[styles.anchorLabel, { color: accentColor }]} numberOfLines={1}>
                        {label}
                    </Text>
                    {anchor === null ? (
                        <>
                            <View style={[styles.anchorEmptyBox, { backgroundColor: `${accentColor}14` }]}>
                                <Text style={[styles.anchorEmptyDash, { color: `${accentColor}99` }]}>—</Text>
                            </View>
                            <Text style={[styles.anchorEmptyFraction, { color: accentColor }]}>
                                {Math.min(currentCount, requiredCount)}/{requiredCount}
                            </Text>
                        </>
                    ) : (
                        <>
                            <View style={styles.anchorCover}>
                                {anchor.song.cover_url ? (
                                    <Image
                                        source={{ uri: anchor.song.cover_url }}
                                        style={styles.anchorCoverImg}
                                    />
                                ) : null}
                            </View>
                            <Text style={styles.anchorTitle} numberOfLines={1}>
                                {anchor.song.title}
                            </Text>
                            <View style={styles.anchorFooter}>
                                <Text style={[styles.anchorScore, { color: accentColor }]}>
                                    {anchor.score.toFixed(1)}
                                </Text>
                                <View style={[styles.anchorCountPill, { backgroundColor: `${accentColor}20` }]}>
                                    <Text style={[styles.anchorCount, { color: accentColor }]}>
                                        #{anchor.position}
                                    </Text>
                                </View>
                            </View>
                        </>
                    )}
                </View>
            </View>
        )
    }

    const renderAnchorsSection = (
        allRankings: RankingResponse[],
        anchorData: RankingAnchorsResponse,
    ) => {
        const likesCount = allRankings.filter((r) => r.bucket === "like").length
        const okayCount = allRankings.filter((r) => r.bucket === "alright").length
        const dislikesCount = allRankings.filter((r) => r.bucket === "dislike").length
        const unlocked = likesCount >= 1 && okayCount >= 3 && dislikesCount >= 1

        const displayData = unlocked ? anchorData : EMPTY_ANCHORS
        const countByBucket: Record<BucketName, number> = {
            like: likesCount,
            alright: okayCount,
            dislike: dislikesCount,
        }

        return (
            <>
                <View style={styles.anchorGrid} testID={unlocked ? "anchors-unlocked" : "anchors-locked"}>
                    {ANCHOR_DEFS.map((def) => (
                        <View key={def.key} style={styles.anchorGridItem}>
                            {renderAnchor(
                                def.label,
                                displayData[def.key],
                                def.bucketKey,
                                countByBucket[def.bucketKey],
                                def.requiredCount,
                            )}
                        </View>
                    ))}
                </View>
            </>
        )
    }

    const renderBuildCard = () => {
        const rated = rankings.length
        const toUnlock = 10 - rated
        return (
            <View style={styles.buildCard}>
                <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
                    {STARS.map((st, i) => (
                        <Circle key={i} cx={`${st.x}%`} cy={`${st.y}%`} r={st.r}
                            fill={colors.cream} opacity={st.o} />
                    ))}
                </Svg>
                <View style={styles.buildRow}>
                    <TouchableOpacity onPress={handleRateFirstSong} style={styles.buildOrbitWrap}>
                        <Svg width={70} height={70} viewBox="0 0 70 70">
                            <Circle cx="35" cy="35" r="30" fill="none"
                                stroke={colors.gold} strokeOpacity={0.55}
                                strokeWidth={1.5} strokeDasharray="3 4" />
                            <Circle cx="35" cy="35" r="16"
                                fill="rgba(245,184,64,0.18)" />
                            <Path d="M35 28 L35 42 M28 35 L42 35"
                                stroke={colors.gold} strokeWidth={2.2}
                                strokeLinecap="round" />
                        </Svg>
                    </TouchableOpacity>
                    <View style={styles.buildText}>
                        <Text style={styles.buildTitle}>{"Build your rank map."}</Text>
                        <Text style={styles.buildBody}>
                            Rate 10 songs to place every track by taste.
                        </Text>
                    </View>
                </View>
                <View style={styles.buildMeter}>
                    {Array.from({ length: 10 }).map((_, i) => (
                        <View key={i} style={[
                            styles.buildMeterBar,
                            i < rated && styles.buildMeterBarFilled,
                        ]} />
                    ))}
                </View>
                <View style={styles.buildFooter}>
                    <Text style={styles.buildStats}>
                        {rated} / 10 RATED · {toUnlock} TO UNLOCK
                    </Text>
                    <TouchableOpacity style={styles.buildBtn} onPress={handleRateFirstSong}>
                        <Text style={styles.buildBtnText}>+ Rate a song</Text>
                    </TouchableOpacity>
                </View>
            </View>
        )
    }

    const renderListHeader = () => {
        const scoresLocked = rankings.length < 5
        const anchorsUnlocked =
            rankings.filter((r) => r.bucket === "like").length >= 1 &&
            rankings.filter((r) => r.bucket === "alright").length >= 3 &&
            rankings.filter((r) => r.bucket === "dislike").length >= 1
        return (<View>
            {/* BO-style header */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <Text style={styles.kicker}>{rankings.length} SONGS · YOUR MUSIC</Text>
                    <Text style={styles.heading}>Rankings</Text>
                </View>
                <View style={styles.headerActions}>
                    <TouchableOpacity
                        style={styles.avatarCircle}
                        onPress={() => navigation.navigate("Profile")}
                        accessibilityLabel="Your profile"
                    >
                        <Text style={styles.avatarLetter}>{avatarInitial}</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Rank map unlocks at 10 songs; build card shown until then */}
            {rankings.length >= 10 ? (
                <View style={styles.rankMapWrap}>
                    {renderRankMap()}
                </View>
            ) : (
                renderBuildCard()
            )}

            {/* Rankings · ALL section */}
            <View style={styles.sectionRow}>
                <Text style={styles.sectionLabel}>RANKINGS · ALL</Text>
                <TouchableOpacity
                    onPress={handleFullRankingsPress}
                    accessibilityLabel="View All / Filter Rankings"
                >
                    <Text style={styles.sectionRight}>VIEW ALL →</Text>
                </TouchableOpacity>
            </View>

            {/* Preview rows paper card */}
            <View style={styles.paperCard}>
                {rankings.slice(0, PREVIEW_COUNT).map((item, i) => {
                    const accent = bucketColor(item.bucket)
                    return (
                        <TouchableOpacity
                            key={item.id}
                            accessibilityRole="button"
                            accessibilityLabel={`Open ${item.song.title} details`}
                            testID={`ranking-preview-row-${item.id}`}
                            style={[styles.rankRow, i > 0 && styles.rankRowBorder]}
                            onPress={() => handleRankingPress(item)}
                            activeOpacity={0.8}
                        >
                            <Text style={[styles.rankNum, scoresLocked && { color: colors.inkDim }]}>
                                {scoresLocked ? "?" : item.position}
                            </Text>
                            <View style={styles.rowCover}>
                                {item.song.cover_url ? (
                                    <Image source={{ uri: item.song.cover_url }} style={styles.rowCoverImg} />
                                ) : null}
                            </View>
                            <View style={styles.rowText}>
                                <Text style={styles.rowTitle} numberOfLines={1}>
                                    {item.song.title}
                                </Text>
                                <Text style={styles.rowArtist} numberOfLines={1}>
                                    {item.song.artist.toUpperCase()}
                                </Text>
                            </View>
                            {scoresLocked ? (
                                <View style={styles.rowLockIcon}>
                                    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"
                                        stroke={colors.inkDim} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                        <Path d="M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z" />
                                        <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                    </Svg>
                                </View>
                            ) : (
                                <Text style={[styles.rowScore, { color: accent }]}>
                                    {item.score.toFixed(1)}
                                </Text>
                            )}
                        </TouchableOpacity>
                    )
                })}
            </View>

            {/* Anchors */}
            <View style={styles.sectionRow}>
                <Text style={styles.anchorsTitle}>Anchors</Text>
                <Text style={styles.sectionLabelRight}>
                    {anchorsUnlocked ? "YOUR CALIBRATION" : "RATE MORE TO REVEAL"}
                </Text>
            </View>
            {renderAnchorsSection(rankings, anchors)}

            {/* Versus History */}
            <View style={styles.sectionRow}>
                <Text style={styles.sectionLabel}>RECENT HEAD-TO-HEAD</Text>
                <TouchableOpacity onPress={handleVersusHistoryPress}>
                    <Text style={styles.sectionRight}>LOG ↗</Text>
                </TouchableOpacity>
            </View>
            {versusReceipts.length === 0 ? (
                <View style={[styles.paperCard, styles.versusEmptyCard]}>
                    <View style={styles.versusGhostRow}>
                        <View style={styles.versusGhostCover} />
                        <Text style={styles.versusVS}>VS</Text>
                        <View style={styles.versusGhostCover} />
                    </View>
                    <Text style={styles.versusEmptyTitle}>No match-ups yet</Text>
                    <Text style={styles.versusEmptyBody}>
                        As you rate, LISTn pits each song against others to place it — those head-to-heads land here.
                    </Text>
                </View>
            ) : (
                <TouchableOpacity
                    style={styles.paperCard}
                    onPress={handleVersusHistoryPress}
                    activeOpacity={0.8}
                    accessibilityLabel="Open Versus History"
                >
                    {versusReceipts.slice(0, 3).map((r, i) => (
                        <View key={r.id} style={[styles.versusReceiptRow, i > 0 && styles.versusReceiptBorder]}>
                            {/* Cover pair */}
                            <View style={styles.versusCovers}>
                                <View style={styles.versusWinnerCover}>
                                    {r.winner_cover_url ? (
                                        <Image
                                            source={{ uri: r.winner_cover_url }}
                                            style={styles.versusCoverImg}
                                        />
                                    ) : (
                                        <View style={[styles.versusCoverImg, { backgroundColor: colors.paper2 }]} />
                                    )}
                                </View>
                                <Text style={styles.versusReceiptVS}>VS</Text>
                                <View style={styles.versusLoserCover}>
                                    {r.loser_cover_url ? (
                                        <Image
                                            source={{ uri: r.loser_cover_url }}
                                            style={styles.versusCoverImg}
                                        />
                                    ) : (
                                        <View style={[styles.versusCoverImg, { backgroundColor: colors.paper2 }]} />
                                    )}
                                </View>
                            </View>
                            {/* Winner info */}
                            <View style={styles.versusWinnerInfo}>
                                <Text style={styles.versusReceiptWinner} numberOfLines={1}>{r.winner_title}</Text>
                                <Text style={styles.versusReceiptOver} numberOfLines={1}>over {r.loser_title}</Text>
                            </View>
                        </View>
                    ))}
                </TouchableOpacity>
            )}
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
                <ActivityIndicator color={colors.accent} />
            </View>
        )
    }

    if (error !== null && rankings.length === 0) {
        return (
            <View style={styles.centerState}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={styles.btn} onPress={loadRankings}>
                    <Text style={styles.btnText}>Try again</Text>
                </TouchableOpacity>
            </View>
        )
    }

    if (rankings.length === 0) {
        return (
            <ScrollView style={styles.container} contentContainerStyle={styles.emptyContent}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        <Text style={styles.kicker}>YOUR MUSIC · CALIBRATED</Text>
                        <Text style={styles.heading}>Rankings</Text>
                    </View>
                    <View style={styles.headerActions}>
                        <TouchableOpacity
                            style={styles.iconBtn}
                            onPress={() => navigation.navigate("Discover", { focusSearch: true })}
                        >
                            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none"
                                stroke={colors.ink} strokeWidth={2} strokeLinecap="round">
                                <Circle cx={11} cy={11} r={7} />
                                <Path d="m20 20-3.4-3.4" />
                            </Svg>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.avatarCircle}
                            onPress={() => navigation.navigate("Profile")}
                            accessibilityLabel="Your profile"
                        >
                            <Text style={styles.avatarLetter}>{avatarInitial}</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* "Build your rank map" card */}
                {renderBuildCard()}

                {/* YOUR RANKING section */}
                <View style={styles.sectionRow}>
                    <Text style={styles.sectionLabel}>YOUR RANKING</Text>
                </View>
                <View style={styles.emptyRankingsCard}>
                    <View style={styles.emptyRankingsIconWrap}>
                        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                            <Path d="M3 6h10M3 12h14M3 18h7"
                                stroke={colors.inkSoft} strokeWidth={2.2}
                                strokeLinecap="round" />
                        </Svg>
                    </View>
                    <Text style={styles.emptyRankingsTitle}>No songs rated yet</Text>
                    <Text style={styles.emptyRankingsBody}>
                        Your ranked tracks will appear here, ordered by taste, as you rate.
                    </Text>
                </View>

                {/* Anchors section */}
                <View style={styles.anchorSectionRow}>
                    <Text style={styles.anchorSectionTitle}>Anchors</Text>
                    <Text style={styles.anchorSectionRight}>RATE MORE TO REVEAL</Text>
                </View>
                {renderAnchorsSection([], EMPTY_ANCHORS)}

                {/* Versus History empty */}
                <View style={styles.sectionRow}>
                    <Text style={styles.sectionLabel}>RECENT HEAD-TO-HEAD</Text>
                </View>
                <View style={[styles.paperCard, styles.versusEmptyCard]}>
                    <View style={styles.versusGhostRow}>
                        <View style={styles.versusGhostCover} />
                        <Text style={styles.versusVS}>VS</Text>
                        <View style={styles.versusGhostCover} />
                    </View>
                    <Text style={styles.versusEmptyTitle}>No match-ups yet</Text>
                    <Text style={styles.versusEmptyBody}>
                        As you rate, LISTn pits each song against others to place it — those head-to-heads land here.
                    </Text>
                </View>
                <View style={styles.bottomSpacer} />
            </ScrollView>
        )
    }

    return (
        <View style={styles.container}>
            {error !== null && <Text style={styles.inlineError}>{error}</Text>}
            <FlashList
                data={[]}
                renderItem={() => null}
                keyExtractor={() => ""}
                ListHeaderComponent={renderListHeader()}
                contentContainerStyle={styles.listContent}
                maintainVisibleContentPosition={{ disabled: true }}
            />
        </View>
    )
}

function bucketLabel(bucket: BucketName): string {
    if (bucket === "alright") return "Okay"
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
        color: colors.danger,
        fontSize: 13,
        paddingHorizontal: 18,
        paddingTop: 8,
    },
    // ── Header ─────────────────────────────────────────────────────────
    header: {
        paddingTop: 60,
        paddingHorizontal: 16,
        paddingBottom: 12,
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
    },
    headerLeft: {},
    kicker: {
        fontFamily: fonts.mono,
        color: colors.inkDim,
        fontSize: 8.5,
        letterSpacing: 2,
        fontWeight: "700",
        marginBottom: 3,
    },
    heading: {
        fontFamily: fonts.display,
        fontSize: 30,
        letterSpacing: -0.6,
        lineHeight: 29,
        color: colors.ink,
    },
    headerActions: {
        flexDirection: "row",
        gap: 8,
        marginTop: 4,
        alignItems: "center",
    },
    avatarCircle: {
        width: 32,
        height: 32,
        borderRadius: 9,
        backgroundColor: colors.ink,
        alignItems: "center",
        justifyContent: "center",
    },
    avatarLetter: {
        color: "#fff",
        fontWeight: "700",
        fontSize: 17,
    },
    iconBtn: {
        width: 32,
        height: 32,
        borderRadius: 9,
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        alignItems: "center",
        justifyContent: "center",
    },
    iconBtnText: {
        fontSize: 16,
        color: colors.ink,
    },
    // ── Rank map (dark navy cosmic surface) ───────────────────────────
    rankMapWrap: {
        alignItems: "center",
        marginHorizontal: 14,
        marginBottom: 4,
    },
    rankMap: {
        borderRadius: 16,
        backgroundColor: colors.navy,
        overflow: "hidden",
        position: "relative",
    },
    rankMapPill: {
        position: "absolute",
        top: 9,
        left: 11,
        backgroundColor: "rgba(245,184,64,0.18)",
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 3,
    },
    rankMapPillText: {
        fontFamily: fonts.mono,
        fontSize: 8.5,
        color: colors.gold,
        fontWeight: "700",
        letterSpacing: 1.2,
    },
    orbCover: {
        position: "absolute",
        overflow: "hidden",
        shadowColor: colors.gold,
        shadowOpacity: 0.4,
        shadowRadius: 9,
        shadowOffset: { width: 0, height: 0 },
    },
    orbCoverImg: {
        width: "100%",
        height: "100%",
    },
    rankMapCenter: {
        position: "absolute",
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: colors.accent,
        alignItems: "center",
        justifyContent: "center",
        shadowOpacity: 0.55,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 0 },
    },
    rankMapScore: {
        fontFamily: fonts.display,
        fontSize: 14,
        color: "#fff",
        letterSpacing: -0.3,
    },
    // ── Section label ──────────────────────────────────────────────────
    sectionRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "baseline",
        paddingHorizontal: 16,
        marginTop: 13,
        marginBottom: 7,
    },
    sectionLabel: {
        fontFamily: fonts.mono,
        fontSize: 9,
        letterSpacing: 1.6,
        color: colors.inkDim,
        fontWeight: "700",
    },
    sectionLabelRight: {
        fontFamily: fonts.mono,
        fontSize: 8.5,
        color: colors.inkDim,
        letterSpacing: 1.2,
    },
    anchorsTitle: {
        fontFamily: fonts.display,
        fontSize: 17,
        letterSpacing: -0.2,
        color: colors.ink,
        lineHeight: 17,
    },
    sectionRight: {
        fontFamily: fonts.mono,
        fontSize: 9,
        color: colors.accent,
        fontWeight: "700",
        letterSpacing: 0.5,
    },
    // ── Paper card (rankings rows + versus history) ────────────────────
    paperCard: {
        marginHorizontal: 14,
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 16,
        overflow: "hidden",
        shadowColor: colors.ink,
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        paddingHorizontal: 14,
        paddingVertical: 2,
    },
    // ── Rank rows ──────────────────────────────────────────────────────
    rankRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 9,
    },
    rankRowBorder: {
        borderTopWidth: 1,
        borderTopColor: colors.line,
    },
    rankNum: {
        fontStyle: "italic",
        fontWeight: "700",
        color: "#b8923f",
        fontSize: 18,
        width: 18,
        textAlign: "center",
        flexShrink: 0,
    },
    rowCover: {
        width: 37,
        height: 37,
        borderRadius: 8,
        overflow: "hidden",
        backgroundColor: colors.paper2,
        flexShrink: 0,
    },
    rowCoverImg: { width: "100%", height: "100%" },
    rowText: {
        flex: 1,
        minWidth: 0,
    },
    rowTitle: {
        fontWeight: "700",
        fontSize: 14,
        color: colors.ink,
        lineHeight: 16,
    },
    rowArtist: {
        fontFamily: fonts.mono,
        fontSize: 7.5,
        color: colors.inkSoft,
        letterSpacing: 1,
        marginTop: 3,
    },
    rowScore: {
        fontFamily: fonts.display,
        fontSize: 19,
        letterSpacing: -0.4,
        flexShrink: 0,
    },
    rowLockIcon: {
        width: 28,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    // ── Versus history empty state ─────────────────────────────────────
    versusEmptyCard: {
        alignItems: "center",
        paddingVertical: 16,
        paddingHorizontal: 18,
    },
    versusGhostRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 9,
    },
    versusGhostCover: {
        width: 32,
        height: 32,
        borderRadius: 7,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: colors.inkDim,
        backgroundColor: colors.paper2,
    },
    versusVS: {
        fontFamily: fonts.display,
        fontSize: 9,
        color: colors.inkDim,
        letterSpacing: 1,
    },
    versusEmptyTitle: {
        fontFamily: fonts.display,
        fontSize: 15,
        color: colors.ink,
        marginTop: 12,
    },
    versusEmptyBody: {
        fontSize: 11.5,
        color: colors.inkSoft,
        lineHeight: 17,
        marginTop: 5,
        textAlign: "center",
        maxWidth: 250,
    },
    // ── Versus history receipt rows ────────────────────────────────────
    versusReceiptRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 9,
        gap: 10,
    },
    versusReceiptBorder: {
        borderTopWidth: 1,
        borderTopColor: colors.paper2,
    },
    versusCovers: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        flexShrink: 0,
    },
    versusWinnerCover: {
        borderRadius: 6,
        shadowColor: colors.accent,
        shadowOpacity: 0,
        overflow: "hidden",
        borderWidth: 2,
        borderColor: colors.accent,
    },
    versusLoserCover: {
        borderRadius: 6,
        overflow: "hidden",
        opacity: 0.4,
    },
    versusCoverImg: {
        width: 30,
        height: 30,
        borderRadius: 4,
    },
    versusReceiptVS: {
        fontFamily: fonts.display,
        fontSize: 8.5,
        color: colors.inkDim,
    },
    versusWinnerInfo: {
        flex: 1,
        minWidth: 0,
    },
    versusReceiptWinner: {
        fontFamily: fonts.display,
        fontSize: 12,
        lineHeight: 14,
        color: colors.ink,
    },
    versusReceiptOver: {
        fontSize: 11,
        color: colors.inkSoft,
        marginTop: 2,
    },
    // ── Anchor cards ───────────────────────────────────────────────────
    anchorGrid: {
        flexDirection: "row",
        gap: 8,
        marginHorizontal: 14,
    },
    anchorGridItem: {
        flex: 1,
        minWidth: 0,
    },
    anchorCard: {
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 12,
        overflow: "hidden",
        shadowColor: colors.ink,
        shadowOpacity: 0.04,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
    },
    anchorTopBar: {
        height: 4,
    },
    anchorBody: {
        padding: 9,
    },
    anchorLabel: {
        fontFamily: fonts.mono,
        fontSize: 6.5,
        letterSpacing: 0.9,
        fontWeight: "700",
        marginBottom: 7,
    },
    anchorCover: {
        width: "100%",
        aspectRatio: 1,
        borderRadius: 7,
        overflow: "hidden",
        backgroundColor: colors.paper2,
        marginBottom: 6,
    },
    anchorCoverImg: { width: "100%", height: "100%" },
    anchorTitle: {
        fontWeight: "700",
        fontSize: 11,
        color: colors.ink,
        lineHeight: 13,
        marginBottom: 6,
    },
    anchorEmptyBox: {
        width: 38,
        height: 38,
        borderRadius: 9,
        marginTop: 7,
        alignSelf: "center",
        alignItems: "center",
        justifyContent: "center",
    },
    anchorEmptyDash: {
        fontFamily: fonts.display,
        fontSize: 17,
    },
    anchorEmptyFraction: {
        fontFamily: fonts.mono,
        fontSize: 8,
        fontWeight: "700",
        letterSpacing: 0.8,
        textAlign: "center",
        marginTop: 6,
        opacity: 0.65,
    },
    anchorHint: {
        fontFamily: fonts.sans,
        fontSize: 11,
        color: colors.inkDim,
        textAlign: "center",
        marginTop: 9,
        marginHorizontal: 14,
    },
    anchorFooter: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    anchorScore: {
        fontFamily: fonts.display,
        fontSize: 19,
        letterSpacing: -0.4,
    },
    anchorCountPill: {
        borderRadius: 7,
        paddingHorizontal: 6,
        paddingVertical: 4,
    },
    anchorCount: {
        fontFamily: fonts.mono,
        fontSize: 10,
        fontWeight: "700",
    },
    // ── Empty / error ──────────────────────────────────────────────────
    listContent: {
        paddingBottom: 96,
    },
    emptyText: {
        fontWeight: "700",
        color: colors.ink,
        fontSize: 18,
        marginBottom: 24,
    },
    btn: {
        paddingVertical: 12,
        paddingHorizontal: 32,
        backgroundColor: colors.ink,
        borderRadius: 999,
    },
    btnText: {
        color: "#fff",
        fontWeight: "600",
        fontSize: 14,
    },
    bottomSpacer: {
        height: 96,
    },
    errorText: {
        color: colors.danger,
        fontSize: 15,
        marginBottom: 24,
        textAlign: "center",
    },
    // ── Rankings empty state ───────────────────────────────────────────
    emptyContent: {
        paddingBottom: 96,
    },
    // "Build your rank map" card
    buildCard: {
        marginHorizontal: 14,
        marginBottom: 4,
        borderRadius: 20,
        backgroundColor: colors.navy,
        overflow: "hidden",
        padding: 16,
    },
    buildRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        marginBottom: 16,
    },
    buildOrbitWrap: {
        width: 70,
        height: 70,
        flexShrink: 0,
        alignItems: "center",
        justifyContent: "center",
    },
    buildText: {
        flex: 1,
    },
    buildTitle: {
        fontFamily: fonts.serif,
        fontStyle: "italic",
        fontSize: 18,
        color: colors.cream,
        lineHeight: 20,
        marginBottom: 5,
    },
    buildBody: {
        fontFamily: fonts.mono,
        fontSize: 11.5,
        color: colors.cdim,
        lineHeight: 16,
    },
    buildMeter: {
        flexDirection: "row",
        gap: 4,
        marginBottom: 10,
    },
    buildMeterBar: {
        flex: 1,
        height: 5,
        borderRadius: 3,
        backgroundColor: "rgba(245,238,220,0.15)",
    },
    buildMeterBarFilled: {
        backgroundColor: colors.gold,
    },
    buildFooter: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    buildStats: {
        fontFamily: fonts.mono,
        fontSize: 8.5,
        color: colors.cdim,
        letterSpacing: 1.2,
    },
    buildBtn: {
        backgroundColor: colors.gold,
        borderRadius: 999,
        paddingVertical: 9,
        paddingHorizontal: 16,
    },
    buildBtnText: {
        fontFamily: fonts.display,
        fontSize: 12,
        color: colors.navy,
        letterSpacing: -0.2,
    },
    // Empty rankings list card
    emptyRankingsCard: {
        marginHorizontal: 14,
        backgroundColor: colors.paper,
        borderRadius: 16,
        paddingVertical: 40,
        paddingHorizontal: 20,
        borderWidth: 1,
        borderColor: colors.line,
        alignItems: "center",
        shadowColor: colors.ink,
        shadowOpacity: 0.04,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
    },
    emptyRankingsIconWrap: {
        width: 52,
        height: 52,
        borderRadius: 14,
        backgroundColor: colors.bg,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 16,
    },
    emptyRankingsTitle: {
        fontFamily: fonts.display,
        fontSize: 20,
        color: colors.ink,
        letterSpacing: -0.3,
        marginBottom: 8,
    },
    emptyRankingsBody: {
        fontFamily: fonts.mono,
        fontSize: 13,
        color: colors.inkSoft,
        lineHeight: 19,
        textAlign: "center",
    },
    // Anchors section
    anchorSectionRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-end",
        paddingHorizontal: 16,
        marginTop: 22,
        marginBottom: 9,
    },
    anchorSectionTitle: {
        fontFamily: fonts.display,
        fontSize: 17,
        color: colors.ink,
        letterSpacing: -0.3,
    },
    anchorSectionRight: {
        fontFamily: fonts.mono,
        fontSize: 7.5,
        color: colors.inkDim,
        letterSpacing: 2,
        fontWeight: "700",
    },
    emptyAnchorCard: {
        flex: 1,
        backgroundColor: colors.paper,
        borderRadius: 12,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: colors.line,
        shadowColor: colors.ink,
        shadowOpacity: 0.04,
        shadowRadius: 5,
        shadowOffset: { width: 0, height: 2 },
    },
    emptyAnchorBody: {
        alignItems: "center",
        paddingVertical: 14,
        paddingHorizontal: 8,
    },
    emptyAnchorLabel: {
        fontFamily: fonts.mono,
        fontSize: 8,
        letterSpacing: 1.2,
        fontWeight: "700",
        marginBottom: 10,
    },
    emptyAnchorDash: {
        fontFamily: fonts.display,
        fontSize: 22,
        letterSpacing: -0.3,
    },
    anchorCaption: {
        fontFamily: fonts.mono,
        fontSize: 11,
        color: colors.inkDim,
        textAlign: "center",
        marginTop: 12,
        marginHorizontal: 20,
        lineHeight: 16,
    },
})
