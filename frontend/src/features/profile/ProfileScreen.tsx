// Profile tab — own profile with identity card, To LISTn shelf, taste & activity.
import { Fragment, useCallback, useEffect, useRef, useState } from "react"
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    type GestureResponderEvent,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useFocusEffect, useNavigation, useScrollToTop } from "@react-navigation/native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Svg, { Circle, Line, Path } from "react-native-svg"

import { ApiError } from "../../api/client"
import { AppStackParamList } from "../../navigation/types"
import { avatarColorToken, colors, fonts } from "../../theme"
import { formatRelativeTime } from "../../utils/formatRelativeTime"
import Avatar from "../../components/Avatar"
import { DriftingStars } from "../../components/DriftingStars"
import ActivityLikeButton from "../activity/ActivityLikeButton"
import { updateLikePrivacy } from "../activity/apiRequests"
import OwnActivitySheet from "../activity/OwnActivitySheet"
import RatingActivityCard from "../activity/RatingActivityCard"
import { useAuth } from "../auth/AuthContext"
import { getMyRankingByDeezerId, getMyRankingBySongId, removeRating } from "../rankings/apiRequests"
import {
    getMostCompatible, getMyAuxstrology, getMyProfile, getMyRecentRatings, getMyTasteProfile,
} from "./apiRequests"
import {
    AuxstrologyResponse, MostCompatibleItem, Profile, RecentRatingItem, TasteProfileResponse,
} from "./types"
import EndOfListCap from "../../components/EndOfListCap"
import MostCompatibleModule from "./MostCompatibleModule"
import { OwnStreakChip } from "./StreakBadge"
import TasteProfileGrid, { type TasteProfileOpenTile } from "./TasteProfileGrid"
import { type PopoverFrame } from "./TasteStripTile"
import TopGenresCard, { type TopGenresHandle } from "./TopGenresCard"

type ProfileNavigationProp = NativeStackNavigationProp<AppStackParamList, "MainTabs">
const POPOVER_TOUCH_SLOP = 8

// Constellation nodes + edges for the Auxstrology SVG (gold, in 80×80 viewBox)
const CONST_NODES: [number, number][] = [
    [18, 58], [36, 22], [52, 42], [68, 18], [62, 52], [30, 46], [52, 8],
]
const CONST_EDGES: [number, number][] = [[0, 1], [1, 2], [2, 3], [2, 4], [0, 4], [1, 5], [3, 6]]

// Star-field for the dark navy Auxstrology card backdrop. Hand-placed (not random)
// so dots stay clear of the right-hand text column and don't pile up at the bottom:
// a loose cluster around the constellation on the left, a strip across the top above
// the copy, and a few low dots below it. Coordinates are in a wide, short
// 100×30 viewBox so a `slice` fit barely crops.
const STAR_DOTS = [
    // around the constellation (left side)
    { x: 6, y: 5 }, { x: 15, y: 9 }, { x: 4, y: 17 }, { x: 21, y: 13 },
    { x: 12, y: 22 }, { x: 23, y: 20 }, { x: 17, y: 3 },
    // top strip, above the text column (fills the top, keeps the copy clear)
    { x: 38, y: 3.5 }, { x: 56, y: 2.5 }, { x: 74, y: 4 }, { x: 89, y: 3 },
    // low dots — one left, two in the bottom-right corner just below the body copy
    { x: 8, y: 26 }, { x: 68, y: 26.5 }, { x: 90, y: 27 },
].map((p, i) => ({
    x: p.x,
    y: p.y,
    r: i % 3 === 0 ? 1 : 0.6,
    o: 0.2 + (i % 4) * 0.08,
}))

// The Auxstrology card renders the same field a touch fainter than the setup checklist card.
const STAR_DOTS_DIM = STAR_DOTS.map((s) => ({ ...s, o: s.o * 0.8 }))

// Setup checklist "friends pending" state — once the rating steps are done the only step
// left is "Follow 3 friends", so we surface three glowing avatars top-right to point at it.
export default function ProfileScreen() {
    const navigation = useNavigation<ProfileNavigationProp>()
    const insets = useSafeAreaInsets()
    const { token } = useAuth()
    // Re-tapping the "You" tab while scrolled down jumps back to the top.
    const scrollRef = useRef<ScrollView>(null)
    const tasteProfileSectionRef = useRef<View>(null)
    const topGenresRef = useRef<TopGenresHandle>(null)
    // True while a finger is dragging the Top Genres bar, so page scroll is locked for that gesture.
    const [genreScrubbing, setGenreScrubbing] = useState(false)
    useScrollToTop(scrollRef)

    // Navigate immediately; Song Detail resolves the viewer's ranking so it offers Re-rate (not Rate).
    const handleActivitySongPress = (song: RecentRatingItem["song"]) => {
        navigation.navigate("SongDetail", { song: song as never })
    }

    const [profile, setProfile] = useState<Profile | null>(null)
    const [profileError, setProfileError] = useState<string | null>(null)
    const [taste, setTaste] = useState<TasteProfileResponse | null>(null)
    const [tasteLoading, setTasteLoading] = useState(false)
    const [aux, setAux] = useState<AuxstrologyResponse | null>(null)
    const [ratings, setRatings] = useState<RecentRatingItem[] | null>(null)
    const [mostCompatible, setMostCompatible] = useState<MostCompatibleItem[] | null>(null)
    const [openTasteTile, setOpenTasteTile] = useState<TasteProfileOpenTile>(null)
    const [tastePopoverFrame, setTastePopoverFrame] = useState<PopoverFrame | null>(null)
    const [tasteSectionFrame, setTasteSectionFrame] = useState<PopoverFrame | null>(null)
    // Three-dots options for your own activity cards (Re-rate / Reorder / Remove / like privacy).
    const [menuItem, setMenuItem] = useState<RecentRatingItem | null>(null)
    const [hideLikeCounts, setHideLikeCounts] = useState(false)
    const [isMutatingActivity, setIsMutatingActivity] = useState(false)

    const dismissTastePopover = useCallback(() => {
        setOpenTasteTile(null)
        setTastePopoverFrame(null)
    }, [])

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
                    setHideLikeCounts(data.hide_like_counts)
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

    useFocusEffect(
        useCallback(
            () => () => {
                dismissTastePopover()
                topGenresRef.current?.dismiss()
            },
            [dismissTastePopover],
        )
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

    // ── Your Activity three-dots actions ──────────────────────────────────
    const handleActivityReRate = async () => {
        const item = menuItem
        if (!item || !token) return
        setMenuItem(null)
        try {
            // Re-rate needs the full catalog song (isrc/artist ids); the ranking carries it.
            const ranking = item.song.deezer_id != null
                ? await getMyRankingByDeezerId(item.song.deezer_id, token)
                : await getMyRankingBySongId(item.song.id, token)
            navigation.navigate("BucketSelection", { song: ranking.song as never })
        } catch {
            navigation.navigate("BucketSelection", { song: item.song as never })
        }
    }

    const handleActivityReorder = () => {
        if (isNew) return // reorder stays locked until 10 ratings
        setMenuItem(null)
        navigation.navigate("Reorder")
    }

    const handleActivityRemove = () => {
        const item = menuItem
        if (!item || !token) return
        setMenuItem(null)
        Alert.alert(
            "Remove this song from your rankings? This cannot be undone.",
            undefined,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Remove",
                    style: "destructive",
                    onPress: async () => {
                        if (isMutatingActivity) return
                        setIsMutatingActivity(true)
                        try {
                            await removeRating(item.song.id, token)
                            setRatings((prev) => prev?.filter((r) => r.rating_event_id !== item.rating_event_id) ?? prev)
                        } catch {
                            // best effort — leave the card in place if the removal failed
                        } finally {
                            setIsMutatingActivity(false)
                        }
                    },
                },
            ],
        )
    }

    const handleToggleLikePrivacy = async () => {
        if (!token || isMutatingActivity) return
        const next = !hideLikeCounts
        setMenuItem(null)
        setIsMutatingActivity(true)
        try {
            const updated = await updateLikePrivacy(next, token)
            setHideLikeCounts(updated.hide_like_counts)
        } catch {
            // ignore — keep the previous value
        } finally {
            setIsMutatingActivity(false)
        }
    }

    const step1Done = ratedCount > 0
    const step2Done = ratedCount >= 10
    const step3Done = (profile?.following_count ?? 0) >= 3
    // The checklist stays up until every step is done — not just the 10-rating gate — so a user who
    // rates but never follows still sees the nudge. `friendsPending` is that home stretch: rating is
    // finished, only "Follow 3 friends" remains, so the CTA below switches from rating to finding people.
    const setupComplete = step2Done && step3Done
    const friendsPending = step2Done && !step3Done
    // Each setup step deep-links to where you complete it: the rating steps open Discover song
    // search, the follow step opens Discover user search.
    const goToDiscoverSearch = (searchMode: "songs" | "users") =>
        navigation.navigate("MainTabs", {
            screen: "Discover",
            params: { screen: "DiscoverHome", params: { focusSearch: true, searchMode } },
        })

    const bottomChromeInset = insets.bottom + 92

    const dismissTastePopoverForScreenTouch = (event: GestureResponderEvent) => {
        if (!openTasteTile) return false

        const { pageX, pageY } = event.nativeEvent
        const isInsideBottomChrome = pageY >= Dimensions.get("window").height - bottomChromeInset
        if (isInsideBottomChrome) return false

        const isInsidePopover = tastePopoverFrame
            ? pageX >= tastePopoverFrame.x - POPOVER_TOUCH_SLOP &&
                pageX <= tastePopoverFrame.x + tastePopoverFrame.w + POPOVER_TOUCH_SLOP &&
                pageY >= tastePopoverFrame.y - POPOVER_TOUCH_SLOP &&
                pageY <= tastePopoverFrame.y + tastePopoverFrame.h + POPOVER_TOUCH_SLOP
            : false
        const isInsideTasteSection = tasteSectionFrame
            ? pageX >= tasteSectionFrame.x &&
                pageX <= tasteSectionFrame.x + tasteSectionFrame.w &&
                pageY >= tasteSectionFrame.y &&
                pageY <= tasteSectionFrame.y + tasteSectionFrame.h
            : false

        if (isInsidePopover) {
            dismissTastePopover()
            return true
        }
        if (isInsideTasteSection) return false

        dismissTastePopover()
        return true
    }

    const updateTasteSectionFrame = () => {
        tasteProfileSectionRef.current?.measureInWindow((x, y, w, h) => {
            setTasteSectionFrame({ x, y, w, h })
        })
    }

    const topGenres = taste?.overall?.genres ?? []

    return (
        <>
        <ScrollView
            ref={scrollRef}
            style={styles.container}
            // Clear the raised center FAB by the same margin as the Feed: the cap (8) plus the
            // content view's own bottom padding (8) plus this leaves insets.bottom + 108 under the
            // last line, matching FeedScreen's listContent override below.
            contentContainerStyle={[styles.contentContainer, { paddingBottom: bottomChromeInset }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={!genreScrubbing}
            onStartShouldSetResponderCapture={dismissTastePopoverForScreenTouch}
            // Any touch reliably clears the genre tooltip and (outside its own tiles/popover) the
            // taste explainer too. onTouchStart fires for empty space, which the responder-capture
            // hook above does not reliably; the genre card ignores touches on its own bar and the
            // taste handler ignores touches on its own section, so both stay interactive.
            onTouchStart={(e) => {
                topGenresRef.current?.handleScreenTouch(e.nativeEvent.pageX, e.nativeEvent.pageY)
                dismissTastePopoverForScreenTouch(e)
            }}
            onScrollBeginDrag={() => {
                dismissTastePopover()
                topGenresRef.current?.dismiss()
            }}
        >
            {openTasteTile ? (
                <Pressable
                    style={[styles.tasteDismissLayer, { bottom: bottomChromeInset }]}
                    onPress={dismissTastePopover}
                    testID="taste-popover-dismiss-layer"
                />
            ) : null}
            {/* BO Header */}
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <View>
                        <Text style={styles.kicker}>LISTNING PROFILE</Text>
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
                            <Avatar
                                initial={profileInitial}
                                color={avatarColorToken(profile?.avatar_color, colors.ink)}
                                size={50}
                                testID="profile-star-avatar"
                            />
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
                    {/* Setup checklist — shown until every step (10 ratings + 3 follows) is done */}
                    {!setupComplete && (
                        <View style={styles.setupCard}>
                            <DriftingStars dots={STAR_DOTS} viewBox="0 0 100 100" />
                            <View style={styles.setupHeaderRow}>
                                <Text style={styles.setupKicker}>SET UP YOUR PROFILE</Text>
                            </View>
                            <View style={styles.setupSteps}>
                                {([
                                    ["Rate your first song", step1Done, () => goToDiscoverSearch("songs")],
                                    ["Rate 10 songs to unlock Rankings and Taste Profile", step2Done, () => goToDiscoverSearch("songs")],
                                    ["Follow 3 friends", step3Done, () => goToDiscoverSearch("users")],
                                ] as [string, boolean, () => void][]).map(([label, done, onPress], i) => (
                                    <TouchableOpacity
                                        key={i}
                                        style={styles.setupStep}
                                        onPress={onPress}
                                        disabled={done}
                                        activeOpacity={0.7}
                                    >
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
                                    </TouchableOpacity>
                                ))}
                            </View>
                            {/* Once rating is done (friends-pending), the CTA switches from rating a
                                song to finding people to follow — the last remaining setup step. */}
                            <TouchableOpacity
                                style={styles.setupBtn}
                                onPress={() => goToDiscoverSearch(friendsPending ? "users" : "songs")}
                            >
                                <Text style={styles.setupBtnText}>
                                    {friendsPending ? "Find friends" : "Rate a song"}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Auxstrology orbit card */}
                    <View style={styles.auxCard}>
                        <DriftingStars dots={STAR_DOTS_DIM} viewBox="0 0 100 30" />
                        {!aux || aux.status === "locked" || !aux.sign ? (
                            // Locked / new-user state — Claude Design "Profile · New user
                            // (empty)": gold constellation on the LEFT, taste copy on the RIGHT.
                            <View style={styles.auxInnerLocked}>
                                <Svg width={64} height={64} viewBox="0 0 80 80" opacity={0.5}>
                                    {CONST_EDGES.map(([a, b], i) => (
                                        <Line
                                            key={`edge-${i}`}
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
                                            key={`node-${i}`}
                                            cx={x}
                                            cy={y}
                                            r={i === 1 ? 3 : 2}
                                            fill={colors.gold}
                                            opacity={0.9}
                                        />
                                    ))}
                                </Svg>
                                <View style={styles.auxTextBlock}>
                                    <Text style={styles.auxKicker}>AUXSTROLOGY</Text>
                                    <Text style={styles.auxTitleLocked}>Locked for now</Text>
                                    <Text style={styles.auxBodyLocked}>
                                        Rate songs and we'll name your sound — your genres, moods & quirks.
                                    </Text>
                                </View>
                            </View>
                        ) : (
                            <View style={styles.auxInner}>
                                <View style={styles.auxTextBlock}>
                                    <Text style={styles.auxKicker}>AUXSTROLOGY</Text>
                                    <Text style={styles.auxTitle}>
                                        {aux.sign.name.replace(/^The /, "The\n")}
                                    </Text>
                                    <Text style={styles.auxBody}>
                                        {aux.caption ?? aux.sign.summary}
                                    </Text>
                                </View>
                                <Svg
                                    width={72}
                                    height={72}
                                    viewBox="0 0 80 80"
                                    opacity={0.9}
                                >
                                    {CONST_EDGES.map(([a, b], i) => (
                                        <Line
                                            key={`edge-${i}`}
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
                                            key={`node-${i}`}
                                            cx={x}
                                            cy={y}
                                            r={i === 1 ? 3 : 2}
                                            fill={colors.gold}
                                            opacity={0.9}
                                        />
                                    ))}
                                </Svg>
                            </View>
                        )}
                    </View>

                    {/* Taste Profile strip: a skeleton preview of the tiles until 10 ratings, then the live tiles. */}
                    {isNew ? (
                        <View style={styles.stripCard}>
                            <Text style={styles.stripKicker}>TASTE PROFILE</Text>
                            <View style={styles.stripRow}>
                                {["RANGE", "TOP ARTIST", "SELECTIVITY"].map((lbl, i) => (
                                    <Fragment key={lbl}>
                                        {i > 0 && <View style={styles.stripDivider} />}
                                        <View style={styles.stripTile}>
                                            <Text style={styles.stripLabel}>{lbl}</Text>
                                            <Text style={styles.stripLockedValue}>—</Text>
                                        </View>
                                    </Fragment>
                                ))}
                            </View>
                            <View style={styles.stripLockedCaptionRow}>
                                <Svg width={9} height={9} viewBox="0 0 24 24" fill="none">
                                    <Path
                                        d="M8 11V7a4 4 0 0 1 8 0v4"
                                        stroke={colors.inkDim}
                                        strokeWidth={2.2}
                                        strokeLinecap="round"
                                    />
                                    <Path
                                        d="M6 11h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z"
                                        fill={colors.inkDim}
                                    />
                                </Svg>
                                <Text style={styles.stripLockedCaption}>Unlocks at 10 ratings</Text>
                            </View>
                        </View>
                    ) : (
                        <View
                            ref={tasteProfileSectionRef}
                            collapsable={false}
                            onLayout={updateTasteSectionFrame}
                            style={openTasteTile ? styles.tasteProfileSectionOpen : null}
                        >
                            <Text style={styles.stripKicker}>TASTE PROFILE</Text>
                            {tasteLoading ? (
                                <ActivityIndicator color={colors.accent} style={styles.tasteLoader} />
                            ) : taste ? (
                                <TasteProfileGrid
                                    taste={taste}
                                    isOwn
                                    openTile={openTasteTile}
                                    onOpenTileChange={(next) => {
                                        // Opening a taste tile closes the genre tooltip so only one is up.
                                        if (next) topGenresRef.current?.dismiss()
                                        setOpenTasteTile(next)
                                    }}
                                    onPopoverFrameChange={setTastePopoverFrame}
                                    popoverViewportBottomInset={bottomChromeInset}
                                />
                            ) : null}
                        </View>
                    )}

                    {/* Top genres (full users only) — shared card with the other-profile screen,
                        labelled externally like every other section (Bento Orbit Layout H). */}
                    {!isNew && (
                        <View>
                            <Text style={styles.stripKicker}>TOP GENRES</Text>
                            <TopGenresCard
                                ref={topGenresRef}
                                genres={topGenres}
                                loading={tasteLoading}
                                emptyText="Rate more songs to see your top genres."
                                onScrubbingChange={(scrubbing) => {
                                    setGenreScrubbing(scrubbing)
                                    if (scrubbing) dismissTastePopover()
                                }}
                            />
                        </View>
                    )}

                    {/* Compatibility */}
                    <MostCompatibleModule
                        users={mostCompatible}
                        isLoading={mostCompatible === null}
                        onUserPress={(username) => navigation.navigate("OtherProfile", { username })}
                        onViewAll={() => navigation.navigate("MostCompatible")}
                    />

                    {/* Your Activity — feed-style cards. For a brand-new user with no ratings the
                        "Your Activity" label and cards drop out, but the end cap stays so the bottom
                        of the profile still reads as a finished edge. */}
                    {ratings !== null && (
                        <View>
                            {ratings.length > 0 && (
                            <>
                            <Text style={styles.activityKicker}>Your Activity</Text>
                            {/* Pull the cards out to a 14px screen inset so they match the Feed cards
                                exactly (the surrounding content padding is 16). */}
                            <View style={styles.activityCards}>
                            {ratings.map((item) => (
                                <RatingActivityCard
                                    key={item.rating_event_id}
                                    initial={profileInitial}
                                    avatarColor={avatarColorToken(profile?.avatar_color, colors.ink)}
                                    who="You"
                                    actionLabel="rated"
                                    timeAgo={formatRelativeTime(item.created_at)}
                                    song={item.song}
                                    bucket={item.bucket}
                                    score={item.score}
                                    hideScore={isNew}
                                    note={item.note}
                                    onPress={() => handleActivitySongPress(item.song)}
                                    onShare={() => navigation.navigate("ShareActivity", {
                                        activity: {
                                            username: profile?.username ?? "",
                                            initial: profileInitial,
                                            avatarColor: avatarColorToken(profile?.avatar_color, colors.ink),
                                            actionLabel: "rated",
                                            timeAgo: formatRelativeTime(item.created_at),
                                            song: item.song,
                                            bucket: item.bucket,
                                            score: item.score,
                                            hideScore: isNew,
                                            note: item.note,
                                        },
                                    })}
                                    shareTestID={`activity-share-${item.rating_event_id}`}
                                    onOptions={() => setMenuItem(item)}
                                    optionsTestID={`activity-options-${item.rating_event_id}`}
                                    testID={`activity-card-${item.rating_event_id}`}
                                >
                                    <ActivityLikeButton
                                        ratingEventId={item.rating_event_id}
                                        initialLikedByViewer={item.liked_by_viewer}
                                        initialLikeCount={item.like_count}
                                        onOpenLikers={openActivityLikers}
                                    />
                                </RatingActivityCard>
                            ))}
                            </View>
                            </>
                            )}
                            <EndOfListCap label="End of your activity" />
                        </View>
                    )}
                </View>
            )}
        </ScrollView>

        <OwnActivitySheet
            visible={menuItem !== null}
            songTitle={menuItem?.song.title}
            reorderLocked={isNew}
            hideLikeCounts={hideLikeCounts}
            onReRate={handleActivityReRate}
            onReorder={handleActivityReorder}
            onRemove={handleActivityRemove}
            onToggleLikePrivacy={handleToggleLikePrivacy}
            onClose={() => setMenuItem(null)}
        />
        </>
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
        position: "relative",
    },
    // ── Header ────────────────────────────────────────────────────────
    header: {
        paddingHorizontal: 16,
        paddingTop: 60,
        paddingBottom: 8,
    },
    headerTop: {
        flexDirection: "row",
        // Align the streak chip + settings icon with the title ("You"), not the
        // small kicker label above it.
        alignItems: "flex-end",
        justifyContent: "space-between",
        marginBottom: 20,
    },
    headerActions: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
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
        // lineHeight clears the display font's descender (kept consistent across
        // all screen titles); 29 (< fontSize) clipped descenders like "g".
        lineHeight: 36,
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
        // Even spacing matching the design: a gap on both sides of each stretch divider, with the
        // number + label inline (so a wide label can't add trailing slack the way a stacked layout did).
        gap: 14,
    },
    statInlineDivider: {
        width: 1,
        alignSelf: "stretch",
        backgroundColor: colors.line,
    },
    statInlineBtn: {
        flexDirection: "row",
        alignItems: "baseline",
        gap: 4,
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
        paddingTop: 2,
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
        // Completed ticks glow mint so "done" reads uniformly across the finished steps.
        shadowColor: colors.mint,
        shadowOpacity: 0.6,
        shadowRadius: 5,
        shadowOffset: { width: 0, height: 0 },
        elevation: 4,
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
    // Locked / new-user Auxstrology card (constellation left, copy right).
    auxInnerLocked: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    auxTitleLocked: {
        // serifItalic is the real italic face — RN won't synthesize italics for Fraunces.
        fontFamily: fonts.serifItalic,
        fontSize: 17,
        color: colors.cream,
        lineHeight: 20,
        marginBottom: 4,
    },
    auxBodyLocked: {
        // Sans body (fonts.sans is the system face) to match the design's softer copy.
        fontFamily: fonts.sans,
        fontSize: 11,
        color: colors.cdim,
        lineHeight: 15,
    },
    // ── Taste Profile card ────────────────────────────────────────────
    tasteLoader: {
        marginVertical: 16,
    },
    tasteProfileSectionOpen: {
        zIndex: 80,
        elevation: 80,
    },
    tasteDismissLayer: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 70,
        elevation: 70,
    },
    // ── Taste Profile strip ───────────────────────────────────────────
    stripCard: {
        backgroundColor: colors.paper,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.line,
        padding: 14,
    },
    stripKicker: {
        fontFamily: fonts.mono,
        fontSize: 9,
        letterSpacing: 1.4,
        color: colors.inkDim,
        fontWeight: "700",
        marginBottom: 6,
    },
    stripLockedValue: {
        fontFamily: fonts.display,
        fontSize: 15,
        color: colors.inkDim,
        marginTop: 2,
    },
    stripLockedCaptionRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        marginTop: 12,
    },
    stripLockedCaption: {
        fontFamily: fonts.mono,
        fontSize: 9,
        letterSpacing: 0.6,
        color: colors.inkDim,
    },
    stripRow: {
        flexDirection: "row",
        alignItems: "center",
    },
    stripTile: {
        flex: 1,
        gap: 4,
    },
    stripDivider: {
        width: 1,
        alignSelf: "stretch",
        backgroundColor: colors.line,
        marginHorizontal: 10,
    },
    stripLabel: {
        fontFamily: fonts.mono,
        fontSize: 8.5,
        letterSpacing: 1,
        color: colors.inkDim,
        fontWeight: "700",
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
    // Cancels 2px of the content's 16px padding so cards sit at a 14px inset, matching the Feed.
    activityCards: {
        marginHorizontal: -2,
    },
})

function visibilityLabel(visibility: Profile["visibility"]): string {
    if (visibility === "friends_only") return "FRIENDS"
    if (visibility === "only_me") return "PRIVATE"
    return "PUBLIC"
}
