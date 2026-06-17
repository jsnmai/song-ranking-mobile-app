// Feed tab — shows rating activity from users the current user follows.
import { useCallback, useEffect, useRef, useState } from "react"
import {
    ActivityIndicator,
    Dimensions,
    Image,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native"
import type { GestureResponderEvent } from "react-native"
import { FlashList, FlashListRef } from "@shopify/flash-list"
import { CompositeNavigationProp, useNavigation, useScrollToTop } from "@react-navigation/native"
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"
import Svg, { Circle, Ellipse, Path, Polygon, Polyline } from "react-native-svg"

import { ApiError } from "../../api/client"
import { AppStackParamList, FeedStackParamList, TabParamList } from "../../navigation/types"
import { colors, fonts, bucketColor } from "../../theme"
import { formatRelativeTime } from "../../utils/formatRelativeTime"
import ActivityLikeButton from "../activity/ActivityLikeButton"
import { updateLikePrivacy } from "../activity/apiRequests"
import { useAuth } from "../auth/AuthContext"
import { ProfileBase, ReportReason } from "../profile/types"
import { RankingResponse } from "../comparison/types"
import { getMyRankingByDeezerId } from "../rankings/apiRequests"
import { getSongCircleRaters, listMyFeed, reportRatingEvent } from "./apiRequests"
import { FeedEvent } from "./types"

type FeedNavigation = CompositeNavigationProp<
    NativeStackNavigationProp<FeedStackParamList, "FeedHome">,
    CompositeNavigationProp<
        BottomTabNavigationProp<TabParamList, "Feed">,
        NativeStackNavigationProp<AppStackParamList>
    >
>

const DAY_ABBRS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]

// Width of the activity-options popover that springs from the "···" button.
const LIKE_MENU_WIDTH = 236

const REPORT_REASONS: readonly { value: ReportReason; label: string }[] = [
    { value: "harassment", label: "Harassment" },
    { value: "hate_or_abuse", label: "Hate or abuse" },
    { value: "impersonation", label: "Impersonation" },
    { value: "inappropriate_content", label: "Inappropriate content" },
    { value: "spam", label: "Spam" },
    { value: "under_13", label: "Under 13" },
    { value: "other", label: "Other" },
]

const ORBIT_STARS = [
    { x: 7, y: 10, r: 1.1, o: 0.55 },
    { x: 18, y: 22, r: 0.7, o: 0.30 },
    { x: 32, y: 6, r: 0.9, o: 0.45 },
    { x: 47, y: 15, r: 1.3, o: 0.35 },
    { x: 63, y: 8, r: 0.6, o: 0.50 },
    { x: 78, y: 20, r: 1.0, o: 0.40 },
    { x: 88, y: 12, r: 0.8, o: 0.55 },
    { x: 93, y: 35, r: 1.2, o: 0.30 },
    { x: 5, y: 55, r: 0.7, o: 0.40 },
    { x: 15, y: 72, r: 1.0, o: 0.35 },
    { x: 25, y: 88, r: 0.9, o: 0.45 },
    { x: 42, y: 80, r: 1.4, o: 0.30 },
    { x: 60, y: 90, r: 0.7, o: 0.50 },
    { x: 75, y: 82, r: 1.1, o: 0.35 },
    { x: 87, y: 75, r: 0.8, o: 0.45 },
    { x: 95, y: 60, r: 1.2, o: 0.30 },
    { x: 70, y: 42, r: 0.6, o: 0.55 },
    { x: 55, y: 55, r: 0.5, o: 0.25 },
] as const

// Ring arc constants for feed event album art
const RING_SIZE = 84
const RING_CX = 42
const RING_CY = 42
const RING_R = 31
const RING_C = 2 * Math.PI * RING_R
const RING_ARC = (290 / 360) * RING_C  // 290° colored arc
const RING_GAP = RING_C - RING_ARC      // 70° gap at bottom

const FRIEND_AVATARS = [
    { id: 1, initial: "M", color: colors.accent },
    { id: 2, initial: "T", color: colors.sky },
    { id: 3, initial: "K", color: colors.mint },
    { id: 4, initial: "J", color: colors.plum },
] as const

function GhostRow() {
    return (
        <View style={styles.ghostRow}>
            <View style={styles.ghostAva} />
            <View style={styles.ghostCover} />
            <View style={styles.ghostText}>
                <View style={styles.ghostLine1} />
                <View style={styles.ghostLine2} />
            </View>
            <View style={styles.ghostScore} />
        </View>
    )
}

function LockIcon({ color, size = 14 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z" />
            <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </Svg>
    )
}

function EyeOffIcon({ color, size = 16 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
            <Path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
            <Path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
            <Path d="M2 2l20 20" />
        </Svg>
    )
}

function EyeIcon({ color, size = 16 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
            <Circle cx={12} cy={12} r={3} />
        </Svg>
    )
}

function SearchIcon() {
    return (
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none"
            stroke={colors.inkSoft} strokeWidth={1.9} strokeLinecap="round">
            <Circle cx={11} cy={11} r={7} />
            <Path d="m20 20-3.4-3.4" />
        </Svg>
    )
}

export default function FeedScreen() {
    const navigation = useNavigation<FeedNavigation>()
    const { token, profile, refreshProfile } = useAuth()
    const avatarInitial = (profile?.display_name || profile?.username || "?").charAt(0).toUpperCase()
    const [events, setEvents] = useState<FeedEvent[]>([])
    const [nextCursor, setNextCursor] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const [openingEventId, setOpeningEventId] = useState<number | null>(null)
    const [reportingEventId, setReportingEventId] = useState<number | null>(null)
    const [reportReason, setReportReason] = useState<ReportReason | null>(null)
    const [reportDetails, setReportDetails] = useState("")
    const [isReporting, setIsReporting] = useState(false)
    const [reportedEventId, setReportedEventId] = useState<number | null>(null)
    const [reportError, setReportError] = useState<string | null>(null)
    const [likePrivacyEventId, setLikePrivacyEventId] = useState<number | null>(null)
    const [likePrivacyAnchor, setLikePrivacyAnchor] = useState<{ top: number; right: number } | null>(null)
    const [isSavingLikePrivacy, setIsSavingLikePrivacy] = useState(false)
    const [likePrivacyError, setLikePrivacyError] = useState<string | null>(null)
    const [hideLikeCounts, setHideLikeCounts] = useState(profile?.hide_like_counts ?? false)
    const [error, setError] = useState<string | null>(null)
    const [friendsCardDismissed, setFriendsCardDismissed] = useState(false)
    const [heroRaters, setHeroRaters] = useState<ProfileBase[]>([])
    const listRef = useRef<FlashListRef<FeedEvent>>(null)
    // Re-pressing the Feed tab while already on the Feed home screen scrolls the
    // activity list back to the top. useScrollToTop only fires when this screen is
    // focused and is the first route in the stack, so it leaves the tab bar's
    // popToTop (returning from a pushed profile/list) untouched.
    useScrollToTop(listRef)

    const loadFeed = useCallback(async (
        cursor: string | null,
        shouldReplace: boolean,
    ) => {
        if (!token) return
        if (shouldReplace) {
            setIsLoading(true)
        } else {
            setIsLoadingMore(true)
        }
        setError(null)
        try {
            const response = await listMyFeed(token, cursor ?? undefined)
            if (shouldReplace) {
                setEvents(response.events)
            } else {
                setEvents((cur) => [...cur, ...response.events])
            }
            setNextCursor(response.next_cursor)
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.detail)
            } else if (err instanceof Error) {
                setError(err.message)
            } else {
                setError("Feed is temporarily unavailable.")
            }
        } finally {
            setIsLoading(false)
            setIsLoadingMore(false)
        }
    }, [token])

    const handleLoadMore = () => {
        if (!nextCursor || isLoading || isLoadingMore) return
        loadFeed(nextCursor, false)
    }

    const handleFindUsers = () => {
        navigation.navigate("Discover", { screen: "DiscoverHome", params: { focusSearch: true, searchMode: "users" } })
    }

    const handleActorPress = (event: FeedEvent) => {
        if (reportingEventId !== null) return
        if (event.actor_profile.user_id === profile?.user_id) {
            navigation.navigate("Profile")
        } else {
            navigation.navigate("OtherProfile", { username: event.actor_profile.username })
        }
    }

    const handleSongPress = async (event: FeedEvent) => {
        if (!token || openingEventId !== null || reportingEventId !== null) return
        setOpeningEventId(event.id)
        setError(null)
        try {
            const ranking: RankingResponse = await getMyRankingByDeezerId(event.song.deezer_id, token)
            navigation.navigate("SongDetail", { ranking })
        } catch (err) {
            if (err instanceof ApiError && err.status === 404) {
                navigation.navigate("SongDetail", { song: event.song })
                return
            }
            if (err instanceof ApiError) {
                setError(err.detail)
            } else if (err instanceof Error) {
                setError(err.message)
            } else {
                setError("Could not open this song.")
            }
        } finally {
            setOpeningEventId(null)
        }
    }

    const openReport = (eventId: number) => {
        setReportingEventId(eventId)
        setReportReason(null)
        setReportDetails("")
        setReportError(null)
        setReportedEventId(null)
    }

    const openActivityLikers = (ratingEventId: number) => {
        navigation.navigate("ActivityLikers", { ratingEventId })
    }

    const toggleLikePrivacyMenu = (eventId: number, event?: GestureResponderEvent) => {
        if (isSavingLikePrivacy) return
        // Tapping the same row's "···" again closes the open menu.
        if (likePrivacyEventId === eventId) {
            setLikePrivacyEventId(null)
            return
        }
        // Anchor the popover to where the "···" was tapped so it appears to spring from the button.
        const { width, height } = Dimensions.get("window")
        const pageX = event?.nativeEvent?.pageX ?? width - 24
        const pageY = event?.nativeEvent?.pageY ?? 240
        const right = Math.min(Math.max(width - pageX, 12), Math.max(12, width - LIKE_MENU_WIDTH - 12))
        const top = Math.min(pageY + 12, height - 200)
        setReportingEventId(null)
        setReportError(null)
        setLikePrivacyError(null)
        setLikePrivacyAnchor({ top, right })
        setLikePrivacyEventId(eventId)
    }

    const closeLikePrivacyMenu = () => {
        if (isSavingLikePrivacy) return
        setLikePrivacyEventId(null)
        setLikePrivacyError(null)
    }

    const closeReport = () => {
        if (isReporting) return
        setReportingEventId(null)
        setReportReason(null)
        setReportDetails("")
        setReportError(null)
    }

    const toggleLikePrivacy = async () => {
        if (!token || isSavingLikePrivacy) return
        const nextValue = !hideLikeCounts
        setIsSavingLikePrivacy(true)
        setLikePrivacyError(null)
        try {
            const updated = await updateLikePrivacy(nextValue, token)
            setHideLikeCounts(updated.hide_like_counts)
            await refreshProfile()
        } catch (err) {
            if (err instanceof ApiError) {
                setLikePrivacyError(err.detail)
            } else if (err instanceof Error) {
                setLikePrivacyError(err.message)
            } else {
                setLikePrivacyError("Could not update like privacy.")
            }
        } finally {
            setIsSavingLikePrivacy(false)
        }
    }

    const submitReport = async (eventId: number) => {
        if (!token || reportReason === null || isReporting) return
        setIsReporting(true)
        setReportError(null)
        try {
            await reportRatingEvent(eventId, {
                target_type: "rating_note",
                reason: reportReason,
                details: reportDetails,
            }, token)
            setReportedEventId(eventId)
            setReportingEventId(null)
            setReportReason(null)
            setReportDetails("")
        } catch (err) {
            if (err instanceof ApiError) {
                setReportError(err.detail)
            } else if (err instanceof Error) {
                setReportError(err.message)
            } else {
                setReportError("Could not submit report.")
            }
        } finally {
            setIsReporting(false)
        }
    }

    const gettingStartedComplete = (profile?.user_stats?.rated_count ?? 0) >= 10
    // Recent Verdict module: feature the freshest verdict from someone the viewer follows
    // (skip the viewer's own events). Falls back to the locked teaser when there's none yet.
    const heroEvent = events.find((e) => e.actor_profile.user_id !== profile?.user_id) ?? null
    const heroSongId = heroEvent?.song.id ?? null

    // Fetch the circle members (mutual follows, visible) who rate the featured song so the
    // Recent Verdict hero can show their avatars next to the song's total LISTn rating count.
    useEffect(() => {
        if (!token || heroSongId === null) {
            setHeroRaters([])
            return
        }
        let active = true
        getSongCircleRaters(heroSongId, token)
            .then((res) => { if (active) setHeroRaters(res.raters) })
            .catch(() => { if (active) setHeroRaters([]) })
        return () => { active = false }
    }, [token, heroSongId])

    // Tapping the hero scrolls down to the same verdict's card in the activity list.
    const scrollToHeroActivity = () => {
        if (heroEvent === null) return
        const index = events.findIndex((e) => e.id === heroEvent.id)
        if (index < 0) return
        listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0 })
    }

    const renderRecentVerdict = () => {
        if (heroEvent === null) {
            // While still getting started (rated < 10), the compact "Recent Verdicts" row in the
            // UNLOCKING SOON list already represents the locked state — don't double up with a top
            // teaser. Once rated >= 10 (no compact list), the full locked teaser shows here instead.
            if (!gettingStartedComplete) return null
            // Locked teaser — shown until a followed user has a visible verdict.
            return (
                <View style={styles.fvOuter}>
                    <View style={styles.fvInner}>
                        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
                            {ORBIT_STARS.map((s, i) => (
                                <Circle key={i} cx={`${s.x}%`} cy={`${s.y}%`} r={s.r} fill="white" fillOpacity={s.o * 0.7} />
                            ))}
                        </Svg>
                        <View style={{ position: "relative" }}>
                            <View style={styles.fullCellTop}>
                                <View style={styles.fvPill}><Text style={styles.fvPillText}>Recent verdict</Text></View>
                                <View style={styles.lockTagRow}>
                                    <LockIcon color="rgba(255,255,255,0.85)" size={10} />
                                    <Text style={styles.lockTagLabel}>LOCKED</Text>
                                </View>
                            </View>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12 }}>
                                <View style={styles.lockDotXl}><LockIcon color="#fff" size={24} /></View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.lvLockedTitle}>Locked for now</Text>
                                    <Text style={styles.lvLockedBody}>Follow friends to see their freshest ratings.</Text>
                                </View>
                            </View>
                        </View>
                    </View>
                    <View style={styles.fvFooter}>
                        <View style={{ flex: 1 }}>
                            <View style={[styles.skBar, { width: "48%", height: 11, backgroundColor: "rgba(17,19,28,0.12)" }]} />
                            <View style={[styles.skBar, { width: "30%", height: 7, backgroundColor: "rgba(17,19,28,0.08)", marginTop: 6 }]} />
                        </View>
                        <Text style={styles.fvHint}>FOLLOW TO UNLOCK</Text>
                    </View>
                </View>
            )
        }

        const bColor = bucketColor(heroEvent.new_bucket)
        const bucketLabel = heroEvent.new_bucket === "alright" ? "OKAY" : heroEvent.new_bucket.toUpperCase()
        const totalRatings = heroEvent.song.global_rating_count
        const shownRaters = heroRaters.slice(0, 4)

        return (
            <View style={styles.fvOuter} testID={`feed-recent-verdict-${heroEvent.id}`}>
                {/* Navy hero — tapping it scrolls down to this verdict's activity card. */}
                <TouchableOpacity
                    style={styles.verdictInner}
                    activeOpacity={0.9}
                    onPress={scrollToHeroActivity}
                    accessibilityLabel="Scroll to this verdict in your activity"
                    testID={`feed-verdict-scroll-${heroEvent.id}`}
                >
                    {/* Album art is the hero background; a dark scrim keeps the text legible. */}
                    {heroEvent.song.cover_url ? (
                        <Image
                            source={{ uri: heroEvent.song.cover_url }}
                            style={StyleSheet.absoluteFill}
                            resizeMode="cover"
                        />
                    ) : null}
                    <View style={[StyleSheet.absoluteFill, styles.verdictScrim]} />
                    <View style={{ position: "relative" }}>
                        <View style={styles.fullCellTop}>
                            <View style={[styles.verdictPill, { backgroundColor: bColor }]}>
                                <Text style={styles.verdictPillText}>
                                    Recent verdict · {formatRelativeTime(heroEvent.created_at)}
                                </Text>
                            </View>
                            {/* Top-right: circle raters of this song + total LISTn rating count. */}
                            <View style={styles.ratersRow}>
                                {shownRaters.length > 0 && (
                                    <View style={styles.ratersStack}>
                                        {shownRaters.map((r, i) => (
                                            <View
                                                key={r.user_id}
                                                style={[
                                                    styles.raterAvatar,
                                                    { backgroundColor: avatarColor(r.username), marginLeft: i > 0 ? -7 : 0 },
                                                ]}
                                            >
                                                <Text style={styles.raterInitial}>
                                                    {(r.display_name || r.username)[0].toUpperCase()}
                                                </Text>
                                            </View>
                                        ))}
                                    </View>
                                )}
                                {totalRatings > 0 && (
                                    <Text style={styles.ratersCount}>{totalRatings} RATED</Text>
                                )}
                            </View>
                        </View>
                        <View style={styles.verdictBody}>
                            <Text style={styles.verdictScore}>{heroEvent.new_score.toFixed(1)}</Text>
                            <View style={styles.verdictMetaCol}>
                                <Text style={styles.verdictWho} numberOfLines={1}>
                                    @{heroEvent.actor_profile.username.toUpperCase()} · {bucketLabel}
                                </Text>
                                <Text style={styles.verdictNote} numberOfLines={2} ellipsizeMode="tail">
                                    "{heroEvent.note || "Fresh from your circle."}"
                                </Text>
                            </View>
                        </View>
                    </View>
                </TouchableOpacity>
                {/* Footer — "Rate this" opens the song page. */}
                <TouchableOpacity
                    style={styles.verdictFooter}
                    activeOpacity={0.7}
                    onPress={() => handleSongPress(heroEvent)}
                    disabled={openingEventId !== null}
                    testID={`feed-verdict-rate-${heroEvent.id}`}
                >
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.verdictSongTitle} numberOfLines={1}>{heroEvent.song.title}</Text>
                        <Text style={styles.verdictSongArtist} numberOfLines={1}>{heroEvent.song.artist.toUpperCase()}</Text>
                    </View>
                    {openingEventId === heroEvent.id ? (
                        <ActivityIndicator color={colors.accent} size="small" />
                    ) : (
                        <Text style={styles.verdictRate}>RATE THIS ↗</Text>
                    )}
                </TouchableOpacity>
            </View>
        )
    }

    // Recent Verdict is rendered separately (not gated by rated>=10); this section is the rest.
    const renderUnlockedSection = () => (
        <View style={styles.unlockedSection}>
            {/* Row: Split (locked) + Consensus (locked, 138px) */}
            <View style={styles.fullRow}>
                {/* Split Decision */}
                <View style={[styles.fullCell, { height: 138, backgroundColor: "#000" }]}>
                    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none">
                        <Polygon points="0,0 100,0 0,100" fill={colors.plum} />
                        <Polygon points="100,0 100,100 0,100" fill={colors.accent} />
                    </Svg>
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(13,15,23,0.5)" }]} />
                    <View style={[styles.fullCellPad, { justifyContent: "space-between" }]}>
                        <View style={styles.fullCellTop}>
                            <View style={styles.darkPill}><Text style={styles.darkPillText}>Split</Text></View>
                            <View style={styles.lockTagRow}>
                                <LockIcon color="rgba(255,255,255,0.85)" size={10} />
                                <Text style={styles.lockTagLabel}>LOCKED</Text>
                            </View>
                        </View>
                        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8 }}>
                            <View style={styles.lockDotLg}><LockIcon color="#fff" size={18} /></View>
                            <Text style={styles.fullLockHint}>When two friends split on a song</Text>
                        </View>
                    </View>
                </View>

                {/* Consensus — locked, 138px */}
                <View style={[styles.fullCell, { height: 138, backgroundColor: colors.sky }]}>
                    <View style={[styles.fullCellPad, { justifyContent: "space-between" }]}>
                        <View style={styles.fullCellTop}>
                            <View style={styles.lightPill}><Text style={styles.lightPillText}>Consensus</Text></View>
                            <View style={styles.lockTagRow}>
                                <LockIcon color="rgba(255,255,255,0.85)" size={10} />
                                <Text style={styles.lockTagLabel}>LOCKED</Text>
                            </View>
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                            <View style={styles.lockDotLg}><LockIcon color="#fff" size={18} /></View>
                            <Text style={[styles.lockCardDesc, { flex: 1 }]}>How your circle scores a track</Text>
                        </View>
                        <View>
                            <View style={styles.consensusFullBars}>
                                {[4, 6, 9, 13, 16, 12, 7, 4].map((h, i) => (
                                    <View key={i} style={[styles.fullConsBar, { height: h }]} />
                                ))}
                            </View>
                            <View style={[styles.skBar, { width: "62%", height: 9, backgroundColor: "rgba(255,255,255,0.3)", marginTop: 5 }]} />
                        </View>
                    </View>
                </View>
            </View>

            {/* Row: Re-rate Radar (locked, 150px) + Match Moment (locked, 150px) */}
            <View style={styles.fullRow}>
                {/* Re-rate Radar */}
                <View style={[styles.fullCell, { height: 150, backgroundColor: colors.navy }]}>
                    <View style={[styles.fullCellPad, { justifyContent: "space-between" }]}>
                        <View style={styles.fullCellTop}>
                            <View style={styles.goldPill}><Text style={styles.goldPillText}>Re-rate radar</Text></View>
                            <View style={styles.lockTagRow}>
                                <LockIcon color="rgba(255,255,255,0.85)" size={10} />
                                <Text style={styles.lockTagLabel}>LOCKED</Text>
                            </View>
                        </View>
                        {/* Placeholder text pill next to the empty square */}
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <View style={styles.ghostBoxSm} />
                            <View style={{ flex: 1 }}>
                                <View style={[styles.skBar, { width: "62%", height: 10, backgroundColor: "rgba(255,255,255,0.3)" }]} />
                            </View>
                        </View>
                        {/* Sparkline as flex child 3/4 */}
                        <Svg width="100%" height={34} viewBox="0 0 100 34" preserveAspectRatio="none">
                            <Polyline
                                points="4,27 32,22 54,18 76,12 96,7"
                                fill="none"
                                stroke={colors.gold}
                                strokeOpacity="0.4"
                                strokeWidth="2"
                                strokeDasharray="3 3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </Svg>
                        {/* Caption next to the lock */}
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <View style={styles.lockDotSm}><LockIcon color="#fff" size={13} /></View>
                            <Text style={[styles.lockCardDesc, { flex: 1, color: "rgba(255,255,255,0.55)" }]}>When a friend changes a score</Text>
                        </View>
                    </View>
                </View>

                {/* Match Moment — locked, 150px, mint */}
                <View style={[styles.fullCell, { height: 150, backgroundColor: colors.mint }]}>
                    <View style={styles.matchMomentBlob} />
                    <View style={[styles.fullCellPad, { justifyContent: "space-between" }]}>
                        <View style={styles.fullCellTop}>
                            <View style={styles.lightPill}><Text style={styles.lightPillText}>Match moment</Text></View>
                            <View style={styles.lockTagRow}>
                                <LockIcon color="rgba(255,255,255,0.85)" size={10} />
                                <Text style={styles.lockTagLabel}>LOCKED</Text>
                            </View>
                        </View>
                        {/* Head-to-head: winner (check badge) › loser */}
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
                            <View>
                                <View style={styles.ghostBoxLg} />
                                <View style={styles.matchMomentCheck} />
                            </View>
                            <Text style={styles.matchMomentGt}>›</Text>
                            <View style={styles.ghostBoxMatchLose} />
                        </View>
                        {/* Caption next to the lock */}
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
                            <View style={styles.lockDotSm}><LockIcon color="#fff" size={13} /></View>
                            <Text style={[styles.lockCardDesc, { flex: 1 }]}>Head-to-head picks from your circle</Text>
                        </View>
                    </View>
                </View>
            </View>

            {/* Disagreement Spotlight — locked */}
            <View style={styles.fullDisagreeCard}>
                <View style={styles.fullCellTop}>
                    <View style={styles.butterPill}><Text style={styles.butterPillText}>Disagreement spotlight</Text></View>
                    <View style={styles.lockTagRow}>
                        <LockIcon color={colors.inkDim} size={10} />
                        <Text style={[styles.lockTagLabel, { color: colors.inkDim }]}>LOCKED</Text>
                    </View>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 11 }}>
                    <View style={styles.ghostBoxMd} />
                    <View style={{ flex: 1 }}>
                        <Text style={styles.disagreeLockedTitle}>Locked for now</Text>
                        <Text style={styles.disagreeLockedBody}>Rate more to see where you split from the crowd.</Text>
                    </View>
                    <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
                        <View style={{ alignItems: "center" }}>
                            <Text style={styles.disagreeColLabel}>YOU</Text>
                            <View style={styles.disagreeColCircle}><LockIcon color={colors.inkDim} size={12} /></View>
                        </View>
                        <View style={styles.disagreeDivider} />
                        <View style={{ alignItems: "center" }}>
                            <Text style={styles.disagreeColLabel}>CROWD</Text>
                            <View style={styles.disagreeColCircle}><LockIcon color={colors.inkDim} size={12} /></View>
                        </View>
                    </View>
                </View>
            </View>
        </View>
    )

    const renderLockedSection = () => (
        <View style={styles.lockedSection}>
            <View style={[styles.sectionRow, { marginTop: 4, marginBottom: 0 }]}>
                <Text style={styles.sectionLabel}>UNLOCKING SOON</Text>
            </View>

            {/* Recent Verdicts compact teaser — only while it's still locked. Once a followed
                verdict exists it is promoted to the full hero above, so "UNLOCKING SOON" then
                heads only the modules below that are still locked. */}
            {heroEvent === null && (
                <View style={[styles.miniRow, styles.miniRowNavy]}>
                    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
                        {ORBIT_STARS.slice(0, 10).map((s, i) => (
                            <Circle key={i} cx={`${s.x}%`} cy={`${s.y}%`} r={s.r} fill="white" fillOpacity={s.o * 0.7} />
                        ))}
                    </Svg>
                    <View style={styles.miniRowInner}>
                        <View style={styles.miniLockCircle}>
                            <LockIcon color={colors.cream} />
                        </View>
                        <View style={styles.miniRowText}>
                            <Text style={styles.miniRowLabel} numberOfLines={1}>Recent Verdicts</Text>
                            <Text style={[styles.miniRowSub, { color: colors.cdim }]} numberOfLines={1}>
                                Friends' fresh ratings, front and center
                            </Text>
                        </View>
                        <Text style={[styles.miniLockedTag, { color: colors.cdim }]}>LOCKED</Text>
                    </View>
                </View>
            )}

            {/* 2×2 grid */}
            <View style={styles.miniGridRow}>
                <View style={[styles.miniTile, { backgroundColor: "#000" }]}>
                    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none">
                        <Polygon points="0,0 100,0 0,100" fill={colors.plum} />
                        <Polygon points="100,0 100,100 0,100" fill={colors.accent} />
                    </Svg>
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(13,15,23,0.42)" }]} />
                    <View style={styles.miniTileInner}>
                        <View style={styles.miniTileTop}>
                            <View style={styles.miniLockCircle}><LockIcon color="#fff" /></View>
                            <Text style={[styles.miniLockedTag, { color: "rgba(255,255,255,0.6)" }]}>LOCKED</Text>
                        </View>
                        <View>
                            <Text style={[styles.miniTileLabel, { color: "#fff" }]}>Split Decision</Text>
                            <Text style={[styles.miniTileSub, { color: "rgba(255,255,255,0.78)" }]}>When two friends clash on a song</Text>
                        </View>
                    </View>
                </View>

                <View style={[styles.miniTile, { backgroundColor: colors.sky }]}>
                    <View style={styles.consensusBars}>
                        {[6, 11, 18, 28, 23, 15, 10].map((v, i) => (
                            <View key={i} style={[styles.consensusBar, { height: v }]} />
                        ))}
                    </View>
                    <View style={styles.miniTileInner}>
                        <View style={styles.miniTileTop}>
                            <View style={styles.miniLockCircle}><LockIcon color="#fff" /></View>
                            <Text style={[styles.miniLockedTag, { color: "rgba(255,255,255,0.6)" }]}>LOCKED</Text>
                        </View>
                        <View>
                            <Text style={[styles.miniTileLabel, { color: "#fff" }]}>Consensus</Text>
                            <Text style={[styles.miniTileSub, { color: "rgba(255,255,255,0.78)" }]}>How your circle scores a track</Text>
                        </View>
                    </View>
                </View>
            </View>

            <View style={styles.miniGridRow}>
                <View style={[styles.miniTile, { backgroundColor: colors.navy }]}>
                    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
                        {ORBIT_STARS.slice(0, 8).map((s, i) => (
                            <Circle key={i} cx={`${s.x}%`} cy={`${s.y}%`} r={s.r} fill="white" fillOpacity={s.o * 0.6} />
                        ))}
                    </Svg>
                    <Svg
                        style={{ position: "absolute", left: 28, right: 10, top: 11, height: 36 }}
                        viewBox="0 0 100 28"
                        preserveAspectRatio="none"
                    >
                        <Polyline
                            points="20,23 56,21 78,1"
                            fill="none"
                            stroke={colors.gold}
                            strokeOpacity="0.3"
                            strokeWidth="2"
                            strokeDasharray="3 3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </Svg>
                    <View style={styles.miniTileInner}>
                        <View style={styles.miniTileTop}>
                            <View style={styles.miniLockCircle}><LockIcon color={colors.cream} /></View>
                            <Text style={[styles.miniLockedTag, { color: colors.cdim }]}>LOCKED</Text>
                        </View>
                        <View>
                            <Text style={[styles.miniTileLabel, { color: colors.cream }]}>Re-rate Radar</Text>
                            <Text style={[styles.miniTileSub, { color: colors.cdim }]}>A score a friend moved</Text>
                        </View>
                    </View>
                </View>

                <View style={[styles.miniTile, { backgroundColor: colors.mint }]}>
                    <View style={styles.versusDecoration}>
                        <View style={styles.versusWin} />
                        <View style={styles.versusLose} />
                    </View>
                    <View style={styles.miniTileInner}>
                        <View style={styles.miniTileTop}>
                            <View style={styles.miniLockCircle}><LockIcon color="#fff" /></View>
                            <Text style={[styles.miniLockedTag, { color: "rgba(255,255,255,0.6)" }]}>LOCKED</Text>
                        </View>
                        <View>
                            <Text style={[styles.miniTileLabel, { color: "#fff" }]}>Match Moment</Text>
                            <Text style={[styles.miniTileSub, { color: "rgba(255,255,255,0.78)" }]}>Head-to-head picks</Text>
                        </View>
                    </View>
                </View>
            </View>

            {/* Disagreement Spotlight row */}
            <View style={[styles.miniRow, styles.miniRowLight]}>
                <View style={styles.miniRowInner}>
                    <View style={[styles.miniLockCircle, { backgroundColor: "rgba(17,19,28,0.05)" }]}>
                        <LockIcon color={colors.inkDim} />
                    </View>
                    <View style={styles.miniRowText}>
                        <Text style={[styles.miniRowLabel, { color: colors.ink }]} numberOfLines={1}>Disagreement Spotlight</Text>
                        <Text style={[styles.miniRowSub, { color: colors.inkDim }]} numberOfLines={1}>
                            You vs. the crowd on one track
                        </Text>
                    </View>
                    <Text style={[styles.miniLockedTag, { color: colors.inkDim }]}>LOCKED</Text>
                </View>
            </View>
        </View>
    )

    const renderGettingStartedBanner = () => {
        const rated = Math.min(profile?.user_stats?.rated_count ?? 0, 10)
        const friendCount = Math.min(profile?.following_count ?? 0, 3)

        return (
            <View style={styles.orbitCard}>
                <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
                    {ORBIT_STARS.map((s, i) => (
                        <Circle key={i} cx={`${s.x}%`} cy={`${s.y}%`} r={s.r} fill="white" fillOpacity={s.o} />
                    ))}
                </Svg>
                <View style={styles.orbitContent}>
                    <View style={styles.bannerTopRow}>
                        <View style={styles.orbitPill}>
                            <Text style={styles.orbitPillText}>Getting started</Text>
                        </View>
                        <Text style={styles.friendCounter}>{friendCount} / 3 FRIENDS</Text>
                    </View>
                    <Text style={styles.orbitTitle}>{"Rate songs. Follow friends."}</Text>
                    <Text style={styles.orbitBody}>
                        As your taste sharpens and your circle grows, every card below reveals itself.
                    </Text>
                    <View style={styles.tasteMeterRow}>
                        {Array.from({ length: 10 }).map((_, i) => (
                            <View key={i} style={[styles.tasteMeterSegment, i < rated && styles.tasteMeterFilled]} />
                        ))}
                    </View>
                    <Text style={styles.tasteMeterLabel}>
                        {rated} / 10 RATED · CARDS UNLOCK AS YOU GO
                    </Text>
                    <View style={styles.bannerBtns}>
                        <TouchableOpacity
                            style={styles.bannerBtnGold}
                            onPress={() => navigation.navigate("Discover", { screen: "DiscoverHome", params: { focusSearch: true } })}
                        >
                            <Text style={styles.bannerBtnGoldText}>+ Rate songs</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.bannerBtnGhost} onPress={handleFindUsers}>
                            <Text style={styles.bannerBtnGhostText}>Find friends</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        )
    }

    const renderListHeader = () => {
        const today = new Date()
        const dayAbbr = DAY_ABBRS[today.getDay()]
        const todayCount = events.filter(
            (e) => new Date(e.created_at).toDateString() === today.toDateString()
        ).length

        return (
            <View>
                {/* BO-style header */}
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        <Text style={styles.kicker}>TODAY · {dayAbbr}</Text>
                        <Text style={styles.heading}>LISTn</Text>
                    </View>
                    <TouchableOpacity
                        style={styles.avatarCircle}
                        onPress={() => navigation.navigate("Profile")}
                        accessibilityLabel="Your profile"
                    >
                        <Text style={styles.avatarLetter}>{avatarInitial}</Text>
                    </TouchableOpacity>
                </View>

                {/* Search bar — taps into Discover */}
                <TouchableOpacity
                    style={styles.searchBar}
                    onPress={() => navigation.navigate("Discover", { screen: "DiscoverHome", params: { focusSearch: true } })}
                    activeOpacity={0.7}
                >
                    <SearchIcon />
                    <Text style={styles.searchPlaceholder}>Search…</Text>
                    <View style={styles.ratePill}>
                        <Text style={styles.ratePillText}>RATE +</Text>
                    </View>
                </TouchableOpacity>

                {/* Recent Verdict is never gated by rated count — only by having a followed verdict. */}
                {renderRecentVerdict()}

                {gettingStartedComplete ? (
                    renderUnlockedSection()
                ) : (
                    <>
                        {renderGettingStartedBanner()}
                        {renderLockedSection()}
                    </>
                )}

                {events.length > 0 && (
                    <View style={styles.sectionRow}>
                        <Text style={styles.sectionLabel}>ACTIVITY</Text>
                        {todayCount > 0 && (
                            <Text style={styles.sectionRight}>{todayCount} TODAY</Text>
                        )}
                    </View>
                )}
            </View>
        )
    }

    const renderFeedEvent = ({ item }: { item: FeedEvent; index: number }) => {
        const isOwnEvent = item.actor_profile.user_id === profile?.user_id
        const bColor = bucketColor(item.new_bucket)
        const bgColor = bucketBgColor(item.new_bucket)
        const aColor = avatarColor(item.actor_profile.username)
        const nameSrc = item.actor_profile.display_name || item.actor_profile.username
        const initial = nameSrc[0].toUpperCase()
        const actionLabel = _eventLabel(item.event_type)
        const bucketLabel = item.new_bucket === "alright" ? "OKAY" : item.new_bucket.toUpperCase()

        return (
            <View testID={`feed-row-${item.id}`} style={styles.eventCard}>
                {/* Top section: actor info left, ring art right */}
                <View style={styles.cardTopRow}>
                    {/* Left col */}
                    <View style={styles.cardLeft}>
                        <TouchableOpacity
                            style={styles.actorRow}
                            onPress={() => handleActorPress(item)}
                            disabled={reportingEventId !== null}
                            testID={`feed-actor-${item.id}`}
                        >
                            <View style={[styles.actorAvatar, { backgroundColor: aColor }]}>
                                <Text style={styles.actorInitial}>{initial}</Text>
                            </View>
                            <Text style={styles.actorMeta} numberOfLines={1}>
                                <Text style={styles.actorHandle}>{isOwnEvent ? "You" : `@${item.actor_profile.username}`}</Text>
                                <Text style={styles.actorActionWord}> {actionLabel.toLowerCase()}</Text>
                                <Text style={styles.actorTime}> · {formatRelativeTime(item.created_at)}</Text>
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => handleSongPress(item)}
                            disabled={openingEventId !== null}
                            activeOpacity={0.75}
                            testID={`feed-song-${item.id}`}
                        >
                            <Text style={styles.songTitle} numberOfLines={2}>{item.song.title}</Text>
                            <Text style={styles.songArtist} numberOfLines={1}>{item.song.artist}</Text>
                        </TouchableOpacity>
                        <View style={[styles.bucketBadge, { backgroundColor: bgColor }]}>
                            <Text style={[styles.bucketBadgeText, { color: bColor }]}>
                                IN {bucketLabel}
                            </Text>
                        </View>
                    </View>

                    {/* Right col: circular ring art */}
                    <TouchableOpacity
                        style={styles.ringWrap}
                        onPress={() => handleSongPress(item)}
                        disabled={openingEventId !== null}
                        activeOpacity={0.9}
                    >
                        <Svg
                            width={RING_SIZE}
                            height={RING_SIZE}
                            style={{ position: "absolute", top: 0, left: 0 }}
                        >
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
                            {item.song.cover_url ? (
                                <Image style={styles.ringArt} source={{ uri: item.song.cover_url }} />
                            ) : (
                                <View style={[styles.ringArt, { backgroundColor: colors.paper2 }]} />
                            )}
                        </View>
                        <View style={styles.scoreBadgeWrap}>
                            <View style={[styles.scoreBadge, { borderColor: bColor }]}>
                                {openingEventId === item.id ? (
                                    <ActivityIndicator color={bColor} size="small" />
                                ) : (
                                    <Text style={styles.scoreBadgeText}>
                                        {item.new_score.toFixed(1)}
                                    </Text>
                                )}
                            </View>
                        </View>
                    </TouchableOpacity>
                </View>

                {/* Note quote */}
                {item.note !== null && (
                    <Text style={styles.noteQuote}>"{item.note}"</Text>
                )}

                {/* Report success */}
                {reportedEventId === item.id && (
                    <Text style={styles.reportSuccess}>Thanks. We'll review this report.</Text>
                )}

                {/* Report panel */}
                {reportingEventId === item.id && item.note !== null && !isOwnEvent && (
                    <View style={styles.reportPanel}>
                        <Text style={styles.reportTitle}>Report note</Text>
                        <Text style={styles.reportLabel}>Why are you reporting this note?</Text>
                        <View style={styles.reasonGrid}>
                            {REPORT_REASONS.map((reason) => (
                                <TouchableOpacity
                                    key={reason.value}
                                    style={[
                                        styles.reasonButton,
                                        reportReason === reason.value && styles.reasonButtonActive,
                                    ]}
                                    onPress={() => setReportReason(reason.value)}
                                    disabled={isReporting}
                                >
                                    <Text style={[
                                        styles.reasonText,
                                        reportReason === reason.value && styles.reasonTextActive,
                                    ]}>
                                        {reason.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <Text style={styles.reportLabel}>Add details, optional</Text>
                        <TextInput
                            value={reportDetails}
                            onChangeText={setReportDetails}
                            editable={!isReporting}
                            multiline
                            maxLength={1000}
                            placeholder="Add context for review."
                            placeholderTextColor={colors.inkDim}
                            style={styles.reportInput}
                        />
                        {reportError !== null && (
                            <Text style={styles.reportError}>{reportError}</Text>
                        )}
                        <View style={styles.reportActions}>
                            <TouchableOpacity
                                style={styles.cancelReportButton}
                                onPress={closeReport}
                                disabled={isReporting}
                            >
                                <Text style={styles.cancelReportText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                accessibilityState={{ disabled: reportReason === null || isReporting }}
                                style={[
                                    styles.submitReportButton,
                                    (reportReason === null || isReporting) && styles.submitReportButtonDisabled,
                                ]}
                                onPress={() => submitReport(item.id)}
                                disabled={reportReason === null || isReporting}
                            >
                                <Text style={styles.submitReportText}>
                                    {isReporting ? "Submitting..." : "Submit report"}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {/* Action row */}
                <View style={styles.actionRow}>
                    <View style={styles.actionBtns}>
                        <ActivityLikeButton
                            ratingEventId={item.id}
                            initialLikedByViewer={item.liked_by_viewer}
                            initialLikeCount={item.like_count}
                            onOpenLikers={openActivityLikers}
                        />
                    </View>
                    {isOwnEvent ? (
                        <TouchableOpacity
                            style={styles.moreBtn}
                            onPress={(e) => toggleLikePrivacyMenu(item.id, e)}
                            disabled={isSavingLikePrivacy}
                            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                            accessibilityLabel="Activity options"
                            testID={`feed-options-${item.id}`}
                        >
                            <Text style={styles.moreDots}>···</Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            style={styles.moreBtn}
                            onPress={() => item.note !== null && !reportingEventId && openReport(item.id)}
                            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                        >
                            <Text style={styles.moreDots}>···</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        )
    }

    const renderFooter = () => {
        if (!isLoadingMore) return null
        return <ActivityIndicator color={colors.accent} style={styles.footerSpinner} />
    }

    // Popover menu that springs from the "···" button on your own activity cards.
    // Only own events open it, so its single option is the like-count privacy toggle.
    const renderLikePrivacyMenu = () => {
        if (likePrivacyEventId === null || likePrivacyAnchor === null) return null
        return (
            <Modal
                visible
                transparent
                animationType="fade"
                onRequestClose={closeLikePrivacyMenu}
            >
                <Pressable style={styles.menuBackdrop} onPress={closeLikePrivacyMenu}>
                    <View
                        style={[styles.menuCard, { top: likePrivacyAnchor.top, right: likePrivacyAnchor.right }]}
                        onStartShouldSetResponder={() => true}
                        testID={`feed-like-privacy-panel-${likePrivacyEventId}`}
                    >
                        <Text style={styles.menuHeader}>ACTIVITY OPTIONS</Text>
                        <TouchableOpacity
                            style={styles.menuItem}
                            onPress={toggleLikePrivacy}
                            disabled={isSavingLikePrivacy}
                            testID={`feed-hide-like-counts-${likePrivacyEventId}`}
                        >
                            <View style={styles.menuItemIcon}>
                                {hideLikeCounts
                                    ? <EyeIcon color={colors.ink} />
                                    : <EyeOffIcon color={colors.ink} />}
                            </View>
                            <View style={styles.menuItemText}>
                                <Text style={styles.menuItemLabel}>
                                    {isSavingLikePrivacy
                                        ? "Saving…"
                                        : hideLikeCounts ? "Show like counts" : "Hide like counts"}
                                </Text>
                                <Text style={styles.menuItemSub}>
                                    {hideLikeCounts
                                        ? "Hidden from others right now"
                                        : "Others can see who liked this"}
                                </Text>
                            </View>
                        </TouchableOpacity>
                        {likePrivacyError !== null && (
                            <Text style={styles.menuError}>{likePrivacyError}</Text>
                        )}
                    </View>
                </Pressable>
            </Modal>
        )
    }

    // Load on mount and reload when the Feed tab regains focus from another tab.
    // Deliberately not useFocusEffect: that also fires when popping back from a
    // screen pushed on the Feed stack (a user's profile, a follow list), and the
    // mid-transition reload visibly yanks the list to the top before the scroll
    // position settles back.
    useEffect(() => {
        setHideLikeCounts(profile?.hide_like_counts ?? false)
    }, [profile?.hide_like_counts])

    useEffect(() => {
        loadFeed(null, true)
        refreshProfile()
        const tabNavigation = navigation.getParent<BottomTabNavigationProp<TabParamList, "Feed">>()
        return tabNavigation?.addListener("focus", () => {
            loadFeed(null, true)
            refreshProfile()
        })
    }, [loadFeed, refreshProfile, navigation])

    if (error !== null && events.length === 0) {
        return (
            <View style={styles.centerState}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={styles.btn} onPress={() => loadFeed(null, true)}>
                    <Text style={styles.btnText}>Try again</Text>
                </TouchableOpacity>
            </View>
        )
    }

    if (events.length === 0) {
        const displayName = profile?.display_name || profile?.username || ""
        const welcomeKicker = displayName ? `WELCOME, ${displayName.toUpperCase()}` : "WELCOME"

        return (
            <ScrollView style={styles.container} contentContainerStyle={styles.newUserContent}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        <Text style={styles.kicker}>{welcomeKicker}</Text>
                        <Text style={styles.heading}>LISTn</Text>
                    </View>
                    <TouchableOpacity
                        style={styles.avatarCircle}
                        onPress={() => navigation.navigate("Profile")}
                        accessibilityLabel="Your profile"
                    >
                        <Text style={styles.avatarLetter}>{avatarInitial}</Text>
                    </TouchableOpacity>
                </View>

                {/* Search bar */}
                <TouchableOpacity
                    style={styles.searchBar}
                    onPress={() => navigation.navigate("Discover", { screen: "DiscoverHome", params: { focusSearch: true } })}
                    activeOpacity={0.7}
                >
                    <SearchIcon />
                    <Text style={styles.searchPlaceholder}>Search…</Text>
                    <View style={styles.ratePill}>
                        <Text style={styles.ratePillText}>RATE +</Text>
                    </View>
                </TouchableOpacity>

                {/* Recent Verdict is never gated by rated count — only by having a followed verdict. */}
                {renderRecentVerdict()}

                {gettingStartedComplete ? (
                    renderUnlockedSection()
                ) : (
                    <>
                        {renderGettingStartedBanner()}

                        {!friendsCardDismissed ? (
                            /* Find friends card */
                            <View style={styles.findFriendsCard}>
                                <TouchableOpacity
                                    style={styles.findDismiss}
                                    onPress={() => setFriendsCardDismissed(true)}
                                    hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                                >
                                    <Text style={styles.findDismissX}>✕</Text>
                                </TouchableOpacity>
                                <View style={styles.findTopRow}>
                                    <View style={styles.findTextBlock}>
                                        <Text style={styles.findTitle}>Find your people</Text>
                                        <Text style={styles.findBody}>Compare taste and see more stats.</Text>
                                    </View>
                                    <View style={styles.friendStack}>
                                        {FRIEND_AVATARS.map((f, i) => (
                                            <View key={f.id} style={[styles.friendStackAva, { backgroundColor: f.color, marginLeft: i > 0 ? -10 : 0 }]}>
                                                <Text style={styles.friendStackLetter}>{f.initial}</Text>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                                <View style={styles.findBtns}>
                                    <TouchableOpacity style={styles.findBtnPrimary} onPress={handleFindUsers}>
                                        <Text style={styles.findBtnPrimaryText}>Connect contacts</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.findBtnSecondary} onPress={handleFindUsers}>
                                        <Text style={styles.findBtnSecondaryText}>Invite</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ) : (
                            renderLockedSection()
                        )}
                    </>
                )}

                {/* Activity section — always visible */}
                <View style={styles.sectionRow}>
                    <Text style={styles.sectionLabel}>ACTIVITY</Text>
                </View>
                <View style={styles.ghostCard}>
                    <GhostRow />
                    {isLoading ? (
                        <ActivityIndicator color={colors.accent} style={styles.feedLoader} />
                    ) : (
                        <View style={styles.emptyMsgBlock}>
                            <Text style={styles.emptyMsgTitle}>Your feed is empty</Text>
                            <Text style={styles.emptyMsgBody}>
                                Follow friends and rate songs — their ratings, re-rates and co-signs will land here.
                            </Text>
                        </View>
                    )}
                    <GhostRow />
                </View>
            </ScrollView>
        )
    }

    return (
        <View style={styles.container}>
            {error !== null && <Text style={styles.inlineError}>{error}</Text>}
            <FlashList
                ref={listRef}
                data={events}
                renderItem={renderFeedEvent}
                keyExtractor={(item) => item.id.toString()}
                onEndReached={handleLoadMore}
                onEndReachedThreshold={0.6}
                ListHeaderComponent={renderListHeader()}
                ListFooterComponent={renderFooter}
                maintainVisibleContentPosition={{ disabled: true }}
                contentContainerStyle={styles.listContent}
                ItemSeparatorComponent={null}
            />
            {renderLikePrivacyMenu()}
        </View>
    )
}

function _eventLabel(eventType: FeedEvent["event_type"]): string {
    if (eventType === "rerated") return "RERATED"
    if (eventType === "reordered") return "RERANKED"
    return "RATED"
}

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
    // ── Header ──────────────────────────────────────────────────────────
    header: {
        paddingTop: 60,
        paddingHorizontal: 16,
        paddingBottom: 10,
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
        // lineHeight clears the display font's descender (kept consistent across
        // all screen titles); 29 (< fontSize) clipped descenders like "g".
        lineHeight: 36,
        color: colors.ink,
    },
    avatarCircle: {
        width: 32,
        height: 32,
        borderRadius: 9,
        backgroundColor: colors.ink,
        alignItems: "center",
        justifyContent: "center",
        marginTop: 4,
    },
    avatarLetter: {
        color: "#fff",
        fontWeight: "700",
        fontSize: 17,
    },
    // ── Search bar ───────────────────────────────────────────────────────
    searchBar: {
        flexDirection: "row",
        alignItems: "center",
        gap: 9,
        marginHorizontal: 14,
        marginBottom: 4,
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 12,
        height: 40,
        paddingHorizontal: 13,
        shadowColor: colors.ink,
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
    },
    searchPlaceholder: {
        fontSize: 12.5,
        color: colors.inkDim,
        flex: 1,
    },
    ratePill: {
        backgroundColor: colors.accent,
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 3,
    },
    ratePillText: {
        fontFamily: fonts.mono,
        fontSize: 8.5,
        color: "#fff",
        fontWeight: "700",
        letterSpacing: 0.8,
    },
    // ── Section label ────────────────────────────────────────────────────
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
    sectionRight: {
        fontFamily: fonts.mono,
        fontSize: 9,
        color: colors.accent,
        fontWeight: "700",
        letterSpacing: 0.5,
    },
    // ── Event card ────────────────────────────────────────────────────────
    eventCard: {
        backgroundColor: colors.paper,
        marginHorizontal: 14,
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
    // ── Ring art ──────────────────────────────────────────────────────────
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
    // ── Note + action row ─────────────────────────────────────────────────
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
    actionBtn: {
        flexDirection: "row",
        alignItems: "center",
    },
    moreBtn: {},
    moreDots: {
        color: colors.inkDim,
        fontSize: 18,
        letterSpacing: -1,
    },
    // ── Report panel ──────────────────────────────────────────────────────
    reportPanel: {
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 12,
        backgroundColor: colors.bg,
        padding: 12,
        marginTop: 8,
    },
    reportTitle: {
        fontWeight: "700",
        color: colors.ink,
        fontSize: 14,
        marginBottom: 8,
    },
    reportLabel: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 9.5,
        letterSpacing: 0.5,
        marginBottom: 8,
    },
    // ── Activity options popover (springs from the "···") ──────────────────
    menuBackdrop: {
        flex: 1,
        backgroundColor: "rgba(22,20,19,0.18)",
    },
    menuCard: {
        position: "absolute",
        width: LIKE_MENU_WIDTH,
        backgroundColor: colors.paper,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.line,
        padding: 8,
        shadowColor: colors.ink,
        shadowOpacity: 0.18,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
        elevation: 8,
    },
    menuHeader: {
        fontFamily: fonts.mono,
        fontSize: 8.5,
        letterSpacing: 1.4,
        color: colors.inkDim,
        fontWeight: "700",
        paddingHorizontal: 8,
        paddingTop: 4,
        paddingBottom: 7,
    },
    menuItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 11,
        paddingVertical: 8,
        paddingHorizontal: 8,
        borderRadius: 10,
    },
    menuItemIcon: {
        width: 32,
        height: 32,
        borderRadius: 9,
        backgroundColor: colors.bg,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    menuItemText: {
        flex: 1,
        minWidth: 0,
    },
    menuItemLabel: {
        fontSize: 13.5,
        color: colors.ink,
        fontWeight: "600",
    },
    menuItemSub: {
        fontSize: 11,
        color: colors.inkDim,
        marginTop: 1,
    },
    menuError: {
        color: colors.danger,
        fontSize: 12,
        lineHeight: 16,
        paddingHorizontal: 8,
        paddingTop: 4,
        paddingBottom: 2,
    },
    reasonGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        marginBottom: 12,
    },
    reasonButton: {
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 8,
        paddingVertical: 7,
        paddingHorizontal: 9,
        backgroundColor: colors.paper,
    },
    reasonButtonActive: {
        borderColor: colors.ink,
        backgroundColor: colors.ink,
    },
    reasonText: {
        fontFamily: fonts.mono,
        color: colors.ink,
        fontSize: 10,
    },
    reasonTextActive: {
        color: "#fff",
    },
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
    reportActions: {
        flexDirection: "row",
        gap: 8,
    },
    cancelReportButton: {
        alignItems: "center",
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 8,
        flex: 1,
        paddingVertical: 9,
    },
    cancelReportText: {
        fontFamily: fonts.mono,
        color: colors.ink,
        fontSize: 11,
    },
    submitReportButton: {
        alignItems: "center",
        backgroundColor: colors.ink,
        borderRadius: 8,
        flex: 1,
        paddingVertical: 9,
    },
    submitReportButtonDisabled: { opacity: 0.45 },
    submitReportText: {
        fontFamily: fonts.mono,
        color: "#fff",
        fontSize: 11,
    },
    reportError: {
        color: colors.danger,
        fontSize: 13,
        lineHeight: 18,
        marginBottom: 8,
    },
    reportSuccess: {
        fontFamily: fonts.mono,
        color: colors.like,
        fontSize: 9.5,
        letterSpacing: 0.5,
        marginBottom: 8,
    },
    // ── Misc ─────────────────────────────────────────────────────────────
    listContent: {
        paddingBottom: 96,
    },
    footerSpinner: { marginVertical: 18 },
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
    errorText: {
        color: colors.danger,
        fontSize: 15,
        marginBottom: 24,
        textAlign: "center",
    },
    // ── FeedNew getting-started banner ────────────────────────────────────
    newUserContent: {
        paddingBottom: 96,
    },
    orbitCard: {
        marginHorizontal: 14,
        marginTop: 10,
        marginBottom: 8,
        borderRadius: 20,
        backgroundColor: colors.navy,
        overflow: "hidden",
    },
    orbitContent: {
        padding: 14,
    },
    bannerTopRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 8,
    },
    orbitPill: {
        alignSelf: "flex-start",
        backgroundColor: "rgba(245,184,64,0.16)",
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    orbitPillText: {
        fontFamily: fonts.mono,
        fontSize: 8.5,
        color: colors.gold,
        letterSpacing: 1,
        fontWeight: "700",
    },
    friendCounter: {
        fontFamily: fonts.mono,
        fontSize: 8,
        letterSpacing: 1.4,
        color: colors.cdim,
        fontWeight: "700",
    },
    orbitTitle: {
        fontFamily: fonts.serif,
        fontStyle: "italic",
        fontSize: 19,
        color: colors.cream,
        lineHeight: 21,
        marginBottom: 5,
    },
    orbitBody: {
        fontFamily: fonts.mono,
        fontSize: 11,
        color: colors.cdim,
        lineHeight: 16,
    },
    tasteMeterRow: {
        flexDirection: "row",
        gap: 4,
        marginTop: 10,
    },
    tasteMeterSegment: {
        flex: 1,
        height: 6,
        borderRadius: 3,
        backgroundColor: "rgba(245,238,220,0.15)",
    },
    tasteMeterFilled: {
        backgroundColor: colors.gold,
    },
    tasteMeterLabel: {
        fontFamily: fonts.mono,
        fontSize: 8.5,
        letterSpacing: 1.4,
        color: colors.cdim,
        fontWeight: "700",
        marginTop: 7,
        marginBottom: 0,
    },
    bannerBtns: {
        flexDirection: "row",
        gap: 8,
        marginTop: 11,
    },
    bannerBtnGold: {
        flex: 1,
        backgroundColor: colors.gold,
        borderRadius: 11,
        paddingVertical: 10,
        alignItems: "center",
    },
    bannerBtnGoldText: {
        fontFamily: fonts.display,
        fontSize: 12,
        color: colors.navy,
    },
    bannerBtnGhost: {
        flex: 1,
        backgroundColor: "rgba(255,255,255,0.1)",
        borderRadius: 11,
        paddingVertical: 10,
        alignItems: "center",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.3)",
    },
    bannerBtnGhostText: {
        fontFamily: fonts.display,
        fontSize: 12,
        color: "#fff",
    },
    // ── Unlocked modules (full preview) ──────────────────────────────────
    unlockedSection: {
        gap: 10,
        marginTop: 4,
    },
    // Recent Verdicts full card
    fvOuter: {
        marginHorizontal: 14,
        marginTop: 8,
        marginBottom: 10,
        borderRadius: 20,
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        padding: 10,
        shadowColor: colors.ink,
        shadowOpacity: 0.06,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 4 },
        overflow: "hidden",
    },
    fvInner: {
        borderRadius: 14,
        backgroundColor: colors.navy,
        padding: 14,
        overflow: "hidden",
    },
    fvPill: {
        backgroundColor: "rgba(255,255,255,0.14)",
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    fvPillText: {
        fontFamily: fonts.mono,
        fontSize: 8.5,
        color: "#fff",
        letterSpacing: 0.8,
        fontWeight: "700",
        textTransform: "uppercase",
    },
    lockDotXl: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "rgba(255,255,255,0.12)",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    fvFooter: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 6,
        paddingTop: 10,
        paddingBottom: 3,
    },
    fvHint: {
        fontFamily: fonts.mono,
        fontSize: 8.5,
        color: colors.inkDim,
        letterSpacing: 1.4,
        fontWeight: "700",
        flexShrink: 0,
    },
    skBar: {
        borderRadius: 4,
    },
    // Full-size card grid
    fullRow: {
        flexDirection: "row",
        gap: 10,
        marginHorizontal: 14,
    },
    fullCell: {
        flex: 1,
        borderRadius: 16,
        overflow: "hidden",
    },
    fullCellPad: {
        flex: 1,
        padding: 12,
    },
    fullCellTop: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    // Pill variants for full cards
    darkPill: {
        backgroundColor: "rgba(0,0,0,0.34)",
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    darkPillText: {
        fontFamily: fonts.mono,
        fontSize: 8.5,
        color: "#fff",
        fontWeight: "700",
        letterSpacing: 0.8,
        textTransform: "uppercase",
    },
    lightPill: {
        backgroundColor: "rgba(255,255,255,0.2)",
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    lightPillText: {
        fontFamily: fonts.mono,
        fontSize: 8.5,
        color: "#fff",
        fontWeight: "700",
        letterSpacing: 0.8,
        textTransform: "uppercase",
    },
    goldPill: {
        backgroundColor: colors.gold,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    goldPillText: {
        fontFamily: fonts.mono,
        fontSize: 8.5,
        color: colors.navy,
        fontWeight: "700",
        letterSpacing: 0.8,
        textTransform: "uppercase",
    },
    butterPill: {
        backgroundColor: colors.butter,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    butterPillText: {
        fontFamily: fonts.mono,
        fontSize: 8.5,
        color: colors.ink,
        fontWeight: "700",
        letterSpacing: 0.8,
        textTransform: "uppercase",
    },
    // Lock tag (icon + LOCKED text inline)
    lockTagRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        flexShrink: 0,
    },
    lockTagLabel: {
        fontFamily: fonts.mono,
        fontSize: 7.5,
        letterSpacing: 1.4,
        fontWeight: "700",
        color: "rgba(255,255,255,0.85)",
    },
    // Lock dots
    lockDotLg: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: "rgba(255,255,255,0.2)",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    lockDotSm: {
        width: 29,
        height: 29,
        borderRadius: 14.5,
        backgroundColor: "rgba(255,255,255,0.12)",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    fullLockHint: {
        fontFamily: fonts.mono,
        fontSize: 10,
        color: "rgba(255,255,255,0.92)",
        textAlign: "center",
        lineHeight: 14,
        maxWidth: 160,
    },
    // Descriptive microcopy on the locked cards — replaces placeholder skeleton bars
    // so each locked module reads as what it will become.
    lvLockedTitle: {
        fontFamily: fonts.display,
        fontSize: 14,
        color: "#fff",
    },
    lvLockedBody: {
        fontSize: 10.5,
        color: "rgba(255,255,255,0.8)",
        marginTop: 3,
        lineHeight: 14,
    },
    // Recent Verdict — live hero ("VerdictCard" from the Bento Orbit design)
    verdictInner: {
        borderRadius: 14,
        backgroundColor: colors.navy,  // fallback behind the album art
        padding: 16,  // even inset on all four sides
        overflow: "hidden",
    },
    verdictScrim: {
        backgroundColor: "rgba(11,13,20,0.64)",
    },
    verdictPill: {
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 3,
        flexShrink: 1,
    },
    verdictPillText: {
        fontFamily: fonts.mono,
        fontSize: 8.5,
        color: "#fff",
        fontWeight: "700",
        letterSpacing: 1.2,
        textTransform: "uppercase",
    },
    ratersRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        flexShrink: 0,
    },
    ratersStack: {
        flexDirection: "row",
        alignItems: "center",
    },
    raterAvatar: {
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1.5,
        borderColor: colors.navy,
    },
    raterInitial: {
        fontFamily: fonts.display,
        color: "#fff",
        fontSize: 9,
    },
    ratersCount: {
        fontFamily: fonts.mono,
        fontSize: 8,
        color: colors.cdim,
        letterSpacing: 1,
        fontWeight: "700",
    },
    verdictBody: {
        flexDirection: "row",
        alignItems: "flex-end",
        gap: 12,
        marginTop: 11,
    },
    verdictScore: {
        fontFamily: fonts.display,
        fontSize: 50,
        lineHeight: 50,
        letterSpacing: -1,
        color: "#fff",
        flexShrink: 0,
        includeFontPadding: false,
    },
    verdictMetaCol: {
        flex: 1,
        minWidth: 0,
    },
    verdictWho: {
        fontFamily: fonts.mono,
        fontSize: 8.5,
        letterSpacing: 1.5,
        color: "rgba(241,236,221,0.82)",  // cream-dim — legible over album art
    },
    verdictNote: {
        fontFamily: fonts.serifItalic,
        fontSize: 16,
        color: "#fff",
        lineHeight: 19,
        marginTop: 4,
        includeFontPadding: false,
    },
    verdictFooter: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 6,
        paddingTop: 10,
        paddingBottom: 2,
    },
    verdictSongTitle: {
        fontFamily: fonts.display,
        fontSize: 17,
        color: colors.ink,
    },
    verdictSongArtist: {
        fontFamily: fonts.mono,
        fontSize: 8.5,
        color: colors.inkSoft,
        letterSpacing: 1,
        marginTop: 3,
    },
    verdictRate: {
        fontFamily: fonts.mono,
        fontSize: 9,
        color: colors.accent,
        letterSpacing: 1.4,
        fontWeight: "700",
        flexShrink: 0,
        marginLeft: 8,
    },
    lockCardDesc: {
        fontSize: 11,
        // Soft white reads evenly on the sky/mint cards; the navy Re-rate card overrides
        // this with a dimmer white (~0.55) so it reads at the same weight — white-on-navy
        // stays crisp at full opacity, so it needs knocking back to match the others.
        color: "rgba(255,255,255,0.78)",
        lineHeight: 14,
    },
    // Consensus histogram (full card)
    consensusFullBars: {
        flexDirection: "row",
        alignItems: "flex-end",
        gap: 2,
        height: 24,
    },
    fullConsBar: {
        flex: 1,
        backgroundColor: "rgba(255,255,255,0.28)",
        borderRadius: 1,
    },
    // Ghost boxes (dashed outline, for skeleton cover art)
    ghostBoxSm: {
        width: 28,
        height: 28,
        borderRadius: 6,
        backgroundColor: "rgba(255,255,255,0.08)",
        borderWidth: 1.5,
        borderStyle: "dashed",
        borderColor: "rgba(255,255,255,0.4)",
        flexShrink: 0,
    },
    ghostBoxLg: {
        width: 42,
        height: 42,
        borderRadius: 8,
        backgroundColor: "rgba(255,255,255,0.08)",
        borderWidth: 1.5,
        borderStyle: "dashed",
        borderColor: "rgba(255,255,255,0.4)",
        flexShrink: 0,
    },
    ghostBoxMd: {
        width: 48,
        height: 48,
        borderRadius: 9,
        backgroundColor: colors.paper2,
        borderWidth: 1.5,
        borderStyle: "dashed",
        borderColor: colors.inkDim,
        flexShrink: 0,
    },
    // Match Moment (full card) — head-to-head ghost squares + accents
    ghostBoxMatchLose: {
        width: 32,
        height: 32,
        borderRadius: 7,
        backgroundColor: "rgba(255,255,255,0.08)",
        borderWidth: 1.5,
        borderStyle: "dashed",
        borderColor: "rgba(255,255,255,0.4)",
        flexShrink: 0,
    },
    matchMomentBlob: {
        position: "absolute",
        top: -30,
        right: -30,
        width: 90,
        height: 90,
        borderRadius: 45,
        backgroundColor: "#fff",
        opacity: 0.08,
    },
    matchMomentCheck: {
        position: "absolute",
        right: -4,
        bottom: -4,
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: "rgba(255,255,255,0.85)",
        borderWidth: 2,
        borderColor: colors.mint,
    },
    matchMomentGt: {
        fontFamily: fonts.display,
        fontSize: 18,
        lineHeight: 20,
        color: "rgba(255,255,255,0.72)",
        flexShrink: 0,
    },
    // Disagreement Spotlight full locked card
    fullDisagreeCard: {
        marginHorizontal: 14,
        borderRadius: 16,
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        padding: 12,
        shadowColor: colors.ink,
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
    },
    disagreeLockedTitle: {
        fontFamily: fonts.display,
        fontSize: 13,
        color: colors.ink,
    },
    disagreeLockedBody: {
        fontSize: 10.5,
        color: colors.inkSoft,
        marginTop: 3,
        lineHeight: 15,
    },
    disagreeColLabel: {
        fontFamily: fonts.mono,
        fontSize: 7,
        color: colors.inkDim,
        letterSpacing: 1.4,
        marginBottom: 5,
        textAlign: "center",
    },
    disagreeColCircle: {
        width: 28,
        height: 28,
        borderRadius: 14,
        borderWidth: 1.5,
        borderStyle: "dashed",
        borderColor: colors.inkDim,
        alignItems: "center",
        justifyContent: "center",
    },
    disagreeDivider: {
        width: 1,
        height: 30,
        backgroundColor: colors.line,
    },
    // ── Locked modules (compact) ──────────────────────────────────────────
    lockedSection: {
        gap: 8,
        marginTop: 4,
    },
    miniRow: {
        borderRadius: 14,
        overflow: "hidden",
        marginHorizontal: 14,
    },
    miniRowNavy: {
        backgroundColor: colors.navy,
    },
    miniRowLight: {
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
    },
    miniRowInner: {
        flexDirection: "row",
        alignItems: "center",
        gap: 11,
        padding: 11,
    },
    miniLockCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: "rgba(255,255,255,0.16)",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    miniRowText: {
        flex: 1,
        minWidth: 0,
    },
    miniRowLabel: {
        fontFamily: fonts.display,
        fontSize: 14,
        color: colors.cream,
    },
    miniRowSub: {
        fontSize: 10.5,
        marginTop: 2,
    },
    miniLockedTag: {
        fontFamily: fonts.mono,
        fontSize: 7.5,
        letterSpacing: 1.4,
        fontWeight: "700",
        opacity: 0.7,
        flexShrink: 0,
    },
    miniGridRow: {
        flexDirection: "row",
        gap: 8,
        marginHorizontal: 14,
    },
    miniTile: {
        flex: 1,
        height: 82,
        borderRadius: 14,
        overflow: "hidden",
    },
    miniTileInner: {
        flex: 1,
        padding: 12,
        justifyContent: "space-between",
    },
    miniTileTop: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    miniTileLabel: {
        fontFamily: fonts.display,
        fontSize: 13,
    },
    miniTileSub: {
        fontSize: 9.5,
        marginTop: 2,
        lineHeight: 13,
    },
    consensusBars: {
        position: "absolute",
        left: 12,
        right: 12,
        bottom: 22,
        flexDirection: "row",
        alignItems: "flex-end",
        gap: 3,
    },
    consensusBar: {
        flex: 1,
        backgroundColor: "#fff",
        opacity: 0.12,
        borderRadius: 1,
    },
    // Match Moment (compact tile) — head-to-head versus decoration
    versusDecoration: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        paddingBottom: 26,
    },
    versusWin: {
        width: 27,
        height: 27,
        borderRadius: 6,
        backgroundColor: "rgba(255,255,255,0.14)",
        borderWidth: 2,
        borderColor: "#fff",
    },
    versusLose: {
        width: 21,
        height: 21,
        borderRadius: 5,
        backgroundColor: "rgba(255,255,255,0.1)",
        opacity: 0.7,
    },
    // ── Find friends card ─────────────────────────────────────────────────
    findFriendsCard: {
        marginHorizontal: 14,
        marginBottom: 0,
        borderRadius: 16,
        backgroundColor: colors.mint,
        padding: 12,
        position: "relative",
    },
    findDismiss: {
        position: "absolute",
        top: 10,
        right: 10,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: "rgba(255,255,255,0.20)",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1,
    },
    findDismissX: {
        color: "#fff",
        fontSize: 11,
        fontWeight: "700",
    },
    findTopRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        paddingRight: 28,
    },
    findTextBlock: {
        flex: 1,
        minWidth: 0,
    },
    findTitle: {
        fontFamily: fonts.display,
        fontSize: 16,
        color: "#fff",
    },
    findBody: {
        fontFamily: fonts.mono,
        fontSize: 11.5,
        color: "#fff",
        opacity: 0.92,
        lineHeight: 16,
        marginTop: 3,
    },
    friendStack: {
        flexDirection: "row",
        flexShrink: 0,
    },
    friendStackAva: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 2,
        borderColor: colors.mint,
    },
    friendStackLetter: {
        color: "#fff",
        fontWeight: "700",
        fontSize: 13,
    },
    findBtns: {
        flexDirection: "row",
        gap: 8,
        marginTop: 8,
    },
    findBtnPrimary: {
        flex: 1,
        backgroundColor: "#fff",
        borderRadius: 11,
        paddingVertical: 10,
        alignItems: "center",
    },
    findBtnPrimaryText: {
        fontFamily: fonts.display,
        fontSize: 12.5,
        color: colors.mint,
    },
    findBtnSecondary: {
        flex: 1,
        backgroundColor: "rgba(255,255,255,0.18)",
        borderRadius: 11,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.35)",
        alignItems: "center",
    },
    findBtnSecondaryText: {
        fontFamily: fonts.display,
        fontSize: 12.5,
        color: "#fff",
    },
    // ── Ghost activity rows ───────────────────────────────────────────────
    ghostCard: {
        marginHorizontal: 14,
        marginTop: 0,
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 8,
        shadowColor: colors.ink,
        shadowOpacity: 0.04,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
    },
    ghostRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 11,
        paddingVertical: 7,
        opacity: 0.5,
    },
    ghostAva: {
        width: 26,
        height: 26,
        borderRadius: 13,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: colors.inkDim,
        flexShrink: 0,
    },
    ghostCover: {
        width: 28,
        height: 28,
        borderRadius: 7,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: colors.inkDim,
        backgroundColor: colors.paper2,
        flexShrink: 0,
    },
    ghostText: {
        flex: 1,
        minWidth: 0,
        gap: 6,
    },
    ghostLine1: {
        height: 8,
        width: "68%",
        borderRadius: 4,
        backgroundColor: "rgba(17,19,28,0.08)",
    },
    ghostLine2: {
        height: 6,
        width: "44%",
        borderRadius: 3,
        backgroundColor: "rgba(17,19,28,0.06)",
    },
    ghostScore: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: colors.inkDim,
        flexShrink: 0,
    },
    feedLoader: {
        marginVertical: 18,
    },
    emptyMsgBlock: {
        alignItems: "center",
        paddingVertical: 13,
    },
    emptyMsgTitle: {
        fontFamily: fonts.display,
        fontSize: 16,
        color: colors.ink,
    },
    emptyMsgBody: {
        fontSize: 12,
        color: colors.inkSoft,
        lineHeight: 17,
        marginTop: 5,
        textAlign: "center",
        maxWidth: 300,
    },
})
