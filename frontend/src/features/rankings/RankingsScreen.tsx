// Rankings tab — shows the user's ranked songs sorted by score.
import { ReactNode, useCallback, useEffect, useRef, useState } from "react"
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
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Animated, {
    Easing,
    useAnimatedStyle,
    useReducedMotion,
    useSharedValue,
    withRepeat,
    withTiming,
} from "react-native-reanimated"
import { FlashList } from "@shopify/flash-list"
import { CompositeNavigationProp, useFocusEffect, useNavigation, useScrollToTop } from "@react-navigation/native"
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg"

import { ApiError } from "../../api/client"
import { ArrowLabel } from "../../components/Arrow"
import BouncyPressable from "../../components/BouncyPressable"
import { DriftingStars } from "../../components/DriftingStars"
import HatchBox from "../../components/HatchBox"
import { LockIcon } from "../../components/LockIcon"
import { PulsingMeterTick } from "../../components/PulsingMeterTick"
import { AppStackParamList, RankingsStackParamList, TabParamList } from "../../navigation/types"
import { colors, fonts, bucketColor, goldMeterShade, meterSegment } from "../../theme"
import { useAuth } from "../auth/AuthContext"
import { BucketName, RankingAnchorsResponse, RankingResponse } from "../comparison/types"
import { getMyRankingAnchors, listMyRankings, listMyVersusHistory } from "./apiRequests"
import { useScoresLocked } from "../../hooks/useScoresLocked"
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
    { key: "lowest_dislike", label: "BOTTOM · DISLIKE", bucketKey: "dislike", requiredCount: 1 },
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

// Compact a bucket's song count so a 100s/1000s library never blows out the narrow anchor footer:
// 999 stays "999", then "1.2k", "12k". Keeps the pill ~3 chars wide at most.
function formatCount(n: number): string {
    if (n < 1000) return String(n)
    const k = n / 1000
    return `${k < 10 ? k.toFixed(1).replace(/\.0$/, "") : Math.round(k)}k`
}

// The hero covers slowly drift around the sun (one full turn every 95s), matching
// the design's living thumbnail. Fills the map so its center is the sun's center,
// so a plain rotation orbits every cover around the #1. Honors reduced motion.
function DriftLayer({ children }: { children: ReactNode }) {
    const reduced = useReducedMotion()
    const spin = useSharedValue(0)
    useEffect(() => {
        if (reduced) return
        spin.value = withRepeat(withTiming(360, { duration: 95000, easing: Easing.linear }), -1, false)
    }, [reduced, spin])
    const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }))
    return (
        <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
            {children}
        </Animated.View>
    )
}

export default function RankingsScreen() {
    const navigation = useNavigation<RankingsNavigation>()
    const { token } = useAuth()
    const insets = useSafeAreaInsets()
    // Re-tapping the Rankings tab while scrolled down jumps back to the top. One ref
    // covers whichever scroller is mounted — the FlashList when rated, the ScrollView
    // when empty (only one ever renders at a time), so it's loosely typed.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scrollRef = useRef<any>(null)
    useScrollToTop(scrollRef)
    // Hide the viewer's own scores + positions until they've rated 10 songs.
    const scoresLocked = useScoresLocked()
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
    // Tapping a receipt's cover opens that song's page. Versus songs are the viewer's
    // own rated songs, so they resolve from the already-loaded rankings list.
    const handleVersusSongPress = (songId: number) => {
        const ranking = rankings.find((r) => r.song_id === songId)
        if (ranking) navigation.navigate("SongDetail", { ranking })
    }
    const handleFullRankingsPress = () => navigation.navigate("FullRankings")
    const handleOpenRankMap = () => navigation.navigate("RankMap", { rankings })
    const handleRateFirstSong = () => navigation.navigate("Discover", { screen: "DiscoverHome", params: { focusSearch: true, searchMode: "songs" } })

    // Centered-sun preview: your #1 cover is a glowing sun, a few hero covers
    // ride two dashed orbit rings over a taste-colored aurora, and the whole
    // card opens the full immersive Rank Map. (See design §13 "centered sun".)
    const renderRankMap = () => {
        const screenW = Dimensions.get("window").width
        const mapW = screenW - 28
        const mapH = 168
        const cx = mapW / 2
        const cy = mapH / 2
        const innerR = 40
        const outerR = 64

        const top = rankings[0]
        const heroes = [
            { r: rankings[1], a: -0.6, ring: innerR, size: 28 },
            { r: rankings[2], a: 2.5, ring: innerR, size: 28 },
            { r: rankings[3], a: -2.3, ring: outerR, size: 22 },
            { r: rankings[4], a: -0.2, ring: outerR, size: 22 },
            { r: rankings[5], a: 1.4, ring: outerR, size: 22 },
            { r: rankings[6], a: 3.0, ring: outerR, size: 22 },
        ].filter((h): h is { r: RankingResponse; a: number; ring: number; size: number } => Boolean(h.r))

        return (
            <TouchableOpacity
                activeOpacity={0.9}
                onPress={handleOpenRankMap}
                accessibilityRole="button"
                accessibilityLabel="Open Rank Map"
                testID="rank-map-preview"
                style={[styles.rankMap, { width: mapW, height: mapH }]}
            >
                {/* Background: starfield, taste aurora, sun halo, orbit rings */}
                <Svg width={mapW} height={mapH} style={StyleSheet.absoluteFill} pointerEvents="none">
                    <Defs>
                        <RadialGradient id="rmHalo" cx={cx} cy={cy} r={72} gradientUnits="userSpaceOnUse">
                            <Stop offset="0" stopColor={colors.gold} stopOpacity={0.38} />
                            <Stop offset="0.42" stopColor={colors.gold} stopOpacity={0.1} />
                            <Stop offset="1" stopColor={colors.gold} stopOpacity={0} />
                        </RadialGradient>
                        <RadialGradient id="rmAuroraLike" cx={cx - 34} cy={cy + 4} r={92} gradientUnits="userSpaceOnUse">
                            <Stop offset="0" stopColor={colors.like} stopOpacity={0.22} />
                            <Stop offset="1" stopColor={colors.like} stopOpacity={0} />
                        </RadialGradient>
                        <RadialGradient id="rmAuroraOkay" cx={cx + 38} cy={cy + 22} r={84} gradientUnits="userSpaceOnUse">
                            <Stop offset="0" stopColor={colors.okay} stopOpacity={0.19} />
                            <Stop offset="1" stopColor={colors.okay} stopOpacity={0} />
                        </RadialGradient>
                        <RadialGradient id="rmAuroraDislike" cx={cx + 6} cy={cy - 34} r={76} gradientUnits="userSpaceOnUse">
                            <Stop offset="0" stopColor={colors.dislike} stopOpacity={0.16} />
                            <Stop offset="1" stopColor={colors.dislike} stopOpacity={0} />
                        </RadialGradient>
                    </Defs>
                    {STARS.map((st, i) => (
                        <Circle key={i} cx={`${st.x}%`} cy={`${st.y}%`} r={st.r} fill={colors.cream} opacity={st.o} />
                    ))}
                    <Circle cx={cx - 34} cy={cy + 4} r={92} fill="url(#rmAuroraLike)" />
                    <Circle cx={cx + 38} cy={cy + 22} r={84} fill="url(#rmAuroraOkay)" />
                    <Circle cx={cx + 6} cy={cy - 34} r={76} fill="url(#rmAuroraDislike)" />
                    <Circle cx={cx} cy={cy} r={72} fill="url(#rmHalo)" />
                    <Circle cx={cx} cy={cy} r={innerR} fill="none" stroke={colors.gold} strokeOpacity={0.3} strokeWidth={0.8} strokeDasharray="2 5" />
                    <Circle cx={cx} cy={cy} r={outerR} fill="none" stroke={colors.cream} strokeOpacity={0.12} strokeWidth={0.8} strokeDasharray="2 5" />
                </Svg>

                {/* Hero covers riding the rings — slowly drifting around the sun */}
                <DriftLayer>
                    {heroes.map(({ r, a, ring, size }) => {
                        const glow = bucketColor(r.bucket)
                        return (
                            <View
                                key={r.id}
                                style={[
                                    styles.heroCover,
                                    {
                                        width: size,
                                        height: size,
                                        borderRadius: size / 2,
                                        left: cx + Math.cos(a) * ring - size / 2,
                                        top: cy + Math.sin(a) * ring - size / 2,
                                        shadowColor: glow,
                                    },
                                ]}
                            >
                                {r.song.cover_url ? (
                                    <Image source={{ uri: r.song.cover_url }} style={styles.heroCoverImg} />
                                ) : (
                                    <View style={[styles.heroCoverImg, { backgroundColor: glow, opacity: 0.6 }]} />
                                )}
                            </View>
                        )
                    })}
                </DriftLayer>

                {/* The sun — your #1, glowing at the center */}
                {top ? (
                    <View style={[styles.sun, { left: cx - 29, top: cy - 29 }]}>
                        {top.song.cover_url ? (
                            <Image source={{ uri: top.song.cover_url }} style={styles.sunImg} />
                        ) : (
                            <View style={[styles.sunImg, { backgroundColor: bucketColor(top.bucket) }]} />
                        )}
                    </View>
                ) : null}

                {/* Bottom scrim for text legibility */}
                <Svg width={mapW} height={56} style={styles.rankMapScrim} pointerEvents="none">
                    <Defs>
                        <LinearGradient id="rmScrim" x1="0" y1="0" x2="0" y2="1">
                            <Stop offset="0" stopColor={colors.navy2} stopOpacity={0} />
                            <Stop offset="1" stopColor={colors.navy2} stopOpacity={0.85} />
                        </LinearGradient>
                    </Defs>
                    <Rect x={0} y={0} width={mapW} height={56} fill="url(#rmScrim)" />
                </Svg>

                {/* Top-left label */}
                <View style={styles.rankMapPill}>
                    <Text style={styles.rankMapStar}>★</Text>
                    <Text style={styles.rankMapPillText}>RANK MAP</Text>
                </View>

                {/* Bottom-left: song count */}
                <View style={styles.rankMapInfo}>
                    <Text style={styles.rankMapCount}>
                        {rankings.length} songs<Text style={styles.rankMapCountDim}> in orbit</Text>
                    </Text>
                </View>

                {/* Bottom-right CTA */}
                <View style={styles.openChart}>
                    <ArrowLabel text="OPEN" direction="right" color={colors.gold} textStyle={styles.openChartText} size={10} />
                </View>
            </TouchableOpacity>
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
        // Locked anchors get the same springy "squish then bounce back" press feedback as the
        // locked Feed/social modules; unlocked anchors stay a plain card so the inner count pill
        // owns the press.
        const CardRoot = anchor === null ? BouncyPressable : View
        return (
            <CardRoot style={styles.anchorCard}>
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
                                {scoresLocked ? (
                                    <View style={styles.lockedScore}>
                                        <LockIcon color={colors.inkDim} size={11} />
                                        <Text style={[styles.anchorScore, { color: colors.inkDim }]}>?</Text>
                                    </View>
                                ) : (
                                    <>
                                        <Text
                                            style={[styles.anchorScore, { color: accentColor }]}
                                            numberOfLines={1}
                                            adjustsFontSizeToFit
                                            minimumFontScale={0.7}
                                        >
                                            {anchor.score.toFixed(1)}
                                        </Text>
                                        {/* Total songs in this bucket → tap to open the bucket's filtered list. */}
                                        <TouchableOpacity
                                            style={[styles.anchorCountPill, { backgroundColor: `${accentColor}24` }]}
                                            onPress={() => navigation.navigate("FullRankings", { initialBucket: bucketKey })}
                                            accessibilityLabel={`See all ${currentCount} ${label} songs`}
                                            hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
                                        >
                                            <Text style={[styles.anchorCount, { color: accentColor }]} numberOfLines={1}>
                                                {formatCount(currentCount)}
                                            </Text>
                                            {/* Stemless chevron (no shaft) — bold, matching the Claude design. */}
                                            <Svg width={10} height={10} viewBox="0 0 24 24" fill="none">
                                                <Path d="M9 5l7 7-7 7" stroke={accentColor} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
                                            </Svg>
                                        </TouchableOpacity>
                                    </>
                                )}
                            </View>
                        </>
                    )}
                </View>
            </CardRoot>
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
                <DriftingStars dots={STARS} color={colors.cream} />

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
                        <Text style={styles.buildTitle}>{"Build your Rank Map."}</Text>
                        <Text style={styles.buildBody}>
                            Rate 10 songs to place every track by taste.
                        </Text>
                    </View>
                </View>
                <View style={styles.buildMeter}>
                    {Array.from({ length: 10 }).map((_, i) => {
                        // The first empty segment pulses to point at the next rating.
                        if (i === rated) return <PulsingMeterTick key={i} style={styles.buildMeterBar} />
                        return (
                            <View key={i} style={[
                                styles.buildMeterBar,
                                // Filled segments climb the shared gold ramp (muted → bright) like the Feed meter.
                                i < rated && { backgroundColor: goldMeterShade(i) },
                            ]} />
                        )
                    })}
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
        const anchorsUnlocked =
            rankings.filter((r) => r.bucket === "like").length >= 1 &&
            rankings.filter((r) => r.bucket === "alright").length >= 3 &&
            rankings.filter((r) => r.bucket === "dislike").length >= 1
        return (<View>
            {/* BO-style header */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <Text style={styles.kicker}>{rankings.length} SONGS · CALIBRATED</Text>
                    <Text style={styles.heading}>Rankings</Text>
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

            {/* Your Podium section (full ranked list) */}
            <View style={styles.sectionRow}>
                <Text style={styles.sectionLabel}>YOUR PODIUM</Text>
                <TouchableOpacity
                    onPress={handleFullRankingsPress}
                    accessibilityLabel="View All / Filter Rankings"
                >
                    <ArrowLabel text="VIEW FULL LIST" direction="right" color={colors.accent} textStyle={styles.sectionRight} />
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
                                <View style={styles.lockedScore}>
                                    <LockIcon color={colors.inkDim} size={12} />
                                    <Text style={[styles.rowScore, { color: colors.inkDim }]}>?</Text>
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
                    <ArrowLabel text="VIEW LOG" direction="up-right" color={colors.accent} textStyle={styles.sectionRight} />
                </TouchableOpacity>
            </View>
            {versusReceipts.length === 0 ? (
                <View style={[styles.paperCard, styles.versusEmptyCard]}>
                    <View style={styles.versusGhostRow}>
                        <HatchBox size={32} radius={7} tone="dark" />
                        <Text style={styles.versusVS}>VS</Text>
                        <HatchBox size={32} radius={7} tone="dark" />
                    </View>
                    <Text style={styles.versusEmptyTitle}>No match-ups yet</Text>
                    <Text style={styles.versusEmptyBody}>
                        As you rate, LISTn pits each song against others to place it. Those head-to-heads land here.
                    </Text>
                </View>
            ) : (
                <View style={styles.paperCard}>
                    {versusReceipts.slice(0, 3).map((r, i) => (
                        <View key={r.id} style={[styles.versusReceiptRow, i > 0 && styles.versusReceiptBorder]}>
                            {/* Cover pair — each cover opens its song's page */}
                            <View style={styles.versusCovers}>
                                <TouchableOpacity
                                    style={styles.versusWinnerCover}
                                    onPress={() => handleVersusSongPress(r.winner_song_id)}
                                    activeOpacity={0.8}
                                    accessibilityLabel={`Open ${r.winner_title}`}
                                >
                                    {r.winner_cover_url ? (
                                        <Image
                                            source={{ uri: r.winner_cover_url }}
                                            style={styles.versusCoverImg}
                                        />
                                    ) : (
                                        <View style={[styles.versusCoverImg, { backgroundColor: colors.paper2 }]} />
                                    )}
                                </TouchableOpacity>
                                <Text style={styles.versusReceiptVS}>VS</Text>
                                <TouchableOpacity
                                    style={styles.versusLoserCover}
                                    onPress={() => handleVersusSongPress(r.loser_song_id)}
                                    activeOpacity={0.8}
                                    accessibilityLabel={`Open ${r.loser_title}`}
                                >
                                    {r.loser_cover_url ? (
                                        <Image
                                            source={{ uri: r.loser_cover_url }}
                                            style={styles.versusCoverImg}
                                        />
                                    ) : (
                                        <View style={[styles.versusCoverImg, { backgroundColor: colors.paper2 }]} />
                                    )}
                                </TouchableOpacity>
                            </View>
                            {/* Winner info — tapping the winner's area also opens its song page */}
                            <TouchableOpacity
                                style={styles.versusWinnerInfo}
                                onPress={() => handleVersusSongPress(r.winner_song_id)}
                                activeOpacity={0.8}
                                accessibilityLabel={`Open ${r.winner_title}`}
                            >
                                <Text style={styles.versusReceiptWinner} numberOfLines={1}>{r.winner_title}</Text>
                                <Text style={styles.versusReceiptOver} numberOfLines={1}>over {r.loser_title}</Text>
                            </TouchableOpacity>
                        </View>
                    ))}
                </View>
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
            <ScrollView ref={scrollRef} style={styles.container} contentContainerStyle={styles.emptyContent}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        <Text style={styles.kicker}>{rankings.length} SONGS · CALIBRATED</Text>
                        <Text style={styles.heading}>Rankings</Text>
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
                        <HatchBox size={32} radius={7} tone="dark" />
                        <Text style={styles.versusVS}>VS</Text>
                        <HatchBox size={32} radius={7} tone="dark" />
                    </View>
                    <Text style={styles.versusEmptyTitle}>No match-ups yet</Text>
                    <Text style={styles.versusEmptyBody}>
                        As you rate, LISTn pits each song against others to place it. Those head-to-heads land here.
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
                ref={scrollRef}
                data={[]}
                renderItem={() => null}
                keyExtractor={() => ""}
                ListHeaderComponent={renderListHeader()}
                contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 92 }]}
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
        // Align the right-side icon with the title (bottom of the kicker+heading
        // column), not the small kicker label above it.
        alignItems: "flex-end",
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
        // lineHeight must clear the font's descender or the tail of the "g" in
        // "Rankings" clips; 29 (< fontSize) was cutting it off.
        lineHeight: 36,
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
        flexDirection: "row",
        alignItems: "center",
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
    // Star rendered as its own element so it centers vertically against the label instead of
    // riding high on the text baseline.
    rankMapStar: {
        fontSize: 8.5,
        lineHeight: 8.5,
        color: colors.gold,
        marginRight: 4,
        // The ★ glyph rides high in its box; nudge down so it centers against the label.
        transform: [{ translateY: 1 }],
    },
    heroCover: {
        position: "absolute",
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.16)",
        shadowOpacity: 0.85,
        shadowRadius: 9,
        shadowOffset: { width: 0, height: 0 },
        elevation: 5,
    },
    heroCoverImg: {
        width: "100%",
        height: "100%",
    },
    sun: {
        position: "absolute",
        width: 58,
        height: 58,
        borderRadius: 29,
        overflow: "hidden",
        borderWidth: 2.5,
        borderColor: colors.gold,
        shadowColor: colors.gold,
        shadowOpacity: 0.9,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 0 },
        elevation: 10,
    },
    sunImg: {
        width: "100%",
        height: "100%",
    },
    rankMapScrim: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
    },
    rankMapInfo: {
        position: "absolute",
        left: 12,
        bottom: 11,
        right: 120,
    },
    rankMapCount: {
        fontFamily: fonts.serif,
        fontSize: 15,
        lineHeight: 16,
        color: colors.cream,
    },
    rankMapCountDim: {
        color: colors.cdim,
    },
    openChart: {
        position: "absolute",
        right: 11,
        bottom: 11,
        borderWidth: 1,
        borderColor: "rgba(245,184,64,0.34)",
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    openChartText: {
        fontFamily: fonts.monoBold,
        fontSize: 8.5,
        color: colors.gold,
        letterSpacing: 0.8,
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
    // Locked score: padlock + greyed "?" sitting where the numeric score goes.
    lockedScore: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
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
        maxWidth: 290,
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
        fontSize: 7.5,
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
        gap: 6,
    },
    anchorScore: {
        fontFamily: fonts.display,
        fontSize: 19,
        letterSpacing: -0.4,
        // Shrinks (with adjustsFontSizeToFit) if a wide count pill leaves it little room, so the two
        // never collide in a packed bucket; the pill itself keeps its size.
        flexShrink: 1,
        minWidth: 0,
    },
    anchorCountPill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        flexShrink: 0,
        borderRadius: 6,
        paddingHorizontal: 5,
        paddingVertical: 3,
    },
    anchorCount: {
        fontFamily: fonts.display,
        fontSize: 13,
        letterSpacing: -0.3,
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
    buildMeterBar: meterSegment,
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
