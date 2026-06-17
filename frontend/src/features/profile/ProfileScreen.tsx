// Profile tab — own profile with identity card, To LISTn shelf, taste & activity.
import { Fragment, useCallback, useEffect, useState } from "react"
import {
    ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useFocusEffect, useNavigation } from "@react-navigation/native"
import Svg, { Circle, Line, Path } from "react-native-svg"

import { ApiError } from "../../api/client"
import { AppStackParamList } from "../../navigation/types"
import { bucketColor } from "../../theme"
import { avatarColorToken, colors, fonts } from "../../theme"
import { formatRelativeTime } from "../../utils/formatRelativeTime"
import ActivityLikeButton from "../activity/ActivityLikeButton"
import { useAuth } from "../auth/AuthContext"
import {
    getMostCompatible, getMyAuxstrology, getMyProfile, getMyRecentRatings, getMyTasteProfile,
} from "./apiRequests"
import {
    AuxstrologyResponse, MostCompatibleItem, Profile, RecentRatingItem, TasteProfileResponse,
} from "./types"
import MostCompatibleModule from "./MostCompatibleModule"
import { OwnStreakChip } from "./StreakBadge"

type ProfileNavigationProp = NativeStackNavigationProp<AppStackParamList, "MainTabs">

// Constellation nodes + edges for the Auxstrology SVG (gold, in 80×80 viewBox)
const CONST_NODES: [number, number][] = [
    [18, 58], [36, 22], [52, 42], [68, 18], [62, 52], [30, 46], [52, 8],
]
const CONST_EDGES: [number, number][] = [[0, 1], [1, 2], [2, 3], [2, 4], [0, 4], [1, 5], [3, 6]]

// Star dot positions for the dark navy card backdrop (in 0–100 viewBox space)
const STAR_DOTS = Array.from({ length: 30 }, (_, i) => ({
    key: i,
    x: ((i * 37 + 13) * 941) % 100,
    y: ((i * 53 + 7) * 613) % 100,
    r: i % 3 === 0 ? 1 : 0.6,
    op: 0.2 + (i % 4) * 0.08,
}))

export default function ProfileScreen() {
    const navigation = useNavigation<ProfileNavigationProp>()
    const { token } = useAuth()
    const [profile, setProfile] = useState<Profile | null>(null)
    const [profileError, setProfileError] = useState<string | null>(null)
    const [taste, setTaste] = useState<TasteProfileResponse | null>(null)
    const [tasteLoading, setTasteLoading] = useState(false)
    const [aux, setAux] = useState<AuxstrologyResponse | null>(null)
    const [ratings, setRatings] = useState<RecentRatingItem[] | null>(null)
    const [mostCompatible, setMostCompatible] = useState<MostCompatibleItem[] | null>(null)

    const openFollowers = () => {
        if (!profile) return
        navigation.navigate("ProfileList", { username: profile.username, listType: "followers" })
    }
    const openFollowing = () => {
        if (!profile) return
        navigation.navigate("ProfileList", { username: profile.username, listType: "following" })
    }
    const openSettings = () => navigation.navigate("Settings")
    const openBookmarks = () => navigation.navigate("Bookmarks")
    const openRatings = () =>
        navigation.navigate("MainTabs", { screen: "Rankings", params: { screen: "FullRankings" } })
    const openActivityLikers = (ratingEventId: number) => {
        navigation.navigate("ActivityLikers", { ratingEventId })
    }

    useFocusEffect(
        useCallback(() => {
            if (!token) return
            async function fetchProfile() {
                try {
                    const data = await getMyProfile(token!)
                    setProfile(data)
                } catch (err) {
                    if (err instanceof ApiError) setProfileError(err.detail)
                    else if (err instanceof Error) setProfileError(err.message)
                    else setProfileError("Failed to load profile.")
                }
            }
            async function fetchModules() {
                try {
                    const [vData, mcData] = await Promise.all([
                        getMyRecentRatings(token!),
                        getMostCompatible(token!),
                    ])
                    setRatings(vData.items)
                    setMostCompatible(mcData.users)
                } catch {
                    setRatings([])
                    setMostCompatible([])
                }
            }
            fetchProfile()
            fetchModules()
        }, [token])
    )

    useEffect(() => {
        if (!token) return
        async function fetchTaste() {
            setTasteLoading(true)
            try {
                const data = await getMyTasteProfile(token!)
                setTaste(data)
            } catch {
                // non-critical — taste sections remain locked
            } finally {
                setTasteLoading(false)
            }
        }
        async function fetchAuxstrology() {
            try {
                const data = await getMyAuxstrology(token!)
                setAux(data)
            } catch {
                // non-critical — the Auxstrology card falls back to its locked state
            }
        }
        fetchTaste()
        fetchAuxstrology()
    }, [token])

    const profileInitial = profile
        ? (profile.display_name || profile.username).charAt(0).toUpperCase()
        : "?"

    const ratedCount = profile?.user_stats?.rated_count ?? 0
    const bookmarkedCount = profile?.user_stats?.bookmarked_count ?? 0
    const currentStreak = profile?.user_stats?.current_streak ?? 0
    const longestStreak = profile?.user_stats?.longest_streak ?? 0
    const isNew = ratedCount < 10

    const step1Done = ratedCount > 0
    const step2Done = ratedCount >= 10
    const step3Done = (profile?.following_count ?? 0) >= 3
    const stepsCompleted = [step1Done, step2Done, step3Done].filter(Boolean).length

    const topGenres = taste?.overall?.genres?.slice(0, 3) ?? []
    const topGenreLabel = topGenres[0]?.name ?? null
    const GENRE_COLORS = [colors.accent, colors.plum, colors.mint]

    const bucketTotal = (taste?.total_rated ?? 0) || 1

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
        >
            {/* BO Header */}
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <View>
                        <Text style={styles.kicker}>TUNED IN</Text>
                        <Text style={styles.heading}>You</Text>
                    </View>
                    <View style={styles.headerActions}>
                        {profile && <OwnStreakChip weeks={currentStreak} longest={longestStreak} />}
                        <TouchableOpacity style={styles.iconBtn} onPress={openSettings}>
                            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                            <Circle cx="12" cy="12" r="3" stroke={colors.ink} strokeWidth="1.8" />
                            <Path
                                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
                                stroke={colors.ink}
                                strokeWidth="1.8"
                            />
                        </Svg>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Identity card */}
                {profile ? (
                    <View style={styles.identityCard}>
                        <View style={styles.identityRow}>
                            <View
                                style={[styles.avatar, { backgroundColor: avatarColorToken(profile?.avatar_color, colors.ink) }]}
                                testID="profile-star-avatar"
                            >
                                <Text style={styles.avatarLetter}>{profileInitial}</Text>
                            </View>
                            <View style={styles.identityInfo}>
                                <Text style={styles.displayName}>{profile.display_name}</Text>
                                <Text style={styles.usernameRow}>
                                    @{profile.username} · {visibilityLabel(profile.visibility)}
                                </Text>
                                <View style={styles.statsInlineRow}>
                                    {([
                                        [ratedCount, "rated", openRatings, "stats-rated"],
                                        [profile.follower_count, "followers", openFollowers, undefined],
                                        [profile.following_count, "following", openFollowing, undefined],
                                    ] as [number, string, () => void, string | undefined][]).map(([val, label, onPress, tid], i) => (
                                        <Fragment key={label}>
                                            {i > 0 && <View style={styles.statInlineDivider} />}
                                            <TouchableOpacity style={styles.statInlineBtn} onPress={onPress} testID={tid}>
                                                <Text style={styles.statInlineNum}>{val}</Text>
                                                <Text style={styles.statInlineLbl}>{label}</Text>
                                            </TouchableOpacity>
                                        </Fragment>
                                    ))}
                                </View>
                            </View>
                        </View>
                    </View>
                ) : profileError ? (
                    <Text style={styles.error}>{profileError}</Text>
                ) : (
                    <ActivityIndicator color={colors.accent} style={styles.loader} />
                )}

                {/* To LISTn shelf */}
                {profile && (
                    <TouchableOpacity style={styles.toLishnShelf} onPress={openBookmarks} testID="stats-bookmarked">
                        <View style={styles.bookmarkBox}>
                            <Svg width={14} height={14} viewBox="0 0 24 24">
                                <Path
                                    d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"
                                    fill="#c8c2b4"
                                    stroke={colors.ink}
                                    strokeWidth="2"
                                    strokeLinejoin="round"
                                />
                            </Svg>
                        </View>
                        <View style={styles.toLishnInfo}>
                            <Text style={styles.toLishnTitle}>To LISTn</Text>
                            <Text style={styles.toLishnCaption}>songs saved to rate later</Text>
                        </View>
                        <Text style={styles.toLishnCount}>{bookmarkedCount}</Text>
                        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                            <Path
                                d="M9 18l6-6-6-6"
                                stroke={colors.inkDim}
                                strokeWidth="2"
                                strokeLinecap="round"
                            />
                        </Svg>
                    </TouchableOpacity>
                )}
            </View>

            {/* Below-fold content */}
            {profile && (
                <View style={styles.content}>
                    {/* Setup checklist — shown until user has 10 ratings */}
                    {isNew && (
                        <View style={styles.setupCard}>
                            <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
                                <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
                                    {STAR_DOTS.map((s) => (
                                        <Circle key={s.key} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={s.op} />
                                    ))}
                                </Svg>
                            </View>
                            <View style={styles.setupHeaderRow}>
                                <Text style={styles.setupKicker}>SET UP YOUR PROFILE</Text>
                                <Text style={styles.setupCounter}>{stepsCompleted}/3</Text>
                            </View>
                            <View style={styles.setupSteps}>
                                {([
                                    ["Rate your first song", step1Done],
                                    ["Reach 10 ratings to unlock Rankings", step2Done],
                                    ["Follow 3 friends", step3Done],
                                ] as [string, boolean][]).map(([label, done], i) => (
                                    <View key={i} style={styles.setupStep}>
                                        <View style={[styles.setupStepCircle, done && styles.setupStepCircleDone]}>
                                            {done ? (
                                                <Svg width={10} height={10} viewBox="0 0 24 24">
                                                    <Path
                                                        d="M5 13l4 4L19 7"
                                                        stroke="#fff"
                                                        strokeWidth="2.5"
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                    />
                                                </Svg>
                                            ) : (
                                                <Text style={styles.setupStepNum}>{i + 1}</Text>
                                            )}
                                        </View>
                                        <Text style={[styles.setupStepLabel, done && styles.setupStepLabelDone]}>
                                            {label}
                                        </Text>
                                        {!done && (
                                            <Svg width={12} height={12} viewBox="0 0 24 24">
                                                <Path
                                                    d="M9 18l6-6-6-6"
                                                    stroke={colors.cdim}
                                                    strokeWidth="2"
                                                    strokeLinecap="round"
                                                />
                                            </Svg>
                                        )}
                                    </View>
                                ))}
                            </View>
                            <TouchableOpacity
                                style={styles.setupBtn}
                                onPress={() => navigation.navigate("MainTabs", { screen: "Feed" })}
                            >
                                <Text style={styles.setupBtnText}>Rate a song</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Auxstrology orbit card */}
                    <View style={styles.auxCard}>
                        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
                            <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
                                {STAR_DOTS.slice(0, 20).map((s) => (
                                    <Circle key={s.key} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={s.op * 0.8} />
                                ))}
                            </Svg>
                        </View>
                        <View style={styles.auxInner}>
                            <View style={styles.auxTextBlock}>
                                <Text style={styles.auxKicker}>AUXSTROLOGY</Text>
                                {!aux || aux.status === "locked" || !aux.sign ? (
                                    <>
                                        <Text style={styles.auxTitle}>Locked{"\n"}for now</Text>
                                        <Text style={styles.auxBody}>
                                            Rate songs and we'll name your sound — your genres, moods & quirks.
                                        </Text>
                                    </>
                                ) : (
                                    <>
                                        <Text style={styles.auxTitle}>
                                            {aux.sign.name.replace(/^The /, "The\n")}
                                        </Text>
                                        <Text style={styles.auxBody}>
                                            {aux.caption ?? aux.sign.summary}
                                        </Text>
                                    </>
                                )}
                            </View>
                            <Svg
                                width={72}
                                height={72}
                                viewBox="0 0 80 80"
                                opacity={aux?.status === "active" ? 0.9 : 0.35}
                            >
                                {CONST_EDGES.map(([a, b], i) => (
                                    <Line
                                        key={i}
                                        x1={CONST_NODES[a][0]}
                                        y1={CONST_NODES[a][1]}
                                        x2={CONST_NODES[b][0]}
                                        y2={CONST_NODES[b][1]}
                                        stroke={colors.gold}
                                        strokeWidth={0.9}
                                        opacity={0.55}
                                    />
                                ))}
                                {CONST_NODES.map(([x, y], i) => (
                                    <Circle
                                        key={i}
                                        cx={x}
                                        cy={y}
                                        r={i === 1 ? 3 : 2}
                                        fill={colors.gold}
                                        opacity={0.9}
                                    />
                                ))}
                            </Svg>
                        </View>
                    </View>

                    {/* Taste Profile — top genres (full users only) */}
                    {!isNew && (
                        <View style={styles.tasteCard}>
                            <View style={styles.tasteCardHeader}>
                                <Text style={styles.tasteCardKicker}>TASTE PROFILE</Text>
                                <Text style={styles.tasteCardKicker}>TOP GENRES</Text>
                            </View>
                            {tasteLoading ? (
                                <ActivityIndicator color={colors.accent} style={styles.tasteLoader} />
                            ) : topGenres.length > 0 ? (
                                topGenres.map((g, i) => (
                                    <View key={g.name} style={styles.genreRow}>
                                        <Text style={styles.genreLabel}>{g.name}</Text>
                                        <View style={styles.genreBarTrack}>
                                            <View
                                                style={[
                                                    styles.genreBar,
                                                    {
                                                        width: `${Math.min(g.percentage, 40) * 2.5}%`,
                                                        backgroundColor: GENRE_COLORS[i] ?? colors.accent,
                                                    },
                                                ]}
                                            />
                                        </View>
                                        <Text style={styles.genrePct}>{g.percentage.toFixed(0)}%</Text>
                                    </View>
                                ))
                            ) : (
                                <Text style={styles.tasteEmpty}>Rate more songs to see your top genres.</Text>
                            )}
                        </View>
                    )}

                    {/* 2-col: Your Buckets + Your Stats */}
                    <View style={styles.twoColRow}>
                        <View style={styles.twoColCard}>
                            <Text style={styles.twoColKicker}>YOUR BUCKETS</Text>
                            {([
                                ["Like", taste?.bucket_breakdown?.like ?? 0, colors.mint],
                                ["Okay", taste?.bucket_breakdown?.okay ?? 0, colors.butter],
                                ["Dislike", taste?.bucket_breakdown?.dislike ?? 0, colors.accent],
                            ] as [string, number, string][]).map(([label, count, color]) => {
                                const pct = isNew ? 0 : (count / bucketTotal) * 100
                                return (
                                    <View key={label} style={styles.bucketRow}>
                                        <Text style={styles.bucketLabel}>{label}</Text>
                                        <View style={styles.bucketBarTrack}>
                                            {pct > 0 && (
                                                <View
                                                    style={[
                                                        styles.bucketBar,
                                                        { width: `${pct}%`, backgroundColor: color },
                                                    ]}
                                                />
                                            )}
                                        </View>
                                        <Text style={styles.bucketCount}>{count}</Text>
                                    </View>
                                )
                            })}
                        </View>

                        <View style={styles.twoColCard}>
                            <Text style={styles.twoColKicker}>YOUR STATS</Text>
                            <View style={styles.statStack}>
                                <View>
                                    <Text
                                        style={[
                                            styles.bigStatNum,
                                            (isNew || !taste?.avg_score) && { color: colors.inkDim },
                                        ]}
                                    >
                                        {isNew || !taste?.avg_score
                                            ? "–"
                                            : taste.avg_score.toFixed(1)}
                                    </Text>
                                    <Text style={styles.bigStatLbl}>AVG SCORE</Text>
                                </View>
                                <View style={styles.statStackDivider} />
                                <View>
                                    <Text style={[styles.bigStatNum, { color: colors.inkDim }]}>–</Text>
                                    <Text style={styles.bigStatLbl}>VS CROWD</Text>
                                </View>
                            </View>
                        </View>
                    </View>

                    {/* Compatibility */}
                    <MostCompatibleModule
                        users={mostCompatible}
                        isLoading={mostCompatible === null}
                        onUserPress={(username) => navigation.navigate("OtherProfile", { username })}
                        onViewAll={() => navigation.navigate("MostCompatible")}
                    />

                    {/* Your Activity — full cards */}
                    {ratings !== null && ratings.length > 0 && (
                        <View>
                            <Text style={styles.activityKicker}>Your Activity</Text>
                            {ratings.map((item) => {
                                const col = bucketColor(item.bucket)
                                const when = formatRelativeTime(item.created_at)
                                const bucketLabel = item.bucket === "alright" ? "OKAY"
                                    : item.bucket.toUpperCase()
                                const ringSize = 62
                                const strokeW = 5
                                const r = (ringSize - strokeW) / 2
                                const circ = 2 * Math.PI * r
                                const filled = circ * (item.score / 10)
                                const gap = circ - filled
                                return (
                                    <TouchableOpacity
                                        key={item.rating_event_id}
                                        style={styles.actCard}
                                        onPress={() => navigation.navigate("SongDetail", { song: item.song as never })}
                                        activeOpacity={0.8}
                                        testID={`activity-card-${item.rating_event_id}`}
                                    >
                                        {/* Byline */}
                                        <View style={styles.actByline}>
                                            <View style={[styles.actAvatar, { backgroundColor: avatarColorToken(profile?.avatar_color, colors.ink) }]}>
                                                <Text style={styles.actAvatarLetter}>{profileInitial}</Text>
                                            </View>
                                            <Text style={styles.actBylineText}>
                                                <Text style={styles.actBylineName}>You </Text>
                                                <Text>rated · </Text>
                                                <Text style={styles.actBylineTime}>{when} ago</Text>
                                            </Text>
                                        </View>

                                        {/* Main row: song info + ring */}
                                        <View style={styles.actMainRow}>
                                            <View style={styles.actSongBlock}>
                                                {item.song.cover_url ? (
                                                    <Image
                                                        source={{ uri: item.song.cover_url }}
                                                        style={styles.actCover}
                                                    />
                                                ) : (
                                                    <View style={[styles.actCover, styles.actCoverPlaceholder]} />
                                                )}
                                                <View style={styles.actSongMeta}>
                                                    <Text style={styles.actTitle} numberOfLines={1}>
                                                        {item.song.title}
                                                    </Text>
                                                    <Text style={styles.actArtist} numberOfLines={1}>
                                                        {item.song.artist}
                                                    </Text>
                                                    <View style={styles.actChips}>
                                                        <View style={[styles.actChip, { backgroundColor: `${col}1a` }]}>
                                                            <View style={[styles.actChipDot, { backgroundColor: col }]} />
                                                            <Text style={[styles.actChipText, { color: col }]}>
                                                                {bucketLabel}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                </View>
                                            </View>

                                            {/* Vinyl ring */}
                                            <View style={styles.actRingWrap}>
                                                <Svg width={ringSize} height={ringSize}>
                                                    <Circle
                                                        cx={ringSize / 2}
                                                        cy={ringSize / 2}
                                                        r={r}
                                                        fill="none"
                                                        stroke={colors.line}
                                                        strokeWidth={strokeW}
                                                    />
                                                    <Circle
                                                        cx={ringSize / 2}
                                                        cy={ringSize / 2}
                                                        r={r}
                                                        fill="none"
                                                        stroke={col}
                                                        strokeWidth={strokeW}
                                                        strokeLinecap="round"
                                                        strokeDasharray={`${filled} ${gap}`}
                                                        transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
                                                    />
                                                </Svg>
                                                <View style={[StyleSheet.absoluteFill, styles.actRingCenter]}>
                                                    <Text style={[styles.actRingScore, { color: col }]}>
                                                        {item.score.toFixed(1)}
                                                    </Text>
                                                </View>
                                            </View>
                                        </View>

                                        {/* Note */}
                                        {item.note !== null && item.note !== "" && (
                                            <Text style={styles.actNote} numberOfLines={2}>
                                                "{item.note}"
                                            </Text>
                                        )}
                                        <View style={styles.actActions}>
                                            <ActivityLikeButton
                                                ratingEventId={item.rating_event_id}
                                                initialLikedByViewer={item.liked_by_viewer}
                                                initialLikeCount={item.like_count}
                                                onOpenLikers={openActivityLikers}
                                                compact
                                            />
                                        </View>
                                    </TouchableOpacity>
                                )
                            })}
                        </View>
                    )}
                </View>
            )}
        </ScrollView>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.bg,
    },
    contentContainer: {
        flexGrow: 1,
        paddingBottom: 96,
    },
    // ── Header ────────────────────────────────────────────────────────
    header: {
        paddingHorizontal: 16,
        paddingTop: 60,
        paddingBottom: 8,
    },
    headerTop: {
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        marginBottom: 20,
    },
    headerActions: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginTop: 4,
    },
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
    // ── Identity card ─────────────────────────────────────────────────
    identityCard: {
        backgroundColor: colors.paper,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.line,
        padding: 14,
        marginBottom: 9,
    },
    identityRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 13,
    },
    avatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: colors.ink,
        alignItems: "center",
        justifyContent: "center",
    },
    avatarLetter: {
        fontFamily: fonts.display,
        fontSize: 21,
        color: "#fff",
        lineHeight: 25,
    },
    identityInfo: {
        flex: 1,
    },
    displayName: {
        fontFamily: fonts.display,
        fontSize: 20,
        letterSpacing: -0.3,
        lineHeight: 22,
        color: colors.ink,
        marginBottom: 2,
    },
    usernameRow: {
        fontFamily: fonts.mono,
        color: colors.inkDim,
        fontSize: 9,
        letterSpacing: 0.3,
        marginBottom: 9,
    },
    statsInlineRow: {
        flexDirection: "row",
        alignItems: "center",
    },
    statInlineDivider: {
        width: 1,
        height: 22,
        backgroundColor: colors.line,
        marginHorizontal: 10,
    },
    statInlineBtn: {
        alignItems: "flex-start",
    },
    statInlineNum: {
        fontFamily: fonts.display,
        fontSize: 15,
        letterSpacing: -0.2,
        lineHeight: 17,
        color: colors.ink,
    },
    statInlineLbl: {
        fontFamily: fonts.mono,
        color: colors.inkDim,
        fontSize: 9,
        letterSpacing: 0.2,
    },
    // ── To LISTn shelf ────────────────────────────────────────────────
    toLishnShelf: {
        flexDirection: "row",
        alignItems: "center",
        gap: 11,
        backgroundColor: colors.paper,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.line,
        paddingVertical: 12,
        paddingHorizontal: 13,
    },
    bookmarkBox: {
        width: 34,
        height: 34,
        borderRadius: 9,
        backgroundColor: colors.bg,
        borderWidth: 1,
        borderColor: colors.line,
        alignItems: "center",
        justifyContent: "center",
    },
    toLishnInfo: {
        flex: 1,
    },
    toLishnTitle: {
        fontFamily: fonts.display,
        fontSize: 14,
        letterSpacing: -0.2,
        lineHeight: 16,
        color: colors.ink,
        marginBottom: 1,
    },
    toLishnCaption: {
        fontFamily: fonts.mono,
        fontSize: 8.5,
        color: colors.inkDim,
        letterSpacing: 0.2,
    },
    toLishnCount: {
        fontFamily: fonts.display,
        fontSize: 16,
        color: colors.ink,
        letterSpacing: -0.2,
        marginRight: 4,
    },
    loader: {
        marginVertical: 24,
    },
    error: {
        color: colors.danger,
        fontSize: 14,
        marginBottom: 24,
        textAlign: "center",
    },
    // ── Content area ──────────────────────────────────────────────────
    content: {
        paddingHorizontal: 16,
        paddingTop: 10,
        gap: 10,
        paddingBottom: 8,
    },
    // ── Setup checklist card ──────────────────────────────────────────
    setupCard: {
        backgroundColor: colors.navy,
        borderRadius: 16,
        padding: 14,
        overflow: "hidden",
    },
    setupHeaderRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 14,
    },
    setupKicker: {
        fontFamily: fonts.mono,
        fontSize: 9,
        letterSpacing: 1.8,
        color: colors.gold,
        fontWeight: "700",
    },
    setupCounter: {
        fontFamily: fonts.display,
        fontSize: 13,
        color: colors.cdim,
        letterSpacing: -0.2,
    },
    setupSteps: {
        gap: 10,
        marginBottom: 14,
    },
    setupStep: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    setupStepCircle: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 1.5,
        borderColor: colors.cdim,
        alignItems: "center",
        justifyContent: "center",
    },
    setupStepCircleDone: {
        backgroundColor: colors.mint,
        borderColor: colors.mint,
    },
    setupStepNum: {
        fontFamily: fonts.mono,
        fontSize: 9,
        color: colors.cdim,
    },
    setupStepLabel: {
        flex: 1,
        fontSize: 11,
        color: colors.cream,
        letterSpacing: 0.1,
        lineHeight: 15,
    },
    setupStepLabelDone: {
        color: colors.cdim,
        textDecorationLine: "line-through",
    },
    setupBtn: {
        backgroundColor: colors.gold,
        borderRadius: 10,
        paddingVertical: 11,
        alignItems: "center",
    },
    setupBtnText: {
        fontFamily: fonts.display,
        fontSize: 13,
        color: colors.navy,
        letterSpacing: -0.2,
    },
    // ── Auxstrology orbit card ────────────────────────────────────────
    auxCard: {
        backgroundColor: colors.navy,
        borderRadius: 16,
        overflow: "hidden",
        padding: 14,
    },
    auxInner: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
    },
    auxTextBlock: {
        flex: 1,
    },
    auxKicker: {
        fontFamily: fonts.mono,
        fontSize: 8.5,
        letterSpacing: 1.8,
        color: colors.gold,
        fontWeight: "700",
        marginBottom: 6,
    },
    auxTitle: {
        fontFamily: fonts.serif,
        fontSize: 22,
        color: colors.cream,
        lineHeight: 26,
        fontStyle: "italic",
        marginBottom: 6,
    },
    auxBody: {
        fontFamily: fonts.mono,
        fontSize: 10,
        color: colors.cdim,
        lineHeight: 14,
    },
    // ── Taste Profile card ────────────────────────────────────────────
    tasteCard: {
        backgroundColor: colors.paper,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.line,
        padding: 14,
    },
    tasteCardHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 12,
    },
    tasteCardKicker: {
        fontFamily: fonts.mono,
        fontSize: 9,
        letterSpacing: 1.4,
        color: colors.inkDim,
        fontWeight: "700",
    },
    tasteLoader: {
        marginVertical: 16,
    },
    genreRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginBottom: 8,
    },
    genreLabel: {
        fontFamily: fonts.mono,
        fontSize: 10,
        color: colors.inkSoft,
        width: 82,
    },
    genreBarTrack: {
        flex: 1,
        height: 6,
        backgroundColor: colors.bg,
        borderRadius: 3,
        overflow: "hidden",
    },
    genreBar: {
        height: 6,
        borderRadius: 3,
        opacity: 0.8,
    },
    genrePct: {
        fontFamily: fonts.mono,
        fontSize: 9.5,
        color: colors.inkDim,
        width: 26,
        textAlign: "right",
    },
    tasteEmpty: {
        fontFamily: fonts.mono,
        fontSize: 10.5,
        color: colors.inkDim,
        paddingVertical: 6,
    },
    // ── 2-col grid ────────────────────────────────────────────────────
    twoColRow: {
        flexDirection: "row",
        gap: 10,
    },
    twoColCard: {
        flex: 1,
        backgroundColor: colors.paper,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.line,
        padding: 12,
    },
    twoColKicker: {
        fontFamily: fonts.mono,
        fontSize: 8,
        letterSpacing: 1.4,
        color: colors.inkDim,
        fontWeight: "700",
        marginBottom: 10,
    },
    bucketRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginBottom: 7,
    },
    bucketLabel: {
        fontFamily: fonts.mono,
        fontSize: 9,
        color: colors.inkSoft,
        width: 36,
    },
    bucketBarTrack: {
        flex: 1,
        height: 7,
        backgroundColor: colors.bg,
        borderRadius: 3.5,
        overflow: "hidden",
    },
    bucketBar: {
        height: 7,
        borderRadius: 3.5,
    },
    bucketCount: {
        fontFamily: fonts.mono,
        fontSize: 9,
        color: colors.inkDim,
        width: 18,
        textAlign: "right",
    },
    statStack: {
        flex: 1,
        gap: 8,
    },
    bigStatNum: {
        fontFamily: fonts.display,
        fontSize: 26,
        color: colors.ink,
        letterSpacing: -0.5,
        lineHeight: 28,
    },
    bigStatLbl: {
        fontFamily: fonts.mono,
        fontSize: 8,
        color: colors.inkDim,
        letterSpacing: 1.2,
    },
    statStackDivider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.line,
    },
    // ── Your Activity cards ───────────────────────────────────────────
    activityKicker: {
        fontFamily: fonts.mono,
        color: colors.inkDim,
        fontSize: 9,
        letterSpacing: 1.8,
        fontWeight: "700",
        textTransform: "uppercase",
        marginBottom: 9,
        marginLeft: 2,
    },
    actCard: {
        backgroundColor: colors.paper,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: colors.line,
        padding: 14,
        marginBottom: 10,
        shadowColor: colors.ink,
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
    },
    actByline: {
        flexDirection: "row",
        alignItems: "center",
        gap: 9,
        marginBottom: 10,
    },
    actAvatar: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: colors.ink,
        alignItems: "center",
        justifyContent: "center",
    },
    actAvatarLetter: {
        fontFamily: fonts.display,
        fontSize: 12,
        color: "#fff",
        lineHeight: 14,
    },
    actBylineText: {
        fontSize: 11.5,
        color: colors.inkSoft,
    },
    actBylineName: {
        fontFamily: fonts.display,
        fontSize: 12,
        color: colors.ink,
    },
    actBylineTime: {
        fontFamily: fonts.mono,
        fontSize: 9,
        color: colors.inkDim,
        fontWeight: "700",
    },
    actMainRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    actSongBlock: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        minWidth: 0,
    },
    actCover: {
        width: 46,
        height: 46,
        borderRadius: 9,
        flexShrink: 0,
    },
    actCoverPlaceholder: {
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
    },
    actSongMeta: {
        flex: 1,
        minWidth: 0,
    },
    actTitle: {
        fontFamily: fonts.display,
        fontSize: 15,
        letterSpacing: -0.2,
        color: colors.ink,
        lineHeight: 17,
    },
    actArtist: {
        fontFamily: fonts.mono,
        fontSize: 10,
        color: colors.inkDim,
        marginTop: 2,
        letterSpacing: 0.1,
    },
    actChips: {
        flexDirection: "row",
        gap: 6,
        marginTop: 7,
        flexWrap: "wrap",
    },
    actChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 3,
    },
    actChipDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    actChipText: {
        fontFamily: fonts.mono,
        fontSize: 8,
        fontWeight: "700",
        letterSpacing: 0.5,
    },
    actRingWrap: {
        flexShrink: 0,
        position: "relative",
    },
    actRingCenter: {
        alignItems: "center",
        justifyContent: "center",
    },
    actRingScore: {
        fontFamily: fonts.display,
        fontSize: 16,
        letterSpacing: -0.3,
        lineHeight: 19,
    },
    actNote: {
        fontFamily: fonts.serif,
        fontStyle: "italic",
        fontSize: 12.5,
        color: colors.inkSoft,
        lineHeight: 17,
        marginTop: 11,
    },
    actActions: {
        alignItems: "flex-start",
        marginTop: 10,
    },
})

function visibilityLabel(visibility: Profile["visibility"]): string {
    if (visibility === "friends_only") return "FRIENDS"
    if (visibility === "only_me") return "PRIVATE"
    return "PUBLIC"
}
