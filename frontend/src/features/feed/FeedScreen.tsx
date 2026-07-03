// Feed tab — shows rating activity from users the current user follows.
import { ReactNode, useCallback, useEffect, useRef, useState } from "react"
import {
    ActivityIndicator,
    Alert,
    Image,
    Modal,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Animated, {
    Easing,
    FadeIn,
    FadeOut,
    SlideInDown,
    SlideOutDown,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withSpring,
    withTiming,
} from "react-native-reanimated"
import type { SharedValue } from "react-native-reanimated"
import { FlashList, FlashListRef } from "@shopify/flash-list"
import { CompositeNavigationProp, useFocusEffect, useNavigation, useScrollToTop } from "@react-navigation/native"
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"
import Svg, { Circle, Path, Polygon, Polyline } from "react-native-svg"

import { ApiError } from "../../api/client"
import { ArrowLabel } from "../../components/Arrow"
import Avatar from "../../components/Avatar"
import BouncyPressable from "../../components/BouncyPressable"
import { DriftingStars, StarDot } from "../../components/DriftingStars"
import EndOfListCap from "../../components/EndOfListCap"
import FindYourPeopleCard from "../../components/FindYourPeopleCard"
import HatchBox from "../../components/HatchBox"
import { PulsingMeterTick } from "../../components/PulsingMeterTick"
import { AppStackParamList, FeedStackParamList, TabParamList } from "../../navigation/types"
import { colors, fonts, bucketColor, goldMeterShade, meterSegment, avatarColorFor, avatarColorToken } from "../../theme"
import { usePullRefresh } from "../../hooks/usePullRefresh"
import { formatRelativeTime } from "../../utils/formatRelativeTime"
import ActivityLikeButton from "../activity/ActivityLikeButton"
import RatingActivityCard from "../activity/RatingActivityCard"
import { updateLikePrivacy } from "../activity/apiRequests"
import { getUnreadCount } from "../notifications/apiRequests"
import OwnActivitySheet from "../activity/OwnActivitySheet"
import { useAuth } from "../auth/AuthContext"
import { blockUser } from "../profile/apiRequests"
import { ProfileBase, ReportReason } from "../profile/types"
import { getMyRankingByDeezerId, getMyRankingBySongId, removeRating } from "../rankings/apiRequests"
import {
    chooseThisOrThat,
    dismissThisOrThat,
    getFeedModules,
    getSongCircleRaters,
    listMyFeed,
    reportRatingEvent,
    undoThisOrThat,
} from "./apiRequests"
import {
    ConsensusModule,
    DisagreementModule,
    FeedEvent,
    MatchMomentModule,
    RerateRadarItem,
    SplitDecisionModule,
    ThisOrThatModule,
} from "./types"

type FeedNavigation = CompositeNavigationProp<
    NativeStackNavigationProp<FeedStackParamList, "FeedHome">,
    CompositeNavigationProp<
        BottomTabNavigationProp<TabParamList, "Feed">,
        NativeStackNavigationProp<AppStackParamList>
    >
>

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
    { x: 38, y: 40, r: 1.1, o: 0.55 },
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

// Dimmed / trimmed variants of the orbit starfield for the smaller locked cards, precomputed
// once so the drift layers get a stable array reference.
const dimOrbit = (count: number, mult: number): StarDot[] =>
    ORBIT_STARS.slice(0, count).map((s) => ({ x: s.x, y: s.y, r: s.r, o: s.o * mult }))
const ORBIT_DOTS_DIM = dimOrbit(ORBIT_STARS.length, 0.7)
const ORBIT_DOTS_DIM_10 = dimOrbit(10, 0.7)
const ORBIT_DOTS_DIM_8 = dimOrbit(8, 0.6)

// Re-rate Radar sparkline row height (px); the trajectory node tops are computed against it.
const SPARK_H = 24

// Matches the backend's THIS_OR_THAT_COOLDOWN (24h). Used to seed the cooldown countdown the
// instant a pick is confirmed, client-side — close enough to server truth for the current
// session; a later real module fetch replaces the whole view with server state regardless.
const THIS_OR_THAT_COOLDOWN_MS = 24 * 60 * 60 * 1000

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

function MoonIcon({ color, size = 12 }: { color: string; size?: number }) {
    return (
        <Svg
            testID="quiet-moon-icon"
            accessibilityLabel="Quiet for now"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
        >
            <Path
                d="M19.2 14.9A7.8 7.8 0 0 1 9.1 4.8A8.1 8.1 0 1 0 19.2 14.9Z"
                fill={color}
            />
        </Svg>
    )
}

function CheckIcon({ color, size = 12 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke={color} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
            <Polyline points="20 6 9 17 4 12" />
        </Svg>
    )
}

// This-or-That mark — two sliders on a beam (the tune/adjust glyph).
function TuneIcon({ color, size = 14 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M6 3v5M6 13v8M18 3v8M18 16v5M3 11h6M15 13h6" />
            <Circle cx={6} cy={10.5} r={2.1} fill={color} stroke="none" />
            <Circle cx={18} cy={13.5} r={2.1} fill={color} stroke="none" />
        </Svg>
    )
}

function UndoIcon({ color, size = 13 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M9 14 4 9l5-5" />
            <Path d="M4 9h11a5 5 0 0 1 0 10h-3" />
        </Svg>
    )
}

function ChevronRightIcon({ color, size = 15 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M9 6l6 6-6 6" />
        </Svg>
    )
}

// Points down at rest; the Social Cards show/hide toggle flips it 180° when expanded.
function ChevronDownIcon({ color, size = 13, up = false }: { color: string; size?: number; up?: boolean }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            style={up ? { transform: [{ rotate: "180deg" }] } : undefined}
            stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M6 9l6 6 6-6" />
        </Svg>
    )
}

function ClockIcon({ color, size = 18 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Circle cx={12} cy={12} r={9} />
            <Path d="M12 7.5V12l3 2" />
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

function FlagIcon({ color, size = 16 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
            <Path d="M4 22v-7" />
        </Svg>
    )
}

function BlockIcon({ color, size = 16 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
            <Circle cx={12} cy={12} r={9} />
            <Path d="M5.6 5.6l12.8 12.8" />
        </Svg>
    )
}

// Tappable cue for the no-note Recent Verdict hero. A thin custom line hand bobs
// gently, matching the app's drawn icon language without looking like a stock asset.
function VerdictFingerCue({ size = 22 }: { size?: number }) {
    const bob = useSharedValue(0)
    useEffect(() => {
        bob.value = withRepeat(
            withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
            -1,
            true,
        )
    }, [bob])

    const fingerStyle = useAnimatedStyle(() => ({
        transform: [
            { translateY: -1 - bob.value * 5 },
            { rotateZ: `${-22 - bob.value * 4}deg` },
        ],
    }))

    return (
        <Animated.View style={[styles.verdictFingerCue, { width: size, height: size }, fingerStyle]}>
            <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                <Path
                    d="M10.2 13.4V4.9c0-.9.7-1.6 1.6-1.6s1.6.7 1.6 1.6v6.4"
                    stroke="#fff"
                    strokeWidth={2.15}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
                <Path
                    d="M13.4 11.3c.2-.7.8-1.2 1.5-1.2.9 0 1.6.7 1.6 1.6v.8"
                    stroke="#fff"
                    strokeWidth={2.15}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
                <Path
                    d="M16.5 12.5c.2-.6.8-1 1.5-1 .9 0 1.6.7 1.6 1.6v2.2c0 3.2-2.3 5.5-5.4 5.5h-1.1c-1.6 0-3.1-.7-4.1-2l-2.2-2.9c-.4-.6-.3-1.3.2-1.8.5-.4 1.2-.4 1.7.1l1.5 1.4"
                    stroke="#fff"
                    strokeWidth={2.15}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </Svg>
        </Animated.View>
    )
}

function SplitSongMotion({ children }: { children: ReactNode }) {
    const sway = useSharedValue(-1)

    useEffect(() => {
        sway.value = withRepeat(
            withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
            -1,
            true,
        )
    }, [sway])

    // Gentle pendulum rock, not a bounce — equal tilt left/right from center, with a slight
    // horizontal drift in the same direction as the tilt (no vertical bounce or scale pop).
    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: sway.value * 5 },
            { rotateZ: `${sway.value * 16}deg` },
        ],
    }))

    return <Animated.View style={animatedStyle}>{children}</Animated.View>
}

function ConsensusWaveBars({
    bars,
    avgBarIndex,
}: {
    bars: number[];
    avgBarIndex: number;
}) {
    const wave = useSharedValue(0)

    useEffect(() => {
        wave.value = withRepeat(
            withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
            -1,
            true,
        )
    }, [wave])

    return (
        <View style={styles.consWave}>
            {bars.map((v, i) => (
                <ConsensusWaveBar key={i} value={v} index={i} wave={wave} isPeak={i === avgBarIndex} />
            ))}
        </View>
    )
}

function ConsensusWaveBar({
    value,
    index,
    wave,
    isPeak,
}: {
    value: number;
    index: number;
    wave: SharedValue<number>;
    isPeak: boolean;
}) {
    const baseHeight = Math.max(3, value * 13)
    const animatedStyle = useAnimatedStyle(() => {
        const phase = wave.value * Math.PI * 2 + index * 0.62
        const height = Math.max(3, Math.min(15, baseHeight + Math.sin(phase) * 2.2))
        return {
            height,
        }
    })

    return (
        <Animated.View
            style={[
                styles.consWaveBar,
                {
                    height: baseHeight,
                    opacity: isPeak ? 1 : 0.4 + 0.45 * value,
                },
                animatedStyle,
            ]}
        >
            {isPeak && <View style={styles.consWaveAvgDot} />}
        </Animated.View>
    )
}

function RadarRipplePoint({ top, color }: { top: number; color: string }) {
    const ripple = useSharedValue(0)

    useEffect(() => {
        ripple.value = withRepeat(withTiming(1, { duration: 1650, easing: Easing.out(Easing.ease) }), -1, false)
    }, [ripple])

    const ringStyle = useAnimatedStyle(() => ({
        opacity: 0.68 * (1 - ripple.value),
        transform: [{ scale: 0.55 + ripple.value * 1.55 }],
    }))

    return (
        <View style={[styles.rrSparkEndWrap, { top }]}>
            <Animated.View style={[styles.rrSparkRipple, { borderColor: color }, ringStyle]} />
            <View style={[styles.rrSparkEndDot, { backgroundColor: color, shadowColor: color }]} />
        </View>
    )
}

function MatchMomentGtMotion() {
    const pulse = useSharedValue(0)

    useEffect(() => {
        pulse.value = withRepeat(
            withSequence(
                withTiming(1, { duration: 760, easing: Easing.out(Easing.quad) }),
                withTiming(0, { duration: 980, easing: Easing.inOut(Easing.quad) }),
            ),
            -1,
            false,
        )
    }, [pulse])

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: 0.72 + pulse.value * 0.22,
        transform: [{ scale: 1 + pulse.value * 0.24 }],
    }))

    return <Animated.Text style={[styles.matchMomentGt, animatedStyle]}>›</Animated.Text>
}

function DisagreementSpotlightOrb() {
    const progress = useSharedValue(0)

    useEffect(() => {
        progress.value = withRepeat(withTiming(1, { duration: 14000, easing: Easing.linear }), -1, false)
    }, [progress])

    const orbStyle = useAnimatedStyle(() => ({
        opacity: 0.38 + Math.sin(progress.value * Math.PI * 2 + 0.7) * 0.08,
        transform: (() => {
            const phase = progress.value * Math.PI * 2
            return [
                { translateX: 165 + Math.cos(phase) * 158 + Math.sin(phase * 2) * 18 },
                { translateY: 34 + Math.sin(phase) * 48 },
                { scale: 1.02 + Math.sin(phase + 1.4) * 0.18 },
            ]
        })(),
    }))

    return (
        <Animated.View pointerEvents="none" style={[styles.disagreeOrb, orbStyle]}>
            <View style={styles.disagreeOrbCore} />
        </Animated.View>
    )
}

// Wraps a feed card so the hero verdict's card can play the "pull out, then slam" pulse after the
// tap-to-scroll lands. Only the hero card (isTarget) binds to the shared scale; every other card
// holds a constant 1, so the single shared value drives exactly one card. Wrapping here keeps the
// shared RatingActivityCard plain rather than threading an animated style through it.
function SlamCell({ isTarget, scale, children }: { isTarget: boolean; scale: SharedValue<number>; children: ReactNode }) {
    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: isTarget ? scale.value : 1 }],
    }))
    return <Animated.View style={animatedStyle}>{children}</Animated.View>
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

function BellIcon() {
    return (
        <Svg width={21} height={21} viewBox="0 0 24 24" fill="none"
            stroke={colors.ink} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <Path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </Svg>
    )
}

export default function FeedScreen() {
    const navigation = useNavigation<FeedNavigation>()
    const insets = useSafeAreaInsets()
    const { token, profile, refreshProfile } = useAuth()
    const avatarInitial = (profile?.display_name || profile?.username || "?").charAt(0).toUpperCase()
    const avatarColor = avatarColorToken(profile?.avatar_color, colors.ink)
    const [events, setEvents] = useState<FeedEvent[]>([])
    const [nextCursor, setNextCursor] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const [reportingEventId, setReportingEventId] = useState<number | null>(null)
    const [reportReason, setReportReason] = useState<ReportReason | null>(null)
    const [reportDetails, setReportDetails] = useState("")
    const [isReporting, setIsReporting] = useState(false)
    const [reportedEventId, setReportedEventId] = useState<number | null>(null)
    const [reportError, setReportError] = useState<string | null>(null)
    const [isSavingLikePrivacy, setIsSavingLikePrivacy] = useState(false)
    const [hideLikeCounts, setHideLikeCounts] = useState(profile?.hide_like_counts ?? false)
    // Three-dots option sheets: own cards get the full action set; others get report/block.
    const [ownMenuEvent, setOwnMenuEvent] = useState<FeedEvent | null>(null)
    const [otherMenuEvent, setOtherMenuEvent] = useState<FeedEvent | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [quietToastVisible, setQuietToastVisible] = useState(false)
    const [quietToastKey, setQuietToastKey] = useState(0)
    const quietToastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [friendsCardDismissed, setFriendsCardDismissed] = useState(false)
    // Session-only show/hide for the locked Social Cards block (Recent Verdict teaser +
    // the locked module grid). Only surfaced while the module gate itself is locked.
    const [socialCardsCollapsed, setSocialCardsCollapsed] = useState(false)
    const [heroRaters, setHeroRaters] = useState<ProfileBase[]>([])
    const [rerateRadar, setRerateRadar] = useState<RerateRadarItem | null>(null)
    const [consensus, setConsensus] = useState<ConsensusModule | null>(null)
    const [disagreement, setDisagreement] = useState<DisagreementModule | null>(null)
    const [splitDecision, setSplitDecision] = useState<SplitDecisionModule | null>(null)
    const [matchMoment, setMatchMoment] = useState<MatchMomentModule | null>(null)
    const [thisOrThat, setThisOrThat] = useState<ThisOrThatModule | null>(null)
    const [thisOrThatSaving, setThisOrThatSaving] = useState(false)
    // A tap arms a side (asks for a second tap to confirm) instead of submitting immediately;
    // tapping the other side re-arms it there instead. Cleared whenever the card resolves or a
    // fresh module fetch swaps in different data underneath it.
    const [armedThisOrThatSongId, setArmedThisOrThatSongId] = useState<number | null>(null)
    // Holds the outcome (which side won, whether it swapped) so a result popup can show it — the
    // backend already returns this; nothing was surfacing it. `thisOrThat` itself stays populated
    // (not nulled) while this is set, so the popup can still read the pair's songs/positions;
    // dismissing the popup (View in Rankings / Done) is what actually clears the card.
    const [thisOrThatResult, setThisOrThatResult] = useState<
        { winnerSongId: number; swapped: boolean; comparisonSessionUuid: string } | null
    >(null)
    const [thisOrThatUndoing, setThisOrThatUndoing] = useState(false)
    // "full" is the live comparison card. "collapsed" is the slim re-expandable teaser after the X
    // is tapped (a soft dismiss — the pair is still held locally, not cleared). "cooldown" is the
    // resting state shown right after a confirmed pick, until the next real module fetch replaces
    // it (or removes it once the server-side cooldown is reflected).
    const [thisOrThatDisplayMode, setThisOrThatDisplayMode] = useState<"full" | "collapsed" | "cooldown">("full")
    // Mirrors thisOrThatDisplayMode for loadModules to read without needing it as a dependency —
    // putting the state itself in that useCallback's deps would recreate the callback every time
    // the mode changes, which would re-fire the mount effect below (it depends on loadModules) and
    // trigger a redundant extra fetch on every confirm/dismiss/undo/expand.
    const thisOrThatDisplayModeRef = useRef(thisOrThatDisplayMode)
    useEffect(() => {
        thisOrThatDisplayModeRef.current = thisOrThatDisplayMode
    }, [thisOrThatDisplayMode])
    // Timestamp the cooldown view counts down to (real 24h server cooldown, stamped the moment we
    // enter cooldown — close enough to server truth for this session; a fresh module fetch later
    // replaces this whole view with whatever the server actually has). Ticks once a second so the
    // seconds digit in the countdown actually moves.
    const [thisOrThatCooldownUntil, setThisOrThatCooldownUntil] = useState<number | null>(null)
    const [thisOrThatCooldownNow, setThisOrThatCooldownNow] = useState(() => Date.now())
    useEffect(() => {
        if (thisOrThatDisplayMode !== "cooldown") return
        const interval = setInterval(() => setThisOrThatCooldownNow(Date.now()), 1000)
        return () => clearInterval(interval)
    }, [thisOrThatDisplayMode])
    const hiddenThisOrThatPair = useRef<string | null>(null)
    // Drives the armed-side "inflate" (art scales up slightly) and the Confirm pill's pop-in.
    const totLeftScale = useSharedValue(1)
    const totRightScale = useSharedValue(1)
    const totConfirmScale = useSharedValue(0)
    useEffect(() => {
        if (thisOrThat === null) {
            totLeftScale.value = 1
            totRightScale.value = 1
            totConfirmScale.value = 0
            return
        }
        const leftArmed = armedThisOrThatSongId === thisOrThat.left.song.id && thisOrThatResult === null
        const rightArmed = armedThisOrThatSongId === thisOrThat.right.song.id && thisOrThatResult === null
        totLeftScale.value = withTiming(leftArmed ? 1.06 : 1, { duration: 500, easing: Easing.out(Easing.cubic) })
        totRightScale.value = withTiming(rightArmed ? 1.06 : 1, { duration: 500, easing: Easing.out(Easing.cubic) })
        if (leftArmed || rightArmed) {
            // Reset to 0 first so the pop replays every time the armed side changes — including
            // switching directly from one side to the other, where the value is already at 1 and
            // a spring toward 1 would otherwise be a no-op. Tight damping relative to stiffness
            // keeps it snappy rather than floaty.
            totConfirmScale.value = 0
            totConfirmScale.value = withSpring(1, { damping: 22, stiffness: 380, mass: 0.6 })
        } else {
            totConfirmScale.value = withTiming(0, { duration: 150 })
        }
    }, [armedThisOrThatSongId, thisOrThat, thisOrThatResult])
    const totLeftArtStyle = useAnimatedStyle(() => ({ transform: [{ scale: totLeftScale.value }] }))
    const totRightArtStyle = useAnimatedStyle(() => ({ transform: [{ scale: totRightScale.value }] }))
    const totConfirmAnimatedStyle = useAnimatedStyle(() => ({
        opacity: totConfirmScale.value,
        transform: [{ scale: 0.82 + totConfirmScale.value * 0.18 }],
    }))
    const listRef = useRef<FlashListRef<FeedEvent>>(null)
    // Drives the "pull out then slam" emphasis pulse on the hero verdict's activity card once the
    // tap-to-scroll lands on it. A single shared value is enough — only the hero card binds to it.
    const slamScale = useSharedValue(1)
    const slamTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
    useEffect(() => () => { if (slamTimeout.current) clearTimeout(slamTimeout.current) }, [])
    useEffect(() => () => { if (quietToastTimeout.current) clearTimeout(quietToastTimeout.current) }, [])
    // Unread notifications badge on the header bell. Refetched whenever the Feed regains focus
    // (e.g. returning from the Notifications screen, where they get marked read).
    const [unreadCount, setUnreadCount] = useState(0)
    useFocusEffect(
        useCallback(() => {
            if (!token) return
            getUnreadCount(token)
                .then((res) => setUnreadCount(res.unread_count))
                .catch(() => {})
        }, [token]),
    )

    // Score reveal (your own scores) stays gated on rated >= 10 — a separate calibration gate.
    const gettingStartedComplete = (profile?.user_stats?.rated_count ?? 0) >= 10
    // The Feed module AREA (Split/Consensus/Re-rate/Disagreement/Match/Recent Verdict) unlocks at
    // rated >= MODULE_UNLOCK_RATED AND following >= 3. Below it the compact teaser grid shows; at it the
    // full cards go live per their own data rules. Keep in sync with backend MODULE_GATE_MIN_RATED.
    const MODULE_UNLOCK_RATED = 10
    const modulesGateComplete =
        (profile?.user_stats?.rated_count ?? 0) >= MODULE_UNLOCK_RATED &&
        (profile?.following_count ?? 0) >= 3
    // The Getting-started banner and Feed modules use one shared launch-readiness gate: 10 ratings
    // plus 3 follows. That keeps the compact teasers, full cards, Rankings, and Taste Profile copy
    // from implying separate unlock moments.
    const onboardingComplete = gettingStartedComplete && (profile?.following_count ?? 0) >= 3
    // This-or-That has its own, higher rated threshold so it doesn't surface in the same moment as
    // the score reveal or the module-strip unlock above. Keep in sync with backend
    // THIS_OR_THAT_MIN_RATED — only used to decide whether it's worth fetching modules at all below
    // the social gate; the backend is still the source of truth for whether a prompt exists.
    const THIS_OR_THAT_MIN_RATED = 15
    const thisOrThatMayBeEligible = (profile?.user_stats?.rated_count ?? 0) >= THIS_OR_THAT_MIN_RATED
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

    const clearModules = useCallback(() => {
        setThisOrThat(null)
        setArmedThisOrThatSongId(null)
        setThisOrThatResult(null)
        setThisOrThatDisplayMode("full")
        setRerateRadar(null)
        setConsensus(null)
        setDisagreement(null)
        setSplitDecision(null)
        setMatchMoment(null)
    }, [])

    // Feed module aggregates ride their own bundled endpoint, refreshed alongside the feed.
    // The personal This-or-That prompt is not friend-gated, so we still fetch once the user has
    // enough rated songs even if the social module gate is closed. The backend keeps social cards null
    // until their gate is met. A module fetch failure just leaves cards locked and never blanks Feed.
    const loadModules = useCallback(async () => {
        if (!token || (!modulesGateComplete && !thisOrThatMayBeEligible)) {
            clearModules()
            return
        }
        try {
            const modules = await getFeedModules(token)
            const nextThisOrThat = modules.this_or_that
            if (nextThisOrThat !== null) {
                // A live prompt exists — always show it fresh, even if we were mid-cooldown or
                // collapsed from a previous pair.
                setArmedThisOrThatSongId(null)
                setThisOrThatResult(null)
                setThisOrThatDisplayMode("full")
                setThisOrThat(
                    _thisOrThatKey(nextThisOrThat) === hiddenThisOrThatPair.current
                        ? null
                        : nextThisOrThat,
                )
            } else if (thisOrThatDisplayModeRef.current === "full") {
                // Nothing live, and we weren't already resting in collapsed/cooldown locally.
                setArmedThisOrThatSongId(null)
                setThisOrThatResult(null)
                setThisOrThat(null)
                if (modules.this_or_that_cooldown_until !== null) {
                    // The server knows why: a pick or dismiss (this session or a prior one — e.g.
                    // this is a fresh app load) put it in cooldown. Show that resting card instead
                    // of nothing, using the server's own cooldown end time.
                    setThisOrThatCooldownNow(Date.now())
                    setThisOrThatCooldownUntil(new Date(modules.this_or_that_cooldown_until).getTime())
                    setThisOrThatDisplayMode("cooldown")
                } else {
                    // Genuinely nothing — never eligible, or no candidate pairs left.
                    setThisOrThatDisplayMode("full")
                }
            }
            // else: already resting in collapsed/cooldown from something that happened THIS
            // session — leave it exactly as it is rather than collapsing it to nothing on the next
            // natural refetch.
            setRerateRadar(modules.rerate_radar)
            setConsensus(modules.consensus)
            setDisagreement(modules.disagreement_spotlight)
            setSplitDecision(modules.split_decision)
            setMatchMoment(modules.match_moment)
        } catch {
            clearModules()
        }
    }, [token, modulesGateComplete, thisOrThatMayBeEligible, clearModules])

    const handleLoadMore = () => {
        if (!nextCursor || isLoading || isLoadingMore) return
        loadFeed(nextCursor, false)
    }

    // Pull-to-refresh: reload the first page of activity and the module aggregates together.
    const refreshFeed = useCallback(
        () => Promise.all([loadFeed(null, true), loadModules()]),
        [loadFeed, loadModules],
    )
    const { refreshing, onRefresh } = usePullRefresh(refreshFeed)

    // Open the song behind the live Re-rate Radar card. Song Detail resolves the viewer's ranking.
    const handleRerateRadarPress = () => {
        if (rerateRadar === null) return
        navigation.navigate("SongDetail", { song: rerateRadar.song })
    }

    // Open the song behind the live Consensus card.
    const handleConsensusPress = () => {
        if (consensus === null) return
        navigation.navigate("SongDetail", { song: consensus.song })
    }

    // Open the song behind the live Disagreement card.
    const handleDisagreementPress = () => {
        if (disagreement === null) return
        navigation.navigate("SongDetail", { song: disagreement.song })
    }

    // Open the song behind the live Split Decision card.
    const handleSplitDecisionPress = () => {
        if (splitDecision === null) return
        navigation.navigate("SongDetail", { song: splitDecision.song })
    }

    // Open the winning song behind the live Match Moment card.
    const handleMatchMomentPress = () => {
        if (matchMoment === null) return
        navigation.navigate("SongDetail", { song: matchMoment.winner })
    }

    // Tapping a side arms it (or re-arms, on the other side); tapping the already-armed side again
    // deselects it. Confirming is a separate, explicit tap on the revealed "Confirm" pill.
    const handleThisOrThatArm = (songId: number) => {
        if (thisOrThat === null || thisOrThatSaving || thisOrThatResult !== null) return
        setArmedThisOrThatSongId((current) => (current === songId ? null : songId))
    }

    const handleThisOrThatConfirm = async (winnerSongId: number) => {
        if (!token || thisOrThat === null) return
        setThisOrThatSaving(true)
        try {
            const result = await chooseThisOrThat(
                thisOrThat.left.song.id,
                thisOrThat.right.song.id,
                winnerSongId,
                token,
            )
            // Opens the result popup; `thisOrThat` is left populated so it can read the pair's
            // songs/positions. The user closes it explicitly (View in Rankings / Done / Undo).
            setThisOrThatResult({
                winnerSongId,
                swapped: result.swapped,
                comparisonSessionUuid: result.comparison_session_uuid,
            })
            refreshProfile()
        } catch {
            setArmedThisOrThatSongId(null)
            Alert.alert("Could not save that pick", "Pull to refresh and try the next one.")
        } finally {
            setThisOrThatSaving(false)
        }
    }

    // Closes the result popup and clears the Feed card — shared by both its buttons.
    // Closes the result popup into the cooldown resting state — the card stays put (not cleared)
    // until the next real module fetch reflects the server-side cooldown.
    const closeThisOrThatResult = () => {
        setArmedThisOrThatSongId(null)
        setThisOrThatResult(null)
        const now = Date.now()
        setThisOrThatCooldownNow(now)
        setThisOrThatCooldownUntil(now + THIS_OR_THAT_COOLDOWN_MS)
        setThisOrThatDisplayMode("cooldown")
    }

    const handleThisOrThatResultDone = () => {
        closeThisOrThatResult()
    }

    const handleThisOrThatViewRankings = () => {
        closeThisOrThatResult()
        navigation.navigate("Rankings")
    }

    // Reverses the pick server-side (undoes any swap, erases the receipt) and puts the same pair
    // back up, live, for a fresh decision — unlike Done/View, this does NOT go to cooldown.
    const handleThisOrThatUndo = async () => {
        if (!token || thisOrThatResult === null || thisOrThatUndoing) return
        setThisOrThatUndoing(true)
        try {
            await undoThisOrThat(thisOrThatResult.comparisonSessionUuid, token)
            setThisOrThatResult(null)
            setArmedThisOrThatSongId(null)
            setThisOrThatDisplayMode("full")
            refreshProfile()
        } catch {
            Alert.alert("Could not undo", "That pick can no longer be undone.")
        } finally {
            setThisOrThatUndoing(false)
        }
    }

    // A soft dismiss: collapses to the slim re-expandable teaser rather than clearing the card.
    // Still tells the server (so a genuinely fresh fetch later respects the cooldown), but the
    // pair stays available locally in case the viewer taps back in before that happens.
    const handleThisOrThatDismiss = async () => {
        if (!token || thisOrThat === null || thisOrThatSaving || thisOrThatResult !== null) return
        const dismissed = thisOrThat
        hiddenThisOrThatPair.current = _thisOrThatKey(dismissed)
        setThisOrThatDisplayMode("collapsed")
        try {
            await dismissThisOrThat(
                dismissed.left.song.id,
                dismissed.right.song.id,
                token,
            )
        } catch {
            // Dismiss is a soft preference signal; keep Feed calm if it fails.
        }
    }

    const handleThisOrThatExpand = () => {
        setThisOrThatDisplayMode("full")
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

    const handleSongPress = (event: FeedEvent) => {
        if (reportingEventId !== null) return
        navigation.navigate("SongDetail", { song: event.song })
    }

    const showQuietToast = () => {
        if (quietToastTimeout.current) clearTimeout(quietToastTimeout.current)
        setQuietToastKey((current) => current + 1)
        setQuietToastVisible(true)
        quietToastTimeout.current = setTimeout(() => {
            setQuietToastVisible(false)
            quietToastTimeout.current = null
        }, 1200)
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
        try {
            const updated = await updateLikePrivacy(nextValue, token)
            setHideLikeCounts(updated.hide_like_counts)
            await refreshProfile()
        } catch {
            // best effort — keep the previous value on failure
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

    // ── Own activity card options: Re-rate / Reorder / Remove / like privacy ──
    const handleOwnReRate = async () => {
        const ev = ownMenuEvent
        if (!ev || !token) return
        setOwnMenuEvent(null)
        try {
            // Re-rate needs the full catalog song (isrc/artist ids); the ranking carries it.
            const ranking = ev.song.deezer_id != null
                ? await getMyRankingByDeezerId(ev.song.deezer_id, token)
                : await getMyRankingBySongId(ev.song.id, token)
            navigation.navigate("BucketSelection", { song: ranking.song as never })
        } catch {
            navigation.navigate("BucketSelection", { song: ev.song as never })
        }
    }

    const handleOwnReorder = () => {
        if ((profile?.user_stats?.rated_count ?? 0) < 10) return // locked until 10 ratings
        setOwnMenuEvent(null)
        navigation.navigate("Reorder")
    }

    const handleOwnRemove = () => {
        const ev = ownMenuEvent
        if (!ev || !token) return
        setOwnMenuEvent(null)
        Alert.alert(
            "Remove this song from your rankings? This cannot be undone.",
            undefined,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Remove",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await removeRating(ev.song.id, token)
                            setEvents((prev) => prev.filter((e) => e.id !== ev.id))
                        } catch { /* best effort — leave the card if removal failed */ }
                    },
                },
            ],
        )
    }

    const handleOwnToggleLikePrivacy = () => {
        setOwnMenuEvent(null)
        toggleLikePrivacy()
    }

    // ── Other users' card options: report a note / block the user (UGC safety) ──
    const handleReportFromMenu = () => {
        const ev = otherMenuEvent
        setOtherMenuEvent(null)
        if (ev && ev.note !== null) openReport(ev.id)
    }

    const handleBlockFromMenu = () => {
        const ev = otherMenuEvent
        if (!ev || !token) return
        setOtherMenuEvent(null)
        Alert.alert(
            `Block @${ev.actor_profile.username}?`,
            "They won't see your taste or appear in your feed, and you won't see theirs.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Block",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await blockUser(ev.actor_profile.username, token)
                            setEvents((prev) => prev.filter((e) => e.actor_profile.user_id !== ev.actor_profile.user_id))
                        } catch { /* best effort */ }
                    },
                },
            ],
        )
    }

    // Recent Verdict module: feature the freshest verdict from someone the viewer follows
    // (skip the viewer's own events). Falls back to the locked teaser when there's none yet.
    const heroEvent = events.find((e) => e.actor_profile.user_id !== profile?.user_id) ?? null
    const heroSongId = heroEvent?.song.id ?? null

    // The social-cards area is collapsible whenever it is entirely locked: below the gate (compact
    // teaser grid) OR gate-met-but-every-card-locked (full-size cards, followed users just inactive).
    // Once any card can go live we never let the whole strip be hidden.
    const allSocialCardsLocked =
        heroEvent === null &&
        !rerateRadar &&
        !consensus &&
        !disagreement &&
        !splitDecision &&
        !matchMoment
    const socialCardsCollapsible = !modulesGateComplete || allSocialCardsLocked

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

    // Tapping the hero scrolls down to the same verdict's card in the activity list, then gives that
    // card a quick "pull out, then slam" pulse so the eye lands on exactly what the tap pointed at.
    const scrollToHeroActivity = () => {
        if (heroEvent === null) return
        const index = events.findIndex((e) => e.id === heroEvent.id)
        if (index < 0) return
        // viewOffset keeps the card from landing flush against the screen top (where the status bar /
        // Dynamic Island would clip it once the list header scrolls away) — drop it the safe-area
        // inset plus a little breathing room so it rests comfortably just below the notch. FlashList
        // ADDS viewOffset to the scroll position, so a negative value scrolls less far / lands lower.
        listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0, viewOffset: -(insets.top + 16) })
        // Wait for the scroll to roughly settle so the pulse plays on a card that's already in view.
        if (slamTimeout.current) clearTimeout(slamTimeout.current)
        slamScale.value = 1
        slamTimeout.current = setTimeout(() => {
            slamScale.value = withSequence(
                // Pull out: lift the card toward the viewer.
                withTiming(1.06, { duration: 190, easing: Easing.out(Easing.cubic) }),
                // Slam: snap it back down fast, just past resting...
                withTiming(0.97, { duration: 90, easing: Easing.in(Easing.cubic) }),
                // ...then settle to rest with a crisp hint of bounce.
                withSpring(1, { damping: 12, stiffness: 420, mass: 0.6 }),
            )
        }, 420)
    }

    // Tapping "{n} TODAY" jumps down to the top of the activity list (the first event), landing it just
    // below the notch — same safe-area offset trick as the hero tap so the Dynamic Island can't clip it.
    const scrollToActivityTop = () => {
        if (events.length === 0) return
        listRef.current?.scrollToIndex({ index: 0, animated: true, viewPosition: 0, viewOffset: -(insets.top + 16) })
    }

    const renderRecentVerdict = () => {
        if (heroEvent === null) {
            // Below the module gate the compact "Recent Verdicts" row in renderLockedSection covers
            // this slot, so don't double up with the full teaser here. Above the gate (no followed
            // verdict yet), show the full locked teaser like the other unlocked-area cards. The live
            // hero swaps in the moment heroEvent exists, in either state.
            if (!modulesGateComplete) return null
            return (
                <BouncyPressable style={styles.fvOuter} onPress={showQuietToast}>
                    <View style={styles.fvInner}>
                        <DriftingStars dots={ORBIT_DOTS_DIM} />
                        <View style={{ position: "relative" }}>
                            <View style={styles.fullCellTop}>
                                <View style={styles.fvPill}><Text style={styles.fvPillText}>Recent verdict</Text></View>
                            </View>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12 }}>
                                <View style={styles.lockDotXl}><MoonIcon color="#fff" size={18} /></View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.lvLockedTitle}>No verdicts yet</Text>
                                    <Text style={styles.lvLockedBody}>Follow people to see their freshest ratings.</Text>
                                </View>
                            </View>
                        </View>
                    </View>
                    <View style={styles.fvFooter}>
                        <View style={{ flex: 1 }}>
                            <View style={[styles.skBar, { width: "48%", height: 11, backgroundColor: "rgba(17,19,28,0.12)" }]} />
                            <View style={[styles.skBar, { width: "30%", height: 7, backgroundColor: "rgba(17,19,28,0.08)", marginTop: 6 }]} />
                        </View>
                        <Text style={styles.fvHint}>FOLLOW FOR VERDICTS</Text>
                    </View>
                </BouncyPressable>
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
                                                    { backgroundColor: avatarColorFor(r.avatar_color, r.username), marginLeft: i > 0 ? -7 : 0 },
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
                        <View style={[styles.verdictBody, !heroEvent.note && styles.verdictBodyNoNote]}>
                            <Text style={styles.verdictScore}>{heroEvent.new_score.toFixed(1)}</Text>
                            <View style={styles.verdictMetaCol}>
                                <Text style={styles.verdictWho} numberOfLines={1}>
                                    @{heroEvent.actor_profile.username.toUpperCase()} · {bucketLabel}
                                </Text>
                                {heroEvent.note ? (
                                    <Text style={styles.verdictNote} numberOfLines={2} ellipsizeMode="tail">
                                        "{heroEvent.note}"
                                    </Text>
                                ) : (
                                    // No caption on this verdict — same big white text as a note, but
                                    // unquoted, with a tap glyph (the hero scrolls to this verdict's card).
                                    <View style={styles.verdictCtaRow}>
                                        <Text style={styles.verdictCtaText} numberOfLines={1}>See Rating in Feed</Text>
                                        <VerdictFingerCue />
                                    </View>
                                )}
                            </View>
                        </View>
                    </View>
                </TouchableOpacity>
                {/* Footer — "Rate this" opens the song page. */}
                <TouchableOpacity
                    style={styles.verdictFooter}
                    activeOpacity={0.7}
                    onPress={() => handleSongPress(heroEvent)}
                    testID={`feed-verdict-rate-${heroEvent.id}`}
                >
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.verdictSongTitle} numberOfLines={1}>{heroEvent.song.title}</Text>
                        <Text style={styles.verdictSongArtist} numberOfLines={1}>{heroEvent.song.artist.toUpperCase()}</Text>
                    </View>
                    <ArrowLabel text="RATE THIS" direction="up-right" color={colors.accent} textStyle={styles.verdictRate} />
                </TouchableOpacity>
            </View>
        )
    }

    // Recent Verdict is rendered separately (not gated by rated>=10); this section is the rest.
    // Re-rate Radar half-tile: the live delta card when a followed user has moved a score,
    // otherwise the original locked placeholder (the slot keeps its locked state, never hides).
    const renderRerateRadar = () => {
        if (rerateRadar === null) {
            return (
                <BouncyPressable
                    style={[styles.fullCell, { height: 138, backgroundColor: colors.navy }]}
                    onPress={showQuietToast}
                    testID="feed-rerate-radar-locked"
                >
                    <View style={[styles.fullCellPad, { justifyContent: "space-between" }]}>
                        <View style={styles.fullCellTop}>
                            <View style={styles.goldPill}><Text style={styles.goldPillText}>Re-rate radar</Text></View>
                        </View>
                        {/* Placeholder song row. Sits clear of the pill: the four space-between rows
                            share the freed height from the shorter sparkline below. */}
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <HatchBox size={24} radius={6} tone="light" />
                            <View style={{ flex: 1 }}>
                                <View style={[styles.skBar, { width: "62%", height: 10, backgroundColor: "rgba(255,255,255,0.3)" }]} />
                            </View>
                        </View>
                        {/* Sparkline as flex child 3/4 */}
                        <Svg width="100%" height={20} viewBox="0 0 100 34" preserveAspectRatio="none">
                            <Polyline
                                points="8,27 32,22 54,18 75,12 89,7"
                                fill="none"
                                stroke={colors.gold}
                                strokeOpacity="0.4"
                                strokeWidth="2"
                                strokeDasharray="3 3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </Svg>
                        {/* Caption next to the quiet cue. Capped at 2 lines so this row matches the Match
                            Moment card's caption height and both status dots line up across the pair. */}
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <View style={styles.lockDotSm}><MoonIcon color="#fff" size={14} /></View>
                            <Text style={[styles.lockCardDesc, { flex: 1, color: "rgba(255,255,255,0.55)" }]} numberOfLines={2}>Score shifts from people you follow</Text>
                        </View>
                    </View>
                </BouncyPressable>
            )
        }

        const r = rerateRadar
        const delta = r.new_score - r.previous_score
        const up = delta >= 0
        const deltaColor = up ? colors.gold : colors.sky
        // The trajectory line maps each score (0–10) to a y in the sparkline viewBox, so the
        // slope and the two end nodes reflect the actual previous → new change, not a canned curve.
        const SPARK_VB = 42
        const SPARK_PAD = 6
        const scoreToY = (s: number) =>
            SPARK_PAD + (1 - Math.max(0, Math.min(10, s)) / 10) * (SPARK_VB - 2 * SPARK_PAD)
        const startY = scoreToY(r.previous_score)
        const endY = scoreToY(r.new_score)
        // Hold a flat baseline at the previous score, then bend to the new score on the right.
        // The bend's direction and steepness reflect the real change; round joins soften the elbow.
        const sparkPoints = `8,${startY.toFixed(1)} 44,${startY.toFixed(1)} 89,${endY.toFixed(1)}`
        // Node tops in px: the polyline (viewBox height SPARK_VB) is stretched to the SPARK_H-tall row.
        const startTop = (startY / SPARK_VB) * SPARK_H
        const endTop = (endY / SPARK_VB) * SPARK_H
        return (
            <TouchableOpacity
                style={[styles.fullCell, { height: 138, backgroundColor: colors.navy }]}
                activeOpacity={0.9}
                onPress={handleRerateRadarPress}
                testID={`feed-rerate-radar-${r.rating_event_id}`}
            >
                <View style={[styles.fullCellPad, { justifyContent: "space-between" }]}>
                    {/* minHeight matches Match Moment's actor avatar so both cards' pills line up. */}
                    <View style={[styles.fullCellTop, { minHeight: 22 }]}>
                        <View style={styles.goldPill}><Text style={styles.goldPillText}>Re-rate radar</Text></View>
                    </View>
                    {/* Standalone flex child so space-between gives the handle equal room above and below. */}
                    <Text style={styles.rrUser} numberOfLines={1}>@{r.actor_profile.username}</Text>
                    <View style={styles.rrBody}>
                        {r.song.cover_url ? (
                            <Image style={styles.rrArt} source={{ uri: r.song.cover_url }} />
                        ) : (
                            <View style={[styles.rrArt, { backgroundColor: colors.navyHi }]} />
                        )}
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.rrSong} numberOfLines={1}>{r.song.title}</Text>
                            <Text style={styles.rrArtist} numberOfLines={1}>{r.song.artist.toUpperCase()}</Text>
                        </View>
                    </View>
                    {/* Trajectory: gold line rising/falling between a dim start node and a glowing end node. */}
                    <View style={styles.rrSpark}>
                        <Svg width="100%" height="100%" viewBox="0 0 100 42" preserveAspectRatio="none">
                            <Polyline
                                points={sparkPoints}
                                fill="none"
                                stroke={colors.gold}
                                strokeWidth="2.4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </Svg>
                        <View style={[styles.rrSparkStart, { top: startTop }]} />
                        <RadarRipplePoint top={endTop} color={colors.gold} />
                    </View>
                    <View style={styles.rrDeltaRow}>
                        <Text style={styles.rrPrev}>{r.previous_score.toFixed(1)}</Text>
                        <Text style={styles.rrNew}>{r.new_score.toFixed(1)}</Text>
                        <View style={[styles.rrDeltaChip, { backgroundColor: `${deltaColor}26` }]}>
                            <Text style={[styles.rrDelta, { color: deltaColor }]}>{`${up ? "+" : ""}${delta.toFixed(1)}`}</Text>
                        </View>
                    </View>
                </View>
            </TouchableOpacity>
        )
    }

    // Consensus half-tile: live circle average + score distribution when ≥3 circle members rate a song,
    // otherwise the original locked placeholder. Circle = mutual follows (backend filters to mutual +
    // visible, never one-way); the viewer is never part of the aggregate.
    const renderConsensus = () => {
        if (consensus === null) {
            return (
                <BouncyPressable
                    style={[styles.fullCell, { height: 138, backgroundColor: colors.sky }]}
                    onPress={showQuietToast}
                    testID="feed-consensus-locked"
                >
                    <View style={[styles.fullCellPad, { justifyContent: "space-between" }]}>
                        <View style={styles.fullCellTop}>
                            <View style={styles.lightPill}><Text style={styles.lightPillText}>Consensus</Text></View>
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                            <View style={styles.lockDotLg}><MoonIcon color="#fff" size={16} /></View>
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
                </BouncyPressable>
            )
        }

        const c = consensus
        // Histogram: flat-bottomed bars spanning the circle's low→high range (their values flank it),
        // heights following a bell peaked at the average so the tallest bar IS the average (marked with a
        // dot). The peak's horizontal position shows skew within the range; the raw 10-bin distribution
        // couldn't do this with only a handful of friends (every occupied bin held one rater, all equal).
        const WAVE_BARS = 15
        const range = c.high_score - c.low_score
        const avgRel = range > 0.05 ? Math.min(1, Math.max(0, (c.average_score - c.low_score) / range)) : 0.5
        const sigma = 0.26 // bell width in normalized range units — fixed, so the wave always fills the space
        const avgBarIndex = Math.round(avgRel * (WAVE_BARS - 1))
        const waveBars = Array.from({ length: WAVE_BARS }, (_, i) => {
            if (i === avgBarIndex) return 1 // force the average bar to the tallest peak
            const x = i / (WAVE_BARS - 1)
            const bell = Math.exp(-((x - avgRel) ** 2) / (2 * sigma * sigma))
            const ripple = 0.82 + 0.18 * Math.abs(Math.sin(i * 1.9)) // gentle waveform texture (deterministic)
            return Math.max(0.16, bell * ripple * 0.94)
        })
        return (
            <TouchableOpacity
                style={[styles.fullCell, { height: 138, backgroundColor: colors.sky }]}
                activeOpacity={0.9}
                onPress={handleConsensusPress}
                testID={`feed-consensus-${c.song.id}`}
            >
                <View style={[styles.fullCellPad, { justifyContent: "space-between" }]}>
                    <View style={styles.fullCellTop}>
                        <View style={styles.lightPill}><Text style={styles.lightPillText}>Consensus</Text></View>
                    </View>
                    {/* "N circle ratings" sits above the song. Each line is its own space-between child so the
                        pill→label, label→title, and title→verdict gaps all come out equal. */}
                    <Text style={styles.consRatedLabel}>{c.contributor_count} CIRCLE RATINGS</Text>
                    <Text style={styles.consSong} numberOfLines={1}>{c.song.title}</Text>
                    {/* Their verdict: the average (big number + label) peaking over a low→high histogram. */}
                    <View>
                        <View style={styles.consAvgRow}>
                            <Text style={styles.consAvg}>{c.average_score.toFixed(1)}</Text>
                            <Text style={styles.consAvgLabel}>average</Text>
                        </View>
                        <View style={styles.consSpread} testID="feed-consensus-spread">
                            <Text style={styles.consSpreadEndLabel}>{c.low_score.toFixed(1)}</Text>
                            <ConsensusWaveBars bars={waveBars} avgBarIndex={avgBarIndex} />
                            <Text style={styles.consSpreadEndLabel}>{c.high_score.toFixed(1)}</Text>
                        </View>
                    </View>
                </View>
            </TouchableOpacity>
        )
    }

    // Disagreement Spotlight: live "you vs your circle" gap when a qualifying song exists, else the
    // original locked placeholder. Circle = mutual follows (viewer excluded from their average).
    const renderDisagreement = () => {
        if (disagreement === null) {
            return (
                <BouncyPressable
                    style={styles.fullDisagreeCard}
                    onPress={showQuietToast}
                    testID="feed-disagreement-locked"
                >
                    <View style={styles.fullCellTop}>
                        <View style={styles.butterPill}><Text style={styles.butterPillText}>Disagreement spotlight</Text></View>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 11 }}>
                        <HatchBox size={48} radius={9} tone="dark" />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.disagreeLockedTitle}>Quiet for now</Text>
                            <Text style={styles.disagreeLockedBody}>Rate more to see where you split from your circle.</Text>
                        </View>
                        <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
                            <View style={{ alignItems: "center" }}>
                                <Text style={styles.disagreeColLabel}>YOU</Text>
                                <View style={styles.disagreeColCircle}><MoonIcon color={colors.inkDim} size={13} /></View>
                            </View>
                            <View style={styles.disagreeDivider} />
                            <View style={{ alignItems: "center" }}>
                                <Text style={styles.disagreeColLabel}>CIRCLE</Text>
                                <View style={styles.disagreeColCircle}><MoonIcon color={colors.inkDim} size={13} /></View>
                            </View>
                        </View>
                    </View>
                </BouncyPressable>
            )
        }

        const d = disagreement
        // Backend gap = abs(your_score − friends_average) on raw scores. Derive the displayed "APART"
        // from the SAME rounded values shown below so YOU, CIRCLE, and APART always reconcile on screen
        // (rounding each independently could otherwise leave them looking 0.1 off, e.g. 7.5 − 4.9 ≠ 2.5).
        const apart = Math.abs(Number(d.your_score.toFixed(1)) - Number(d.friends_average.toFixed(1)))
        return (
            <TouchableOpacity
                style={styles.fullDisagreeCard}
                activeOpacity={0.9}
                onPress={handleDisagreementPress}
                testID={`feed-disagreement-${d.song.id}`}
            >
                <DisagreementSpotlightOrb />
                <View style={styles.fullCellTop}>
                    <View style={styles.butterPill}><Text style={styles.butterPillText}>Disagreement spotlight</Text></View>
                    <Text style={styles.disagreeApart}>{apart.toFixed(1)} APART</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 11 }}>
                    {d.song.cover_url ? (
                        <Image style={styles.disagreeArt} source={{ uri: d.song.cover_url }} />
                    ) : (
                        <View style={[styles.disagreeArt, { backgroundColor: colors.paper2 }]} />
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.disagreeSong} numberOfLines={1}>{d.song.title}</Text>
                        <Text style={styles.disagreeArtist} numberOfLines={1}>{d.song.artist.toUpperCase()}</Text>
                    </View>
                    <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
                        <View style={{ alignItems: "center" }}>
                            <Text style={styles.disagreeColLabel}>YOU</Text>
                            <Text style={[styles.disagreeScore, { color: colors.accent }]}>{d.your_score.toFixed(1)}</Text>
                        </View>
                        <View style={styles.disagreeDivider} />
                        <View style={{ alignItems: "center" }}>
                            <Text style={styles.disagreeColLabel}>CIRCLE</Text>
                            <Text style={[styles.disagreeScore, { color: colors.inkSoft }]}>{d.friends_average.toFixed(1)}</Text>
                        </View>
                    </View>
                </View>
            </TouchableOpacity>
        )
    }

    // Split Decision: live when two people the viewer follows are far apart on a song, else locked.
    // Participants are followed-visible "people you follow" (not necessarily mutual friends).
    const renderSplitDecision = () => {
        if (splitDecision === null) {
            return (
                <BouncyPressable
                    style={[styles.fullCell, { height: 138, backgroundColor: "#000" }]}
                    onPress={showQuietToast}
                    testID="feed-split-locked"
                >
                    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none">
                        <Polygon points="0,0 100,0 0,100" fill={colors.plum} />
                        <Polygon points="100,0 100,100 0,100" fill={colors.accent} />
                    </Svg>
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(13,15,23,0.5)" }]} />
                    <View style={[styles.fullCellPad, { justifyContent: "space-between" }]}>
                        <View style={styles.fullCellTop}>
                            <View style={styles.darkPill}><Text style={styles.darkPillText}>Split</Text></View>
                        </View>
                        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8 }}>
                            <View style={styles.lockDotLg}><MoonIcon color="#fff" size={16} /></View>
                            <Text style={styles.fullLockHint}>When two people you follow split on a song</Text>
                        </View>
                    </View>
                </BouncyPressable>
            )
        }

        const s = splitDecision
        const bust = (person: SplitDecisionModule["high"]) => (
            <View style={[styles.splitBust, { backgroundColor: avatarColorFor(person.profile.avatar_color, person.profile.username) }]}>
                <Text style={styles.splitBustLetter}>
                    {(person.profile.display_name || person.profile.username)[0].toUpperCase()}
                </Text>
            </View>
        )
        return (
            <TouchableOpacity
                style={[styles.fullCell, { height: 138, backgroundColor: "#000" }]}
                activeOpacity={0.9}
                onPress={handleSplitDecisionPress}
                testID={`feed-split-${s.song.id}`}
            >
                <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none">
                    <Polygon points="0,0 100,0 0,100" fill={colors.plum} />
                    <Polygon points="100,0 100,100 0,100" fill={colors.accent} />
                </Svg>
                {/* Light scrim only — keep the plum/orange vibrant for the live split while holding white text legible. */}
                <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(13,15,23,0.14)" }]} />
                <View style={[styles.fullCellPad, { justifyContent: "space-between" }]}>
                    <View style={styles.fullCellTop}>
                        <View style={styles.darkPill}><Text style={styles.darkPillText}>Split · {s.gap.toFixed(1)} gap</Text></View>
                    </View>
                    {/* Centerpiece: the split song, circular with a white ring, title sitting just below. */}
                    <View style={styles.splitCenter}>
                        <SplitSongMotion>
                            {s.song.cover_url ? (
                                <Image style={styles.splitArt} source={{ uri: s.song.cover_url }} />
                            ) : (
                                <View style={[styles.splitArt, { backgroundColor: "rgba(0,0,0,0.2)" }]} />
                            )}
                        </SplitSongMotion>
                        <Text style={styles.splitSong} numberOfLines={1}>‘{s.song.title}’</Text>
                    </View>
                    <View style={styles.splitRow}>
                        <View style={styles.splitSide}>
                            {bust(s.high)}
                            <Text style={styles.splitScore}>{s.high.score.toFixed(1)}</Text>
                        </View>
                        <View style={styles.splitSide}>
                            <Text style={styles.splitScore}>{s.low.score.toFixed(1)}</Text>
                            {bust(s.low)}
                        </View>
                    </View>
                </View>
            </TouchableOpacity>
        )
    }

    // Match Moment: live when someone the viewer follows has a recent finalized head-to-head pick
    // (winner › loser), else the original locked placeholder. Audience = people you follow (one-way).
    const renderMatchMoment = () => {
        if (matchMoment === null) {
            return (
                <BouncyPressable
                    style={[styles.fullCell, { height: 138, backgroundColor: colors.mint }]}
                    onPress={showQuietToast}
                    testID="feed-match-moment-locked"
                >
                    <View style={styles.matchMomentBlob} />
                    <View style={[styles.fullCellPad, { justifyContent: "space-between" }]}>
                        <View style={styles.fullCellTop}>
                            <View style={styles.lightPill}><Text style={styles.lightPillText}>Match moment</Text></View>
                        </View>
                        {/* Head-to-head: winner (check badge) › loser. Static › on the locked teaser. */}
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
                            <View>
                                <HatchBox size={42} radius={8} tone="light" />
                                <View style={styles.matchMomentCheck}><CheckIcon color={colors.mint} size={10} /></View>
                            </View>
                            <Text style={styles.matchMomentGt}>›</Text>
                            <HatchBox size={32} radius={7} tone="light" />
                        </View>
                        {/* Caption next to the quiet cue. Capped at 2 lines so this row matches the Re-rate
                            card's caption height and both status dots line up across the pair. */}
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <View style={styles.lockDotSm}><MoonIcon color="#fff" size={14} /></View>
                            <Text style={[styles.lockCardDesc, { flex: 1 }]} numberOfLines={2}>Picks from people you follow</Text>
                        </View>
                    </View>
                </BouncyPressable>
            )
        }

        const m = matchMoment
        const aColor = avatarColorFor(m.actor_profile.avatar_color, m.actor_profile.username)
        const aInitial = (m.actor_profile.display_name || m.actor_profile.username || "?").charAt(0).toUpperCase()
        return (
            <TouchableOpacity
                style={[styles.fullCell, { height: 138, backgroundColor: colors.mint }]}
                activeOpacity={0.9}
                onPress={handleMatchMomentPress}
                testID={`feed-match-moment-${m.winner.id}`}
            >
                <View style={styles.matchMomentBlob} />
                <View style={[styles.fullCellPad, { justifyContent: "space-between" }]}>
                    {/* minHeight reserves the avatar's height so the pill lines up with the Re-rate card's pill. */}
                    <View style={[styles.fullCellTop, { minHeight: 22 }]}>
                        <View style={styles.lightPill}><Text style={styles.lightPillText}>Match moment</Text></View>
                        {/* Actor avatar, top right */}
                        <View style={[styles.mmActorAvatar, { backgroundColor: aColor }]}>
                            <Text style={styles.actorInitial}>{aInitial}</Text>
                        </View>
                    </View>
                    {/* Head-to-head: winner cover (check badge) › faded loser cover, then handle + song-over-song */}
                    <View style={{ gap: 6 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
                            <View>
                                {m.winner.cover_url ? (
                                    <Image style={styles.mmWinnerArt} source={{ uri: m.winner.cover_url }} />
                                ) : (
                                    <View style={[styles.mmWinnerArt, { backgroundColor: "rgba(255,255,255,0.15)" }]} />
                                )}
                                <View style={styles.matchMomentCheck}><CheckIcon color={colors.mint} size={10} /></View>
                            </View>
                            <MatchMomentGtMotion />
                            {m.loser.cover_url ? (
                                <Image style={styles.mmLoserArt} source={{ uri: m.loser.cover_url }} />
                            ) : (
                                <View style={[styles.mmLoserArt, { backgroundColor: "rgba(255,255,255,0.12)" }]} />
                            )}
                        </View>
                        <View>
                            {/* "@user picked" above the song-over-song decision */}
                            <Text style={styles.mmActorLine} numberOfLines={1}>@{m.actor_profile.username} picked</Text>
                            <Text style={styles.mmWinnerTitle} numberOfLines={1}>{m.winner.title}</Text>
                            <Text style={styles.mmLoserTitle} numberOfLines={1}>over {m.loser.title}</Text>
                        </View>
                    </View>
                </View>
            </TouchableOpacity>
        )
    }

    // Heads the This-or-That card, mirroring renderSocialCardsHeader's row. Only shows when there's
    // actually a card underneath it (full, collapsed, or cooldown) — never a label over empty space.
    const renderThisOrThatHeader = () => {
        // Cooldown can render without `thisOrThat` (e.g. a fresh app load mid-cooldown, where the
        // server only sends the cooldown timer, not the original pair) — so this can't just check
        // `thisOrThat !== null` the way the other module headers do.
        if (thisOrThat === null && thisOrThatDisplayMode !== "cooldown") return null
        return (
            <View style={[styles.sectionRow, { marginTop: 6, marginBottom: 8 }]}>
                <Text style={styles.sectionLabel}>FOR YOU</Text>
            </View>
        )
    }

    // Slim re-expandable teaser shown after the X is tapped — a mini overlapped-cover stack, a
    // reminder of what it is, and a chevron to bring the full card back.
    const renderThisOrThatCollapsed = () => {
        if (thisOrThat === null) return null
        return (
            <TouchableOpacity
                style={styles.totCollapsed}
                activeOpacity={0.88}
                onPress={handleThisOrThatExpand}
                testID="feed-this-or-that-collapsed"
            >
                <View style={styles.totCollapsedArtStack}>
                    {thisOrThat.left.song.cover_url ? (
                        <Image style={[styles.totCollapsedArt, styles.totCollapsedArtBack]} source={{ uri: thisOrThat.left.song.cover_url }} />
                    ) : (
                        <View style={[styles.totCollapsedArt, styles.totCollapsedArtBack, { backgroundColor: colors.navyHi }]} />
                    )}
                    {thisOrThat.right.song.cover_url ? (
                        <Image style={[styles.totCollapsedArt, styles.totCollapsedArtFront]} source={{ uri: thisOrThat.right.song.cover_url }} />
                    ) : (
                        <View style={[styles.totCollapsedArt, styles.totCollapsedArtFront, { backgroundColor: colors.navyHi }]} />
                    )}
                </View>
                <View style={styles.totCollapsedText}>
                    <View style={styles.totCollapsedKickerRow}>
                        <TuneIcon color={colors.gold} size={11} />
                        <Text style={styles.totCollapsedKicker}>THIS-OR-THAT</Text>
                    </View>
                    <Text style={styles.totCollapsedBody}>Tap to compare two songs</Text>
                </View>
                <View style={styles.totCollapsedChevron}>
                    <ChevronRightIcon color={colors.cream} size={14} />
                </View>
            </TouchableOpacity>
        )
    }

    // Resting state right after a confirmed pick, OR after a fresh app load lands mid-cooldown (no
    // local memory of the actual pair — the server only sends the cooldown timer then). Same shape
    // as the collapsed teaser (mini art stack + kicker) but not tappable, with a live "Xh Ym"
    // countdown instead of a chevron. Falls back to a plain icon where the art stack would go when
    // there's no pair data to show.
    const renderThisOrThatCooldown = () => {
        const remainingMs = Math.max(0, (thisOrThatCooldownUntil ?? thisOrThatCooldownNow) - thisOrThatCooldownNow)
        const remainingHours = Math.floor(remainingMs / (60 * 60 * 1000))
        const remainingMinutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000))
        const remainingSeconds = Math.floor((remainingMs % (60 * 1000)) / 1000)
        return (
            <BouncyPressable style={styles.totCollapsed} testID="feed-this-or-that-cooldown">
                {thisOrThat !== null ? (
                    <View style={styles.totCollapsedArtStack}>
                        {thisOrThat.left.song.cover_url ? (
                            <Image style={[styles.totCollapsedArt, styles.totCooldownArtRound, styles.totCollapsedArtBack]} source={{ uri: thisOrThat.left.song.cover_url }} />
                        ) : (
                            <View style={[styles.totCollapsedArt, styles.totCooldownArtRound, styles.totCollapsedArtBack, { backgroundColor: colors.navyHi }]} />
                        )}
                        {thisOrThat.right.song.cover_url ? (
                            <Image style={[styles.totCollapsedArt, styles.totCooldownArtRound, styles.totCollapsedArtFront]} source={{ uri: thisOrThat.right.song.cover_url }} />
                        ) : (
                            <View style={[styles.totCollapsedArt, styles.totCooldownArtRound, styles.totCollapsedArtFront, { backgroundColor: colors.navyHi }]} />
                        )}
                    </View>
                ) : (
                    <View style={styles.totCooldownIconFallback}>
                        <TuneIcon color={colors.gold} size={16} />
                    </View>
                )}
                <View style={styles.totCollapsedText}>
                    <View style={styles.totCollapsedKickerRow}>
                        <TuneIcon color={colors.gold} size={11} />
                        <Text style={styles.totCollapsedKicker}>THIS-OR-THAT</Text>
                    </View>
                    <Text style={styles.totCollapsedBody} numberOfLines={1}>Next comparison in</Text>
                </View>
                <View style={styles.totCooldownCountdown}>
                    <ClockIcon color={colors.cdim} size={14} />
                    <Text style={styles.totCooldownCountdownText} numberOfLines={1}>
                        {remainingHours}<Text style={styles.totCooldownCountdownUnit}>h</Text> {remainingMinutes}<Text style={styles.totCooldownCountdownUnit}>m</Text> {remainingSeconds}<Text style={styles.totCooldownCountdownUnit}>s</Text>
                    </Text>
                </View>
            </BouncyPressable>
        )
    }

    // Full-bleed art card: tap a side to arm it (the other dims, the art inflates slightly and a
    // "TAP TO CONFIRM" pill pops in over it); tap the armed side again to deselect; tap the pill to
    // submit. No rank numbers or bucket labels show on the card itself — only the pill's color
    // teases the bucket — so nothing nudges the pick before it's made.
    const renderThisOrThat = () => {
        // Cooldown can render even without `thisOrThat` (see renderThisOrThatCooldown) — check it
        // first. Collapsed and the full card both need the actual pair, so they still bail below.
        if (thisOrThatDisplayMode === "cooldown") return renderThisOrThatCooldown()
        if (thisOrThat === null) return null
        if (thisOrThatDisplayMode === "collapsed") return renderThisOrThatCollapsed()
        const tone = bucketColor(thisOrThat.bucket)
        const resolving = thisOrThatSaving || thisOrThatResult !== null
        const option = (side: ThisOrThatModule["left"], edge: "left" | "right", artStyle: typeof totLeftArtStyle) => {
            const isArmed = armedThisOrThatSongId === side.song.id && !resolving
            const isDimmed = armedThisOrThatSongId !== null && !isArmed
            return (
                <TouchableOpacity
                    style={styles.totHalf}
                    activeOpacity={0.92}
                    onPress={() => handleThisOrThatArm(side.song.id)}
                    disabled={resolving}
                    testID={`feed-this-or-that-option-${side.song.id}`}
                >
                    {side.song.cover_url ? (
                        <Animated.Image
                            style={[styles.totHalfArt, artStyle]}
                            source={{ uri: side.song.cover_url }}
                        />
                    ) : (
                        <Animated.View style={[styles.totHalfArt, artStyle, { backgroundColor: colors.navyHi }]} />
                    )}
                    <View style={styles.totHalfScrim} pointerEvents="none" />
                    {isDimmed && <View style={styles.totHalfDim} pointerEvents="none" />}
                    {isArmed && (
                        <View
                            style={[
                                styles.totHalfArmedRing,
                                { borderColor: tone },
                                edge === "left" ? styles.totHalfArmedRingLeft : styles.totHalfArmedRingRight,
                            ]}
                            pointerEvents="none"
                        />
                    )}
                    {isArmed && (
                        <Animated.View style={[styles.totConfirmPillWrap, totConfirmAnimatedStyle]} pointerEvents="box-none">
                            <TouchableOpacity
                                style={styles.totConfirmPill}
                                activeOpacity={0.85}
                                onPress={() => handleThisOrThatConfirm(side.song.id)}
                                testID={`feed-this-or-that-confirm-${side.song.id}`}
                            >
                                <CheckIcon color={tone} size={13} />
                                <Text style={styles.totConfirmPillText}>TAP TO CONFIRM</Text>
                            </TouchableOpacity>
                        </Animated.View>
                    )}
                    <View style={[styles.totHalfCaption, isDimmed && { opacity: 0.5 }]} pointerEvents="none">
                        <Text style={styles.totHalfTitle} numberOfLines={1}>{side.song.title}</Text>
                        <Text style={styles.totHalfArtist} numberOfLines={1}>{side.song.artist}</Text>
                    </View>
                </TouchableOpacity>
            )
        }

        return (
            <View style={styles.thisOrThatCard} testID="feed-this-or-that-card">
                <View style={styles.totRow}>
                    {option(thisOrThat.left, "left", totLeftArtStyle)}
                    {option(thisOrThat.right, "right", totRightArtStyle)}
                    <View style={styles.totTopBadge} pointerEvents="none">
                        <TuneIcon color={colors.gold} size={12} />
                        <Text style={styles.totTopBadgeText}>THIS-OR-THAT</Text>
                    </View>
                    {armedThisOrThatSongId === null && !resolving && (
                        <TouchableOpacity
                            style={styles.totDismiss}
                            onPress={handleThisOrThatDismiss}
                            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                            testID="feed-this-or-that-dismiss"
                        >
                            <Text style={styles.totDismissX}>✕</Text>
                        </TouchableOpacity>
                    )}
                    <View
                        style={[styles.totOrChip, (armedThisOrThatSongId !== null || resolving) && styles.totOrChipFaded]}
                        pointerEvents="none"
                    >
                        <Text style={styles.totOrChipText}>or</Text>
                    </View>
                </View>
            </View>
        )
    }

    // Result popup after a confirmed This-or-That pick — a compact version of Score Reveal's
    // language (hero art + badge, its place in the bucket, View in Rankings / Done) rather than a
    // full screen. The winner always ends up at the smaller of the pair's two positions and the
    // loser at the larger one, whether or not a swap actually happened, so the two rows never need
    // the `swapped` flag to order themselves — only the framing copy above them does.
    const renderThisOrThatResultModal = () => {
        if (thisOrThat === null || thisOrThatResult === null) return null
        const tone = bucketColor(thisOrThat.bucket)
        const bucketLabel = thisOrThat.bucket === "alright" ? "OKAY" : thisOrThat.bucket.toUpperCase()
        const winner = thisOrThat.left.song.id === thisOrThatResult.winnerSongId ? thisOrThat.left : thisOrThat.right
        const loser = winner === thisOrThat.left ? thisOrThat.right : thisOrThat.left
        const topPosition = Math.min(thisOrThat.left.position, thisOrThat.right.position)
        const bottomPosition = Math.max(thisOrThat.left.position, thisOrThat.right.position)
        const rows: Array<{ option: ThisOrThatModule["left"]; position: number; isWinner: boolean }> = [
            { option: winner, position: topPosition, isWinner: true },
            { option: loser, position: bottomPosition, isWinner: false },
        ]

        return (
            <Modal
                visible
                transparent
                animationType="fade"
                onRequestClose={handleThisOrThatResultDone}
            >
                <Pressable
                    style={styles.totResultOverlay}
                    onPress={handleThisOrThatResultDone}
                    testID="feed-this-or-that-result-overlay"
                >
                    <Pressable style={styles.totResultCard} onPress={() => {}} testID="feed-this-or-that-result">
                        <View style={styles.totResultHeader}>
                            <View style={styles.totResultHeaderLeft}>
                                <View style={[styles.totResultIconChip, { backgroundColor: `${tone}1a` }]}>
                                    <TuneIcon color={tone} size={13} />
                                </View>
                                <Text style={styles.totResultKicker} numberOfLines={1}>THIS-OR-THAT RESULT</Text>
                            </View>
                            <TouchableOpacity
                                style={[styles.totResultUndoBtn, thisOrThatUndoing && { opacity: 0.5 }]}
                                activeOpacity={0.85}
                                onPress={handleThisOrThatUndo}
                                disabled={thisOrThatUndoing}
                                testID="feed-this-or-that-result-undo"
                            >
                                <UndoIcon color={colors.inkSoft} size={13} />
                                <Text style={styles.totResultUndoBtnText}>UNDO</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.totResultHero}>
                            {winner.song.cover_url ? (
                                <Image style={[styles.totResultArt, { borderColor: tone }]} source={{ uri: winner.song.cover_url }} />
                            ) : (
                                <View style={[styles.totResultArt, { borderColor: tone, backgroundColor: colors.paper2 }]} />
                            )}
                            <View style={styles.totResultHeroText}>
                                <View style={[styles.totResultBadge, { backgroundColor: tone }]}>
                                    <CheckIcon color="#fff" size={11} />
                                    <Text style={styles.totResultBadgeText}>YOUR PICK</Text>
                                </View>
                                <Text style={styles.totResultTitle} numberOfLines={1}>{winner.song.title}</Text>
                                <Text style={styles.totResultArtist} numberOfLines={1}>ranks above {loser.song.title}</Text>
                            </View>
                        </View>

                        <Text style={styles.totResultSlotKicker}>ITS PLACE IN YOUR {bucketLabel}S</Text>
                        <View style={styles.totResultSlotList}>
                            {rows.map((row) => (
                                <View
                                    key={row.option.song.id}
                                    style={[
                                        styles.totResultSlotRow,
                                        row.isWinner && { backgroundColor: `${tone}12`, borderColor: `${tone}33` },
                                    ]}
                                >
                                    <Text style={styles.totResultSlotRank}>{row.position}</Text>
                                    {row.option.song.cover_url ? (
                                        <Image style={styles.totResultSlotArt} source={{ uri: row.option.song.cover_url }} />
                                    ) : (
                                        <View style={[styles.totResultSlotArt, { backgroundColor: colors.paper2 }]} />
                                    )}
                                    <View style={styles.totResultSlotInfo}>
                                        <View style={styles.totResultSlotTitleRow}>
                                            <Text style={styles.totResultSlotTitle} numberOfLines={1}>{row.option.song.title}</Text>
                                            {row.isWinner && (
                                                <View style={[styles.totResultNewBadge, { backgroundColor: `${tone}22` }]}>
                                                    <Text style={[styles.totResultNewBadgeText, { color: tone }]}>YOUR PICK</Text>
                                                </View>
                                            )}
                                        </View>
                                        <Text style={styles.totResultSlotArtist} numberOfLines={1}>{row.option.song.artist}</Text>
                                    </View>
                                    <Text style={[styles.totResultSlotScore, row.isWinner && { color: tone }]}>
                                        {row.option.score.toFixed(1)}
                                    </Text>
                                </View>
                            ))}
                        </View>

                        <View style={styles.totResultFooter}>
                            <TouchableOpacity
                                style={[styles.totResultViewBtn, { backgroundColor: tone }]}
                                activeOpacity={0.88}
                                onPress={handleThisOrThatViewRankings}
                                testID="feed-this-or-that-result-view-rankings"
                            >
                                <Text style={styles.totResultViewBtnText}>View in Rankings</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.totResultDoneBtn}
                                activeOpacity={0.88}
                                onPress={handleThisOrThatResultDone}
                                testID="feed-this-or-that-result-done"
                            >
                                <Text style={styles.totResultDoneBtnText}>Done</Text>
                            </TouchableOpacity>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>
        )
    }

    // Heads the whole social-cards area (Recent Verdict + the module grid). Rendered above
    // renderRecentVerdict() so it stays above Recent Verdict whether the verdict is the live hero,
    // the locked teaser, or the compact locked row — in every gate state. When the section is
    // entirely locked it keeps only the show/hide toggle; the Getting Started card owns progress.
    const renderSocialCardsHeader = () => {
        return (
            // The header owns both its margins so it sits right in every state. For an empty user
            // Recent Verdict below is null, so the header can't lean on that card's top margin for its
            // bottom gap — hence an explicit marginBottom. Top is trimmed so the gap up to the Find
            // your people card above doesn't read as a void.
            <View style={[styles.sectionRow, { marginTop: 6, marginBottom: 8, alignItems: "center" }]}>
                <Text style={styles.sectionLabel}>SOCIAL CARDS</Text>
                {socialCardsCollapsible && (
                    <TouchableOpacity
                        onPress={() => setSocialCardsCollapsed((c) => !c)}
                        accessibilityRole="button"
                        accessibilityLabel={socialCardsCollapsed ? "Show locked cards" : "Hide locked cards"}
                        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                        style={styles.socialCardsToggle}
                        testID="feed-social-cards-toggle"
                    >
                        <Text style={styles.socialCardsToggleText}>{socialCardsCollapsed ? "SHOW" : "HIDE"}</Text>
                        <ChevronDownIcon color={colors.accent} size={12} up={!socialCardsCollapsed} />
                    </TouchableOpacity>
                )}
            </View>
        )
    }

    const renderUnlockedSection = () => (
        <View style={styles.unlockedSection}>
            {/* Row: Split (live-or-locked) + Consensus (138px) */}
            <View style={styles.fullRow}>
                {renderSplitDecision()}
                {renderConsensus()}
            </View>

            {/* Row: Re-rate Radar (live-or-locked, 150px) + Match Moment (live-or-locked, 150px) */}
            <View style={styles.fullRow}>
                {renderRerateRadar()}
                {renderMatchMoment()}
            </View>

            {renderDisagreement()}
        </View>
    )

    // Compact teaser grid — shown below the module gate (brand-new accounts). Each tile is a locked
    // placeholder that bounces on tap; the full-size cards replace this grid once the gate
    // (rated >= MODULE_UNLOCK_RATED AND following >= 3) is met. The "SOCIAL CARDS" header is rendered
    // above renderRecentVerdict() in the page body, so it always heads this whole area. Recent Verdict
    // appears here as a compact row only while it has no live hero (the live hero is promoted above).
    const renderLockedSection = () => (
        <View style={styles.lockedSection} testID="feed-social-cards-locked-section">
            {/* Recent Verdicts compact teaser — only while it's still locked. Once a followed
                verdict exists it is promoted to the full hero above, so this row drops out and the
                "SOCIAL CARDS" header then heads only the modules below that are still locked. */}
            {heroEvent === null && (
                <BouncyPressable style={[styles.miniRow, styles.miniRowNavy]}>
                    <DriftingStars dots={ORBIT_DOTS_DIM_10} />
                    <View style={styles.miniRowInner}>
                        <View style={styles.miniLockCircle}>
                            <LockIcon color={colors.cream} />
                        </View>
                        <View style={styles.miniRowText}>
                            <Text style={styles.miniRowLabel} numberOfLines={1}>Recent Verdicts</Text>
                            <Text style={[styles.miniRowSub, { color: colors.cdim }]} numberOfLines={1}>
                                People you follow, front and center
                            </Text>
                        </View>
                        <Text style={[styles.miniLockedTag, { color: colors.cdim }]}>LOCKED</Text>
                    </View>
                </BouncyPressable>
            )}

            {/* 2×2 grid */}
            <View style={styles.miniGridRow}>
                <BouncyPressable style={[styles.miniTile, { backgroundColor: "#000" }]}>
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
                            <Text style={[styles.miniTileSub, { color: "rgba(255,255,255,0.78)" }]} numberOfLines={2}>How people you follow clash</Text>
                        </View>
                    </View>
                </BouncyPressable>

                <BouncyPressable style={[styles.miniTile, { backgroundColor: colors.sky }]}>
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
                </BouncyPressable>
            </View>

            <View style={styles.miniGridRow}>
                <BouncyPressable style={[styles.miniTile, { backgroundColor: colors.navy }]}>
                    <DriftingStars dots={ORBIT_DOTS_DIM_8} />
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
                            <Text style={[styles.miniTileSub, { color: colors.cdim }]} numberOfLines={2}>Shifts from people you follow</Text>
                        </View>
                    </View>
                </BouncyPressable>

                <BouncyPressable style={[styles.miniTile, { backgroundColor: colors.mint }]}>
                    <View style={styles.versusDecoration}>
                        <HatchBox size={27} radius={6} tone="light" />
                        <Text style={styles.matchMomentGt}>›</Text>
                        <HatchBox size={21} radius={5} tone="light" style={{ opacity: 0.7 }} />
                    </View>
                    <View style={styles.miniTileInner}>
                        <View style={styles.miniTileTop}>
                            <View style={styles.miniLockCircle}><LockIcon color="#fff" /></View>
                            <Text style={[styles.miniLockedTag, { color: "rgba(255,255,255,0.6)" }]}>LOCKED</Text>
                        </View>
                        <View>
                            <Text style={[styles.miniTileLabel, { color: "#fff" }]}>Match Moment</Text>
                            <Text style={[styles.miniTileSub, { color: "rgba(255,255,255,0.78)" }]}>Picks from people you follow</Text>
                        </View>
                    </View>
                </BouncyPressable>
            </View>

            {/* Disagreement Spotlight row */}
            <BouncyPressable style={[styles.miniRow, styles.miniRowLight]}>
                <View style={styles.miniRowInner}>
                    <View style={[styles.miniLockCircle, { backgroundColor: "rgba(17,19,28,0.05)" }]}>
                        <LockIcon color={colors.inkDim} />
                    </View>
                    <View style={styles.miniRowText}>
                        <Text style={[styles.miniRowLabel, { color: colors.ink }]} numberOfLines={1}>Disagreement Spotlight</Text>
                        <Text style={[styles.miniRowSub, { color: colors.inkDim }]} numberOfLines={1}>
                            You vs. your circle
                        </Text>
                    </View>
                    <Text style={[styles.miniLockedTag, { color: colors.inkDim }]}>LOCKED</Text>
                </View>
            </BouncyPressable>
        </View>
    )

    const renderGettingStartedBanner = () => {
        const rated = Math.min(profile?.user_stats?.rated_count ?? 0, 10)
        const followingCount = Math.min(profile?.following_count ?? 0, 3)
        // Two home-stretch states mirror each other. followingPending: all 10 ratings in but the 3
        // follows aren't — drop the rating CTA and lean fully into finding people. ratingsPending:
        // the 3 follows are in but ratings aren't at 10 yet — drop the people CTA and lean into
        // rating toward the Rankings-at-10 unlock. (Both done => the banner isn't shown at all.)
        const followingPending = rated >= 10 && followingCount < 3
        const ratingsPending = rated < 10 && followingCount >= 3

        return (
            <View style={styles.orbitCard}>
                <DriftingStars dots={ORBIT_STARS} />
                <View style={styles.orbitContent}>
                    <View style={styles.bannerTopRow}>
                        <View style={styles.orbitPill}>
                            <Text style={styles.orbitPillText}>Getting started</Text>
                        </View>
                        <Text
                            style={[styles.friendCounter, followingPending && styles.friendCounterActive]}
                            testID="feed-getting-started-following-counter"
                        >
                            {followingCount} / 3 FOLLOWING
                        </Text>
                    </View>
                    <Text style={styles.orbitTitle}>
                        {followingPending
                            ? "Songs rated. Follow people."
                            : ratingsPending
                            ? "Almost there! Keep rating."
                            : "Rate songs. Follow people."}
                    </Text>
                    <Text style={styles.orbitBody}>
                        {followingPending
                            ? "Follow 3 people to unlock the Feed modules below."
                            : ratingsPending
                            ? "Rate 10 songs to unlock Rankings and Taste Profile"
                            : "Rate 10 songs and follow 3 people to unlock the Feed modules below."}
                    </Text>
                    <View style={styles.tasteMeterRow}>
                        {Array.from({ length: 10 }).map((_, i) => {
                            // The first empty segment pulses to point at the next rating.
                            if (i === rated) return <PulsingMeterTick key={i} style={styles.tasteMeterSegment} />
                            return (
                                <View
                                    key={i}
                                    testID={`feed-getting-started-meter-tick-${i}`}
                                    style={[
                                        styles.tasteMeterSegment,
                                        // Empty segments all look identical. Reached segments climb a gold
                                        // ramp — muted gold early, bright luminous gold by 10 — so the bar
                                        // "shines up" as you progress (same hue, rising brightness).
                                        i < rated && {
                                            backgroundColor: followingPending ? colors.gold : goldMeterShade(i),
                                        },
                                    ]}
                                />
                            )
                        })}
                    </View>
                    <Text style={styles.tasteMeterLabel}>
                        {followingPending
                            ? "10 / 10 RATED · FOLLOW 3 PEOPLE TO UNLOCK"
                            : `${rated} / 10 RATED · SOCIAL CARDS AT 10`}
                    </Text>
                    <View style={styles.bannerBtns}>
                        {/* Ratings done → drop the rate CTA and promote Find people to the gold slot;
                            follows done → drop the Find people CTA and keep the gold rate button. */}
                        {!followingPending && (
                            <TouchableOpacity
                                style={styles.bannerBtnGold}
                                onPress={() => navigation.navigate("Discover", { screen: "DiscoverHome", params: { focusSearch: true, searchMode: "songs" } })}
                            >
                                <Text style={styles.bannerBtnGoldText}>+ Rate songs</Text>
                            </TouchableOpacity>
                        )}
                        {!ratingsPending && (
                            <TouchableOpacity
                                style={followingPending ? styles.bannerBtnGold : styles.bannerBtnGhost}
                                onPress={handleFindUsers}
                            >
                                <Text style={followingPending ? styles.bannerBtnGoldText : styles.bannerBtnGhostText}>
                                    Find people
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </View>
        )
    }

    // "Find your people" nudge — shown until the user follows 3 people or dismisses
    // it (✕). Follow-gated (not rating-gated), and rendered in both the empty feed
    // and the normal feed header so it persists past the first rating. Both buttons
    // open user search for now (handleFindUsers); see FindYourPeopleCard for the
    // deferred contacts/invite flows.
    const renderFindFriends = () => {
        const followingCount = profile?.following_count ?? 0
        if (friendsCardDismissed || followingCount >= 3) return null
        return (
            <FindYourPeopleCard
                style={styles.findFriendsCard}
                onConnect={handleFindUsers}
                onInvite={handleFindUsers}
                onDismiss={() => setFriendsCardDismissed(true)}
            />
        )
    }

    const renderListHeader = () => {
        const today = new Date()
        // e.g. "TUE, JUN 27" — a conventional, at-a-glance date.
        const dateLabel = today
            .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
            .toUpperCase()
        const todayCount = events.filter(
            (e) => new Date(e.created_at).toDateString() === today.toDateString()
        ).length

        return (
            <View>
                {/* BO-style header */}
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        <Text style={styles.kicker}>HOME · {dateLabel}</Text>
                        <Text style={styles.heading}>LISTn</Text>
                    </View>
                    <View style={styles.headerRight}>
                        <TouchableOpacity
                            style={styles.bellBtn}
                            onPress={() => navigation.navigate("Notifications")}
                            accessibilityLabel="Notifications"
                            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                        >
                            <BellIcon />
                            {unreadCount > 0 && (
                                <View style={styles.bellBadge}>
                                    <Text style={styles.bellBadgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.avatarBtn}
                            onPress={() => navigation.navigate("Profile")}
                            accessibilityLabel="Your profile"
                        >
                            <Avatar initial={avatarInitial} color={avatarColor} size={32} />
                        </TouchableOpacity>
                    </View>
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

                {/* Below the gate (rated < 10 or follow < 3): banner + compact teaser grid, no module
                    data fetched. At the gate: the full-size cards go live per their own data rules. */}
                {!onboardingComplete && renderGettingStartedBanner()}
                {renderFindFriends()}
                {renderThisOrThatHeader()}
                {renderThisOrThat()}
                {renderThisOrThatResultModal()}
                {/* SOCIAL CARDS heads the whole area; Recent Verdict is its first card. Recent Verdict
                    sits with the other module cards but is never gated by rated count — only by having
                    a followed verdict — so it can go live before the rest. */}
                {renderSocialCardsHeader()}
                {(!socialCardsCollapsed || !socialCardsCollapsible) && renderRecentVerdict()}
                {(!socialCardsCollapsed || !socialCardsCollapsible) &&
                    (modulesGateComplete ? renderUnlockedSection() : renderLockedSection())}

                {events.length > 0 && (
                    <View style={styles.sectionRow}>
                        <Text style={styles.sectionLabel}>ACTIVITY</Text>
                        {todayCount > 0 && (
                            <TouchableOpacity
                                onPress={scrollToActivityTop}
                                accessibilityRole="button"
                                accessibilityLabel={`Jump to today's activity, ${todayCount} new`}
                                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                            >
                                <Text style={styles.sectionRight}>{todayCount} TODAY</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}
            </View>
        )
    }

    const renderFeedEvent = ({ item }: { item: FeedEvent; index: number }) => {
        const isOwnEvent = item.actor_profile.user_id === profile?.user_id
        // Use the user's chosen avatar color (falling back to a stable per-name hue) so feed
        // avatars match the user's profile icon everywhere.
        const aColor = avatarColorFor(item.actor_profile.avatar_color, item.actor_profile.username)
        const nameSrc = item.actor_profile.display_name || item.actor_profile.username
        const initial = nameSrc[0].toUpperCase()
        const actionLabel = _eventLabel(item.event_type)

        // One shared card component across Feed / Your Activity / other-profile / single-activity, so
        // the visuals can never drift between surfaces. Feed-only behaviour (tappable actor row, the
        // report panel, own-vs-other options menu) rides in through props and the belowNote slot.
        // This event's card is the hero's scroll target — it binds to the slam pulse.
        const isHeroCard = heroEvent !== null && item.id === heroEvent.id
        return (
            <SlamCell isTarget={isHeroCard} scale={slamScale}>
            <RatingActivityCard
                testID={`feed-row-${item.id}`}
                style={styles.feedCardMargin}
                initial={initial}
                avatarColor={aColor}
                who={isOwnEvent ? "You" : `@${item.actor_profile.username}`}
                actionLabel={actionLabel}
                timeAgo={formatRelativeTime(item.created_at)}
                song={item.song}
                bucket={item.new_bucket}
                score={item.new_score}
                // "?" for the viewer's own score until they've rated 10; others' scores always show.
                hideScore={isOwnEvent && !gettingStartedComplete}
                note={item.note}
                onPress={() => handleSongPress(item)}
                songTestID={`feed-song-${item.id}`}
                onActorPress={() => handleActorPress(item)}
                actorTestID={`feed-actor-${item.id}`}
                actorDisabled={reportingEventId !== null}
                onShare={() => navigation.navigate("ShareActivity", {
                    activity: {
                        username: item.actor_profile.username,
                        initial,
                        avatarColor: aColor,
                        actionLabel,
                        timeAgo: formatRelativeTime(item.created_at),
                        song: item.song,
                        bucket: item.new_bucket,
                        score: item.new_score,
                        hideScore: isOwnEvent && !gettingStartedComplete,
                        note: item.note,
                    },
                })}
                shareTestID={`feed-share-${item.id}`}
                onOptions={() => (isOwnEvent ? setOwnMenuEvent(item) : setOtherMenuEvent(item))}
                optionsTestID={`feed-options-${item.id}`}
                belowNote={
                    <>
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
                    </>
                }
            >
                <ActivityLikeButton
                    ratingEventId={item.id}
                    initialLikedByViewer={item.liked_by_viewer}
                    initialLikeCount={item.like_count}
                    onOpenLikers={openActivityLikers}
                />
            </RatingActivityCard>
            </SlamCell>
        )
    }

    const renderFooter = () => {
        if (isLoadingMore) return <ActivityIndicator color={colors.accent} style={styles.footerSpinner} />
        // Reached the last page — cap the feed off so the bottom feels intentional.
        if (nextCursor === null && events.length > 0) {
            return <EndOfListCap label="You're all caught up" />
        }
        return null
    }

    // Other users' activity options: report a note (when present) or block the user.
    const renderOtherOptionsMenu = () => {
        if (otherMenuEvent === null) return null
        const ev = otherMenuEvent
        return (
            <Modal visible transparent animationType="fade" onRequestClose={() => setOtherMenuEvent(null)}>
                <Pressable style={styles.menuBackdrop} onPress={() => setOtherMenuEvent(null)}>
                    <View
                        style={[styles.sheetCard, { paddingBottom: insets.bottom + 12 }]}
                        onStartShouldSetResponder={() => true}
                        testID={`feed-other-options-panel-${ev.id}`}
                    >
                        <View style={styles.sheetHandle} />
                        <Text style={styles.menuHeader}>ACTIVITY OPTIONS</Text>
                        {ev.note !== null && (
                            <TouchableOpacity style={styles.menuItem} onPress={handleReportFromMenu} testID="feed-report-option">
                                <View style={styles.menuItemIcon}><FlagIcon color={colors.ink} /></View>
                                <View style={styles.menuItemText}>
                                    <Text style={styles.menuItemLabel}>Report note</Text>
                                    <Text style={styles.menuItemSub}>Flag this note for review</Text>
                                </View>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity style={styles.menuItem} onPress={handleBlockFromMenu} testID="feed-block-option">
                            <View style={[styles.menuItemIcon, styles.menuItemIconDanger]}><BlockIcon color={colors.danger} /></View>
                            <View style={styles.menuItemText}>
                                <Text style={[styles.menuItemLabel, { color: colors.danger }]}>Block @{ev.actor_profile.username}</Text>
                                <Text style={styles.menuItemSub}>Hide them from your feed and taste</Text>
                            </View>
                        </TouchableOpacity>
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
        loadModules()
        refreshProfile()
        const tabNavigation = navigation.getParent<BottomTabNavigationProp<TabParamList, "Feed">>()
        return tabNavigation?.addListener("focus", () => {
            loadFeed(null, true)
            loadModules()
            refreshProfile()
        })
    }, [loadFeed, loadModules, refreshProfile, navigation])

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
            <ScrollView
                style={styles.container}
                // Match the populated FlashList's bottom inset so the empty "Your feed is empty"
                // card clears the raised center FAB and the home indicator (insets.bottom + 100).
                contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
            >
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        <Text style={styles.kicker}>{welcomeKicker}</Text>
                        <Text style={styles.heading}>LISTn</Text>
                    </View>
                    <View style={styles.headerRight}>
                        <TouchableOpacity
                            style={styles.bellBtn}
                            onPress={() => navigation.navigate("Notifications")}
                            accessibilityLabel="Notifications"
                            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                        >
                            <BellIcon />
                            {unreadCount > 0 && (
                                <View style={styles.bellBadge}>
                                    <Text style={styles.bellBadgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.avatarBtn}
                            onPress={() => navigation.navigate("Profile")}
                            accessibilityLabel="Your profile"
                        >
                            <Avatar initial={avatarInitial} color={avatarColor} size={32} />
                        </TouchableOpacity>
                    </View>
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

                {!onboardingComplete && renderGettingStartedBanner()}
                {renderFindFriends()}
                {renderThisOrThatHeader()}
                {renderThisOrThat()}
                {renderThisOrThatResultModal()}
                {/* SOCIAL CARDS heads the whole area; Recent Verdict is its first card. Recent Verdict
                    sits with the other module cards but is never gated by rated count — only by having
                    a followed verdict — so it can go live before the rest. */}
                {renderSocialCardsHeader()}
                {(!socialCardsCollapsed || !socialCardsCollapsible) && renderRecentVerdict()}
                {(!socialCardsCollapsed || !socialCardsCollapsible) &&
                    (modulesGateComplete ? renderUnlockedSection() : renderLockedSection())}

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
                                Follow people and rate songs — their ratings, re-rates and co-signs will land here.
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
                // The list fills from the top (its header scrolls), so drop the refresh spinner below
                // the status bar / Dynamic Island instead of letting it sit under the notch.
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        progressViewOffset={insets.top}
                        tintColor={colors.inkDim}
                    />
                }
                ListHeaderComponent={renderListHeader()}
                ListFooterComponent={renderFooter}
                maintainVisibleContentPosition={{ disabled: true }}
                // Clear the raised center FAB and the home indicator. With the cap's own 8px bottom
                // pad this leaves insets.bottom + 108 under the last line, matching ProfileScreen.
                contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
                ItemSeparatorComponent={null}
            />
            {renderOtherOptionsMenu()}
            <OwnActivitySheet
                visible={ownMenuEvent !== null}
                songTitle={ownMenuEvent?.song.title}
                reorderLocked={(profile?.user_stats?.rated_count ?? 0) < 10}
                hideLikeCounts={hideLikeCounts}
                onReRate={handleOwnReRate}
                onReorder={handleOwnReorder}
                onRemove={handleOwnRemove}
                onToggleLikePrivacy={handleOwnToggleLikePrivacy}
                onClose={() => setOwnMenuEvent(null)}
            />
            {quietToastVisible ? (
                <Animated.View
                    key={quietToastKey}
                    pointerEvents="none"
                    entering={FadeIn.duration(90)}
                    exiting={FadeOut.duration(380)}
                    style={styles.quietToast}
                    testID="feed-quiet-toast"
                >
                    <Text style={styles.quietToastText}>Quiet for now</Text>
                </Animated.View>
            ) : null}
        </View>
    )
}

function _eventLabel(eventType: FeedEvent["event_type"]): string {
    if (eventType === "rerated") return "RERATED"
    if (eventType === "reordered") return "RERANKED"
    return "RATED"
}

function _thisOrThatKey(module: ThisOrThatModule | null): string | null {
    if (module === null) return null
    return `${module.left.song.id}:${module.right.song.id}`
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
    quietToast: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 104,
        alignItems: "center",
        zIndex: 20,
    },
    quietToastText: {
        overflow: "hidden",
        borderRadius: 999,
        backgroundColor: "rgba(17,20,29,0.9)",
        color: "#fff",
        fontFamily: fonts.mono,
        fontSize: 10,
        fontWeight: "700",
        letterSpacing: 1.1,
        paddingHorizontal: 14,
        paddingVertical: 8,
        textTransform: "uppercase",
    },
    // ── Header ──────────────────────────────────────────────────────────
    header: {
        paddingTop: 60,
        paddingHorizontal: 16,
        paddingBottom: 10,
        flexDirection: "row",
        // Align the right-side icon with the title (bottom of the kicker+heading
        // column), not the small kicker label above it.
        alignItems: "flex-end",
        justifyContent: "space-between",
    },
    headerLeft: {},
    headerRight: {
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
    },
    bellBtn: {
        marginTop: 4,
        // Anchor for the unread badge.
        position: "relative",
    },
    bellBadge: {
        position: "absolute",
        top: -5,
        right: -6,
        minWidth: 16,
        height: 16,
        borderRadius: 8,
        paddingHorizontal: 4,
        backgroundColor: colors.accent,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1.5,
        borderColor: colors.bg,
    },
    bellBadgeText: {
        color: "#fff",
        fontFamily: fonts.mono,
        fontSize: 9,
        fontWeight: "700",
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
    avatarBtn: {
        marginTop: 4,
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
    // ── Social Cards header (show/hide toggle) ───────────
    socialCardsToggle: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        flexShrink: 0,
    },
    socialCardsToggleText: {
        fontFamily: fonts.mono,
        fontSize: 8.5,
        letterSpacing: 0.6,
        color: colors.accent,
        fontWeight: "700",
    },
    // ── Event card ────────────────────────────────────────────────────────
    // The shared RatingActivityCard owns the card chrome (background, border, radius, padding,
    // shadow). Its `card` style has no horizontal margin so callers place it; the Feed adds 14.
    feedCardMargin: {
        marginHorizontal: 14,
    },
    // actorInitial is still used by the Recent Verdict module's mini avatars.
    actorInitial: {
        color: "#fff",
        fontWeight: "700",
        fontSize: 12,
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
    // ── Activity options bottom sheet (slides up from the "···") ───────────
    menuBackdrop: {
        flex: 1,
        justifyContent: "flex-end",
        backgroundColor: "rgba(22,20,19,0.4)",
    },
    sheetCard: {
        backgroundColor: colors.paper,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        borderWidth: 1,
        borderColor: colors.line,
        paddingHorizontal: 8,
        paddingTop: 8,
        shadowColor: colors.ink,
        shadowOpacity: 0.18,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: -4 },
        elevation: 12,
    },
    sheetHandle: {
        alignSelf: "center",
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: colors.line,
        marginTop: 2,
        marginBottom: 8,
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
    menuItemIconDanger: {
        backgroundColor: "rgba(224,73,46,0.10)",
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
    friendCounterActive: {
        overflow: "hidden",
        borderRadius: 999,
        backgroundColor: "rgba(245,184,64,0.16)",
        color: colors.gold,
        paddingHorizontal: 9,
        paddingVertical: 4,
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
    tasteMeterSegment: meterSegment,
    // Filled-segment colours come from goldMeterShade(i) inline except the follow-pending home
    // stretch, where all completed ticks turn one uniform gold to say the rating work is done.
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
    // Re-rate Radar — live half-tile state (a followed user's score change), modeled on the
    // design's RerateCard: gold pill + handle, song, rising/falling trajectory, struck-from → gold-to.
    rrUser: {
        fontFamily: fonts.mono,
        fontSize: 9.5,
        letterSpacing: 0.5,
        color: "rgba(241,236,221,0.85)",
        // Extra vertical margin (on top of the even space-between gaps) gives the handle more
        // breathing room above and below without touching the symmetric top/bottom card padding.
        marginVertical: 1,
    },
    rrBody: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    rrArt: {
        width: 24,
        height: 24,
        borderRadius: 6,
    },
    rrSong: {
        fontFamily: fonts.display,
        fontSize: 12,
        lineHeight: 13,
        color: colors.cream,
    },
    rrArtist: {
        fontFamily: fonts.mono,
        fontSize: 7.5,
        letterSpacing: 0.5,
        color: "rgba(241,236,221,0.6)",
        marginTop: 2,
    },
    rrSpark: {
        position: "relative",
        height: SPARK_H,
    },
    rrSparkStart: {
        position: "absolute",
        left: "8%",
        width: 5,
        height: 5,
        borderRadius: 2.5,
        marginLeft: -2.5,
        marginTop: -2.5,
        backgroundColor: colors.gold,
        opacity: 0.55,
    },
    rrSparkEndWrap: {
        position: "absolute",
        left: "89%",
        width: 22,
        height: 22,
        marginLeft: -11,
        marginTop: -11,
        alignItems: "center",
        justifyContent: "center",
    },
    rrSparkRipple: {
        position: "absolute",
        width: 11,
        height: 11,
        borderRadius: 5.5,
        borderWidth: 1,
    },
    rrSparkEndDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        shadowOpacity: 0.95,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 0 },
    },
    rrDeltaRow: {
        flexDirection: "row",
        // Baseline-align the scores so the big new score and the small crossed-out one share the
        // same digit baseline (flex-end floats the big one high because it has more descent space).
        alignItems: "baseline",
        gap: 8,
        // Digits have no descenders, so the descent space baseline alignment reserves below them
        // (for a hypothetical "g" or "y") sits empty — pull the row down to cancel it out, so the
        // gap below the numbers reads the same as the gap above the pill.
        marginBottom: -5,
    },
    rrPrev: {
        fontFamily: fonts.display,
        fontSize: 15,
        lineHeight: 16,
        color: colors.cdim,
        textDecorationLine: "line-through",
    },
    rrNew: {
        fontFamily: fonts.display,
        fontSize: 26,
        lineHeight: 26,
        letterSpacing: -0.4,
        color: colors.gold,
    },
    rrDeltaChip: {
        marginLeft: "auto",
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 3,
        // The chip aligns by its own text baseline, which leaves its padded box hanging below the
        // scores' baseline — lift it so the pill's bottom edge meets the scores' bottoms.
        transform: [{ translateY: -5 }],
    },
    rrDelta: {
        fontFamily: fonts.mono,
        fontSize: 12,
        fontWeight: "700",
        letterSpacing: 0.3,
    },
    // Recent Verdicts full card
    fvOuter: {
        marginHorizontal: 14,
        // No top margin: Recent Verdict always sits right under the SOCIAL CARDS header, which now
        // owns the 8px gap below itself (so the gap is identical whether or not this card renders).
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
        // Accent-orange to match the live Recent Verdict pill (a "like" verdict's bucket color),
        // so the locked card reads as the same card, not a greyed-out stub.
        backgroundColor: colors.accent,
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
    // Status tag for full-size locked/quiet cards.
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
    // Quiet/status dots
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
    // No-note state: the meta column is a single short CTA line, so center it against
    // the tall score instead of bottom-pinning it (which left it floating low).
    verdictBodyNoNote: {
        alignItems: "center",
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
    // Shown in place of the note when a verdict has no caption — the same big white
    // text as a note, unquoted, with a trailing tap glyph to read as tappable.
    verdictCtaRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginTop: 4,
    },
    verdictCtaText: {
        fontFamily: fonts.serifItalic,
        fontSize: 16,
        color: "#fff",
        lineHeight: 19,
        includeFontPadding: false,
    },
    verdictFingerCue: {
        alignItems: "center",
        justifyContent: "center",
        marginLeft: -1,
        shadowColor: "#fff",
        shadowOpacity: 0.35,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 0 },
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
        // Bars cap at 20px; trimming the container's dead space reclaims the room the
        // score's taller line box now uses, keeping the card's fixed 138px height.
        height: 20,
    },
    fullConsBar: {
        flex: 1,
        backgroundColor: "rgba(255,255,255,0.28)",
        borderRadius: 1,
    },
    // Consensus — live half-tile. "N CIRCLE RATINGS" caption sits above the song title so the card
    // reads as a sentence; the pill ("· Circle Avg") labels the big number as the circle average.
    consRatedLabel: {
        fontFamily: fonts.mono,
        fontSize: 8,
        letterSpacing: 0.8,
        color: "rgba(255,255,255,0.85)",
        textTransform: "uppercase",
    },
    // Big score + a small "average" label, baseline-aligned, with a gap down to the soundwave.
    consAvgRow: {
        flexDirection: "row",
        alignItems: "baseline",
        marginBottom: 4,
    },
    consAvg: {
        fontFamily: fonts.display,
        fontSize: 34,
        // Line box kept close to the font size (not taller) so the big number doesn't carry extra
        // vertical padding — that reclaimed space goes to even gaps without shrinking the digits.
        lineHeight: 35,
        letterSpacing: -1,
        color: "#fff",
    },
    consAvgLabel: {
        fontFamily: fonts.mono,
        fontSize: 9,
        letterSpacing: 0.4,
        color: "rgba(255,255,255,0.7)",
        marginLeft: 6,
    },
    // Consensus histogram row: the low/high friend scores flank the bars, bottom-aligned so the
    // numbers sit on the same baseline the bars rise from.
    consSpread: {
        flexDirection: "row",
        alignItems: "flex-end",
        gap: 7,
    },
    consSpreadEndLabel: {
        fontFamily: fonts.mono,
        fontSize: 10,
        fontWeight: "700",
        color: "#fff",
    },
    // The bars themselves: bottom-aligned so they rise from a flat baseline like a histogram. Kept
    // compact (peak ~13px in a 15px box) — it's the secondary element, so the hero average number gets
    // the vertical room. marginBottom lifts the whole histogram up so its baseline meets the low/high
    // digits' baseline (the text's descender space otherwise leaves the bars a few px lower).
    consWave: {
        flex: 1,
        height: 15,
        flexDirection: "row",
        alignItems: "flex-end",
        gap: 2,
        marginBottom: 3,
    },
    consWaveBar: {
        flex: 1,
        borderRadius: 1.5,
        backgroundColor: "#fff",
    },
    // Dark dot (white ring) marks the average. As a child of the peak bar, left:50% puts its left
    // edge at the bar's centre and translateX(-half) slides it back so the dot is centred on the bar;
    // top lifts it just above the bar's crown.
    consWaveAvgDot: {
        position: "absolute",
        top: -4,
        left: "50%",
        transform: [{ translateX: -3.5 }],
        width: 7,
        height: 7,
        borderRadius: 3.5,
        backgroundColor: colors.ink,
        borderWidth: 1.5,
        borderColor: "#fff",
    },
    consSong: {
        fontFamily: fonts.serif,
        fontStyle: "italic",
        fontWeight: "700",
        fontSize: 12.5,
        color: "#fff",
    },
    // Split Decision — live state (two people you follow, far apart)
    splitSong: {
        fontFamily: fonts.serif,
        fontStyle: "italic",
        fontWeight: "700",
        fontSize: 12.5,
        lineHeight: 14,
        color: "#fff",
        textAlign: "center",
        alignSelf: "stretch",
    },
    splitCenter: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
    },
    splitArt: {
        width: 42,
        height: 42,
        borderRadius: 21,
        borderWidth: 2,
        borderColor: "rgba(255,255,255,0.92)",
        shadowColor: "#000",
        shadowOpacity: 0.4,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 8,
    },
    splitRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-end",
    },
    splitSide: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    splitBust: {
        width: 18,
        height: 18,
        borderRadius: 9,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1.5,
        borderColor: "rgba(255,255,255,0.65)",
    },
    splitBustLetter: {
        color: "#fff",
        fontWeight: "700",
        fontSize: 9,
    },
    splitScore: {
        fontFamily: fonts.display,
        fontSize: 21,
        lineHeight: 21,
        color: "#fff",
    },
    // Match Moment (full card) — head-to-head accents
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
        backgroundColor: "#fff",
        borderWidth: 2,
        borderColor: colors.mint,
        alignItems: "center",
        justifyContent: "center",
    },
    matchMomentGt: {
        fontFamily: fonts.display,
        fontSize: 18,
        lineHeight: 20,
        color: "rgba(255,255,255,0.72)",
        flexShrink: 0,
    },
    // Match Moment (live) — actor avatar (top right) + real covers in the winner/loser slots + titles.
    mmActorAvatar: {
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        borderWidth: 1.5,
        borderColor: "rgba(255,255,255,0.6)",
    },
    mmWinnerArt: {
        width: 36,
        height: 36,
        borderRadius: 8,
        flexShrink: 0,
    },
    mmLoserArt: {
        width: 28,
        height: 28,
        borderRadius: 7,
        opacity: 0.7,
        flexShrink: 0,
    },
    // Actor handle above the song-over-song titles
    mmActorLine: {
        fontFamily: fonts.mono,
        fontSize: 9,
        letterSpacing: 0.3,
        color: "rgba(255,255,255,0.8)",
    },
    mmWinnerTitle: {
        fontFamily: fonts.display,
        fontSize: 15,
        lineHeight: 17,
        color: "#fff",
        marginTop: 3,
    },
    mmLoserTitle: {
        fontFamily: fonts.mono,
        fontSize: 8,
        letterSpacing: 0.5,
        color: "rgba(255,255,255,0.65)",
        marginTop: 3,
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
        overflow: "hidden",
    },
    disagreeOrb: {
        position: "absolute",
        left: -52,
        top: -46,
        width: 104,
        height: 104,
        borderRadius: 52,
        backgroundColor: "rgba(245,184,64,0.10)",
        shadowColor: colors.gold,
        shadowOpacity: 0.5,
        shadowRadius: 28,
        shadowOffset: { width: 0, height: 0 },
    },
    disagreeOrbCore: {
        flex: 1,
        borderRadius: 52,
        borderWidth: 1,
        borderColor: "rgba(245,184,64,0.14)",
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
    // Disagreement Spotlight — live state (you vs circle gap)
    disagreeApart: {
        fontFamily: fonts.mono,
        fontSize: 8,
        fontWeight: "700",
        letterSpacing: 0.8,
        color: colors.inkDim,
    },
    disagreeArt: {
        width: 48,
        height: 48,
        borderRadius: 9,
    },
    disagreeSong: {
        fontFamily: fonts.display,
        fontSize: 15,
        lineHeight: 17,
        color: colors.ink,
    },
    disagreeArtist: {
        fontFamily: fonts.mono,
        fontSize: 8,
        letterSpacing: 0.6,
        color: colors.inkSoft,
        marginTop: 3,
    },
    disagreeScore: {
        fontFamily: fonts.display,
        fontSize: 22,
        letterSpacing: -0.4,
    },
    // ── Locked modules (compact) ──────────────────────────────────────────
    lockedSection: {
        gap: 8,
        marginTop: 0,
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
        height: 92,
        borderRadius: 14,
        overflow: "hidden",
    },
    // Icon row pinned to the top padding, text block pinned to the bottom padding
    // (space-between) — the taller tile height above gives both enough room that
    // this reads as a true symmetric 12/12 gap instead of the text crowding the
    // bottom edge. Keeping the icon row pinned at a fixed offset (rather than
    // vertically centering the whole block) also lets the background decorations
    // (consensusBars, versusDecoration) line up against a known, stable position.
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
        bottom: 26,
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
    // Match Moment (compact tile) — head-to-head versus decoration. Anchored to the
    // same 12/36 top band as miniTileTop's lock circle (not centered across the
    // whole tile) so the hatch boxes and ">" sit level with the lock icon.
    versusDecoration: {
        position: "absolute",
        top: 12,
        left: 0,
        right: 0,
        height: 36,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
    },
    // ── Find people card ──────────────────────────────────────────────────
    // Just the outer spacing; the card itself lives in FindYourPeopleCard.
    findFriendsCard: {
        marginHorizontal: 14,
        // Even 10px gaps on both sides to match the module stack's internal gap.
        // Top: orbitCard.marginBottom(8) + 2 = 10. Bottom: 6 + unlockedSection.marginTop(4) = 10.
        marginTop: 2,
        marginBottom: 6,
    },
    // ── This or That refinement ───────────────────────────────────────────
    thisOrThatCard: {
        marginHorizontal: 14,
        marginTop: 2,
        marginBottom: 8,
        borderRadius: 20,
        backgroundColor: colors.navy,
        overflow: "hidden",
        shadowColor: colors.ink,
        shadowOpacity: 0.14,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 6 },
    },
    totRow: {
        // iPhone 16e (390pt wide): card width 390 - 28 (margins) = 362, minus the 3px gap, split
        // two ways → ~180pt per half. Matching that height is what actually makes each half square
        // (168 undershot it and read as landscape-ish/wider-than-tall).
        height: 180,
        flexDirection: "row",
        gap: 3,
    },
    totHalf: {
        flex: 1,
        minWidth: 0,
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#000",
    },
    totHalfArt: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100%",
        height: "100%",
    },
    totHalfScrim: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(10,9,14,0.5)",
    },
    totHalfDim: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(8,7,11,0.55)",
    },
    totHalfArmedRing: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderWidth: 3,
    },
    totHalfArmedRingLeft: {
        borderTopLeftRadius: 20,
        borderBottomLeftRadius: 20,
    },
    totHalfArmedRingRight: {
        borderTopRightRadius: 20,
        borderBottomRightRadius: 20,
    },
    totConfirmPillWrap: {
        position: "absolute",
        left: 0,
        right: 0,
        top: "44%",
        alignItems: "center",
    },
    totConfirmPill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: "#fff",
        borderRadius: 999,
        paddingHorizontal: 13,
        paddingVertical: 8,
        shadowColor: "#000",
        shadowOpacity: 0.35,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 3 },
    },
    totConfirmPillText: {
        fontFamily: fonts.monoBold,
        fontSize: 8.5,
        color: colors.ink,
        letterSpacing: 1,
    },
    totHalfCaption: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        padding: 12,
    },
    totHalfTitle: {
        fontFamily: fonts.display,
        fontSize: 15,
        color: "#fff",
        textShadowColor: "rgba(0,0,0,0.55)",
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 6,
    },
    totHalfArtist: {
        fontFamily: fonts.sans,
        fontSize: 10.5,
        color: "rgba(255,255,255,0.85)",
        marginTop: 3,
    },
    totTopBadge: {
        position: "absolute",
        top: 11,
        left: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: "rgba(10,9,14,0.55)",
        borderRadius: 999,
        paddingHorizontal: 11,
        paddingVertical: 5,
    },
    totTopBadgeText: {
        fontFamily: fonts.monoBold,
        fontSize: 8,
        letterSpacing: 1.4,
        color: "#fff",
    },
    totDismiss: {
        position: "absolute",
        top: 10,
        right: 10,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: "rgba(255,255,255,0.14)",
        borderWidth: 1,
        borderColor: "rgba(245,238,220,0.2)",
        alignItems: "center",
        justifyContent: "center",
    },
    totDismissX: {
        color: colors.cream,
        fontSize: 11,
        fontWeight: "700",
    },
    totOrChip: {
        position: "absolute",
        left: "50%",
        top: "50%",
        marginLeft: -20,
        marginTop: -20,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.ink,
        borderWidth: 2,
        borderColor: colors.navyHi,
        alignItems: "center",
        justifyContent: "center",
    },
    totOrChipFaded: {
        opacity: 0.35,
    },
    totOrChipText: {
        fontFamily: fonts.serifItalic,
        fontSize: 15,
        color: "#fff",
    },
    // ── This or That result popup (compact Score Reveal echo) ──────────────
    totResultOverlay: {
        flex: 1,
        backgroundColor: "rgba(17,19,28,0.5)",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 24,
    },
    totResultCard: {
        width: "100%",
        maxWidth: 360,
        borderRadius: 22,
        backgroundColor: colors.paper,
        overflow: "hidden",
        shadowColor: "#000",
        shadowOpacity: 0.3,
        shadowRadius: 26,
        shadowOffset: { width: 0, height: 14 },
        elevation: 14,
    },
    totResultHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 15,
        paddingTop: 15,
    },
    totResultHeaderLeft: {
        flex: 1,
        minWidth: 0,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    totResultIconChip: {
        width: 24,
        height: 24,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
    },
    totResultKicker: {
        flexShrink: 1,
        fontFamily: fonts.monoBold,
        fontSize: 8,
        letterSpacing: 1,
        color: colors.inkDim,
    },
    totResultUndoBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        backgroundColor: colors.bg,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 999,
        paddingHorizontal: 11,
        paddingVertical: 6,
    },
    totResultUndoBtnText: {
        fontFamily: fonts.monoBold,
        fontSize: 8.5,
        letterSpacing: 1,
        color: colors.inkSoft,
    },
    totResultHero: {
        flexDirection: "row",
        alignItems: "center",
        gap: 13,
        paddingHorizontal: 15,
        paddingTop: 13,
        paddingBottom: 4,
    },
    totResultHeroText: {
        flex: 1,
        minWidth: 0,
    },
    totResultBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        alignSelf: "flex-start",
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 3,
    },
    totResultBadgeText: {
        fontFamily: fonts.monoBold,
        fontSize: 8,
        color: "#fff",
        letterSpacing: 1,
    },
    totResultArt: {
        width: 60,
        height: 60,
        borderRadius: 13,
        borderWidth: 2,
        flexShrink: 0,
    },
    totResultTitle: {
        fontFamily: fonts.display,
        fontSize: 19,
        color: colors.ink,
        marginTop: 5,
    },
    totResultArtist: {
        fontFamily: fonts.sans,
        fontSize: 11.5,
        color: colors.inkDim,
        marginTop: 2,
    },
    totResultSlotKicker: {
        alignSelf: "flex-start",
        fontFamily: fonts.monoBold,
        fontSize: 8.5,
        letterSpacing: 1.6,
        color: colors.inkDim,
        marginTop: 10,
        marginBottom: 8,
        marginHorizontal: 15,
    },
    totResultSlotList: {
        marginHorizontal: 15,
        marginBottom: 13,
    },
    // Each row is its own rounded, spaced-apart pill (not a shared bordered/clipped list with
    // separator lines) — that's what lets the winner row's tinted background and border actually
    // hug its own shape instead of sitting inside an unrelated outer rounded rect.
    totResultSlotRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 7,
        paddingHorizontal: 9,
        marginVertical: 2,
        borderRadius: 11,
        borderWidth: 1,
        borderColor: "transparent",
    },
    totResultSlotRank: {
        fontFamily: fonts.display,
        fontSize: 13,
        color: colors.inkDim,
        width: 16,
        textAlign: "center",
        flexShrink: 0,
    },
    totResultSlotArt: {
        width: 32,
        height: 32,
        borderRadius: 7,
        flexShrink: 0,
    },
    totResultSlotInfo: {
        flex: 1,
        minWidth: 0,
    },
    totResultSlotTitleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
    },
    totResultSlotTitle: {
        fontFamily: fonts.display,
        fontSize: 13,
        color: colors.ink,
        flexShrink: 1,
    },
    totResultNewBadge: {
        borderRadius: 999,
        paddingHorizontal: 5,
        paddingVertical: 2,
        flexShrink: 0,
    },
    totResultNewBadgeText: {
        fontFamily: fonts.monoBold,
        fontSize: 7,
        letterSpacing: 1,
    },
    totResultSlotArtist: {
        fontFamily: fonts.sans,
        fontSize: 10.5,
        color: colors.inkDim,
        marginTop: 1,
    },
    totResultSlotScore: {
        fontFamily: fonts.display,
        fontSize: 14,
        color: colors.ink,
        flexShrink: 0,
    },
    totResultFooter: {
        flexDirection: "row",
        gap: 10,
        paddingHorizontal: 15,
        paddingTop: 12,
        paddingBottom: 15,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.line,
    },
    totResultViewBtn: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        borderRadius: 12,
        paddingVertical: 13,
        // Full-opacity hard offset shadow — the design's actual primary-button treatment (solid
        // "3px 3px 0 ink", not a soft drop shadow). Same recipe as the Follow CTA / accentBtn.
        shadowColor: colors.ink,
        shadowOpacity: 1,
        shadowRadius: 0,
        shadowOffset: { width: 3, height: 3 },
        elevation: 4,
    },
    totResultViewBtnText: {
        fontFamily: fonts.display,
        fontSize: 13,
        color: "#fff",
    },
    totResultDoneBtn: {
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 12,
        paddingVertical: 13,
        paddingHorizontal: 18,
        backgroundColor: colors.ink,
    },
    totResultDoneBtnText: {
        fontFamily: fonts.display,
        fontSize: 13,
        color: "#fff",
    },
    // ── This or That collapsed teaser (after X) ─────────────────────────────
    totCollapsed: {
        marginHorizontal: 14,
        marginTop: 2,
        marginBottom: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 13,
        backgroundColor: colors.navy,
        borderRadius: 16,
        padding: 12,
        shadowColor: colors.ink,
        shadowOpacity: 0.1,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 3 },
    },
    totCollapsedArtStack: {
        width: 48,
        height: 32,
        flexShrink: 0,
    },
    // Stands in for the art stack on the cooldown card when there's no local pair data to show
    // (e.g. a fresh app load landed mid-cooldown).
    totCooldownIconFallback: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: colors.navyHi,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    totCollapsedArt: {
        position: "absolute",
        top: 1,
        width: 30,
        height: 30,
        borderRadius: 7,
    },
    totCollapsedArtBack: {
        left: 0,
    },
    totCollapsedArtFront: {
        left: 17,
        borderWidth: 2,
        borderColor: colors.navy,
    },
    totCollapsedText: {
        flex: 1,
        minWidth: 0,
    },
    totCollapsedKickerRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    totCollapsedKicker: {
        fontFamily: fonts.monoBold,
        fontSize: 8,
        letterSpacing: 1.4,
        color: colors.cream,
    },
    totCollapsedBody: {
        fontFamily: fonts.sans,
        fontSize: 11.5,
        color: colors.cdim,
        marginTop: 3,
    },
    totCollapsedChevron: {
        width: 28,
        height: 28,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: colors.cline,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    // ── This or That cooldown resting state (after a confirmed pick) ────────
    // Reuses totCollapsed's dark row shell; only the art crop and the trailing content differ.
    totCooldownArtRound: {
        borderRadius: 15,
    },
    totCooldownCountdown: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        flexShrink: 0,
    },
    totCooldownCountdownText: {
        fontFamily: fonts.display,
        fontSize: 21,
        lineHeight: 21,
        color: colors.cream,
    },
    totCooldownCountdownUnit: {
        fontFamily: fonts.display,
        fontSize: 13,
        color: colors.cdim,
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
