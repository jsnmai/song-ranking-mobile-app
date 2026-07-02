// Comparison Flow — Calibrating design.
// Header: close + Calibrating (display) + Undo pill
// Prompt: TargetSpinner (rotating CSS-style arc) + "Which song is better?"
// Ranked list: songs positioned along a circular arc with gradient stroke + top/bottom fade
// VS cards: fixed-art cards with ring border, absolute NEW badge, absolute play button
// Animations: ladder rows slide to new arc positions via LinearTransition (keyed by song_id),
// pivot/regular row swaps crossfade, candidate card crossfades per round (cover prefetched
// so art never pops in blank), and submitting dims the cards instead of a full-screen overlay.
import { useEffect, useMemo, useRef, useState } from "react"
// RNAnimated: core Animated API, only used for the spinner loop — "Animated" is reserved for Reanimated below
import { ActivityIndicator, Animated as RNAnimated, Dimensions, Image, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import Animated, { FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated"
import Svg, { Circle, Path, Defs, LinearGradient, Stop, Rect } from "react-native-svg"
import { NativeStackScreenProps } from "@react-navigation/native-stack"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { ApiError } from "../../api/client"
import { useAudioPlayer } from "../../hooks/useAudioPlayer"
import { AppStackParamList } from "../../navigation/types"
import { colors, fonts, bucketColor } from "../../theme"
import { useAuth } from "../auth/AuthContext"
import { fetchPreviewUrl, fetchPreviewUrlBySongId } from "../songs/apiRequests"
import { cancelComparisonSession, chooseComparisonWinner, finalizeComparisonSession, undoComparisonChoice } from "./apiRequests"
import { ComparisonSessionResponse } from "./types"

type ComparisonFlowProps = NativeStackScreenProps<AppStackParamList, "ComparisonFlow">

// ── Layout constants ──────────────────────────────────────────────────────────
const CW = Dimensions.get("window").width - 32  // content width (16px gutters)
const ARC_XR = 54    // x at both arc endpoints (right anchor)
const ARC_SAG = 46   // sagitta — how far left the arc bows
const ROW_H = 46     // normal row height
const PIVOT_H = 58   // candidate (active) row height
const WIN = 7        // always show exactly this many rows; pivot shifts within the window

// Circular arc geometry: one smooth arc from top to bottom
function arcGeometry(H: number) {
    const R = (ARC_SAG * ARC_SAG + (H / 2) * (H / 2)) / (2 * ARC_SAG)
    const cx = ARC_XR - ARC_SAG + R
    const cy = H / 2
    const arcX = (yy: number) => cx - Math.sqrt(Math.max(0, R * R - (yy - cy) * (yy - cy)))
    return arcX
}

function buildArcPath(H: number, arcX: (y: number) => number): string {
    let d = ""
    for (let yy = 0; yy <= H; yy += 2) {
        d += (yy === 0 ? "M " : "L ") + arcX(yy).toFixed(2) + " " + yy.toFixed(1) + " "
    }
    return d
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function CloseIcon() {
    return (
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none"
            stroke={colors.ink} strokeWidth={2} strokeLinecap="round">
            <Path d="M18 6 6 18M6 6l12 12" />
        </Svg>
    )
}

function UndoIcon({ s = 15, c }: { s?: number; c: string }) {
    return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none"
            stroke={c} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M9 14 4 9l5-5" />
            <Path d="M4 9h10a6 6 0 0 1 0 12h-3" />
        </Svg>
    )
}

function PlayIcon({ color }: { color: string }) {
    return (
        <Svg width={13} height={13} viewBox="0 0 24 24" fill={color}>
            <Path d="M5 3l14 9-14 9V3z" />
        </Svg>
    )
}

function PauseIcon({ color }: { color: string }) {
    return (
        <Svg width={13} height={13} viewBox="0 0 24 24" fill={color}>
            <Path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
        </Svg>
    )
}

// ── TargetSpinner — spinning arc (outer ring rotates accent color) ─────────────
function TargetSpinner({ size = 38 }: { size?: number }) {
    const spinAnim = useRef(new RNAnimated.Value(0)).current

    useEffect(() => {
        const loop = RNAnimated.loop(
            RNAnimated.timing(spinAnim, { toValue: 1, duration: 1100, useNativeDriver: true })
        )
        loop.start()
        return () => loop.stop()
    }, [spinAnim])

    const rotate = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] })
    const bw = Math.max(2.5, Math.round(size * 0.08))
    const inset1 = Math.round(size * 0.24)
    const inset2 = Math.round(size * 0.40)

    return (
        <View style={{ width: size, height: size, flexShrink: 0 }}>
            <RNAnimated.View style={{
                position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                borderRadius: size / 2,
                borderWidth: bw,
                borderColor: colors.paper2,
                borderTopColor: colors.accent,
                transform: [{ rotate }],
            }} />
            <View style={{
                position: "absolute",
                top: inset1, left: inset1, right: inset1, bottom: inset1,
                borderRadius: 999,
                borderWidth: 2,
                borderColor: colors.gold,
            }} />
            <View style={{
                position: "absolute",
                top: inset2, left: inset2, right: inset2, bottom: inset2,
                borderRadius: 999,
                backgroundColor: colors.accent,
            }} />
        </View>
    )
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function ComparisonFlowScreen({ navigation, route }: ComparisonFlowProps) {
    const { token } = useAuth()
    const insets = useSafeAreaInsets()
    const [session, setSession] = useState<ComparisonSessionResponse>(route.params.session)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Dims the VS cards while a choice is in flight — softer than a full-screen overlay
    const submitDim = useSharedValue(0)
    const vsRowDimStyle = useAnimatedStyle(() => ({ opacity: 1 - submitDim.value * 0.35 }))

    const [candidatePreviewUrl, setCandidatePreviewUrl] = useState<string | null>(null)
    const [candidateAppleViewUrl, setCandidateAppleViewUrl] = useState<string | null>(null)
    // Attribution is keyed on the preview's provider, not the store link: an Apple
    // preview must render "Provided courtesy of iTunes" even if trackViewUrl is missing.
    // The "unavailable" flags are set only when a lookup definitively reports no
    // preview (not on network errors), hiding the play affordance for that song.
    const [candidatePreviewIsApple, setCandidatePreviewIsApple] = useState(false)
    const [candidatePreviewUnavailable, setCandidatePreviewUnavailable] = useState(false)
    // Attribution stays hidden until the user actually starts that card's preview
    // (then sticks for the card) — keeps the VS cards uncluttered until Apple
    // content renders.
    const [candidateHasPlayed, setCandidateHasPlayed] = useState(false)
    const [candidatePreviewLoading, setCandidatePreviewLoading] = useState(false)
    const [candidateLazyPreviewLoading, setCandidateLazyPreviewLoading] = useState(false)
    const [shouldPlayCandidateAfterLoad, setShouldPlayCandidateAfterLoad] = useState(false)
    const [targetPreviewUrl, setTargetPreviewUrl] = useState<string | null>(session.target_song.preview_url)
    const [targetAppleViewUrl, setTargetAppleViewUrl] = useState<string | null>(
        session.target_song.provider === "apple" && session.target_song.preview_url !== null
            ? session.target_song.apple_view_url ?? null
            : null,
    )
    const [targetPreviewIsApple, setTargetPreviewIsApple] = useState(session.target_song.provider === "apple")
    const [targetPreviewUnavailable, setTargetPreviewUnavailable] = useState(false)
    const [targetHasPlayed, setTargetHasPlayed] = useState(false)
    // Which card's preview the user played last — the footer shows that side's
    // Apple attribution in place of the tagline, keeping the VS cards clean.
    const [lastPlayedSide, setLastPlayedSide] = useState<"target" | "candidate" | null>(null)
    const [targetLazyPreviewLoading, setTargetLazyPreviewLoading] = useState(false)
    const [shouldPlayTargetAfterLoad, setShouldPlayTargetAfterLoad] = useState(false)
    const candidateShownAtRef = useRef<number | null>(null)
    const candidatePlayer = useAudioPlayer(candidatePreviewUrl)
    const targetPlayer = useAudioPlayer(targetPreviewUrl)

    useEffect(() => {
        return navigation.addListener("blur", () => {
            candidatePlayer.stop()
            targetPlayer.stop()
        })
    }, [navigation, candidatePlayer, targetPlayer])

    const handleCancel = async () => {
        if (!token || isSubmitting) return
        candidatePlayer.stop()
        targetPlayer.stop()
        setIsSubmitting(true)
        try {
            await cancelComparisonSession(session.session_uuid, token)
            navigation.navigate("MainTabs", { screen: "Discover" })
        } catch {
            navigation.navigate("MainTabs", { screen: "Discover" })
        }
    }

    const finalizeReadySession = async (nextSession: ComparisonSessionResponse) => {
        if (!token) return
        const response = await finalizeComparisonSession(nextSession.session_uuid, token)
        navigation.replace("ScoreReveal", { result: response.result })
    }

    const handleChoice = async (winner: "target" | "candidate") => {
        if (!token || isSubmitting || session.candidate === null) return
        candidatePlayer.stop()
        targetPlayer.stop()
        setIsSubmitting(true)
        setError(null)
        try {
            const decisionDurationMs = candidateShownAtRef.current === null
                ? null
                : Math.max(0, Date.now() - candidateShownAtRef.current)
            const nextSession = await chooseComparisonWinner(
                session.session_uuid,
                winner,
                token,
                decisionDurationMs,
            )
            if (nextSession.status === "ready_to_finalize") {
                await finalizeReadySession(nextSession)
                return
            }
            // Warm the image cache before swapping the card so the crossfade
            // never reveals blank art. Race against a short timeout so a slow
            // CDN can't stall the round.
            const nextCoverUrl = nextSession.candidate?.song.cover_url
            if (nextCoverUrl) {
                await Promise.race([
                    Image.prefetch(nextCoverUrl).catch(() => false),
                    new Promise((resolve) => setTimeout(resolve, 600)),
                ])
            }
            setSession(nextSession)
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.detail)
            } else if (err instanceof Error) {
                setError(err.message)
            } else {
                setError("Could not save comparison.")
            }
        } finally {
            setIsSubmitting(false)
        }
    }

    // Undo only applies while the session is still active (pre-finalize). The final
    // comparison auto-finalizes in handleChoice, so it is intentionally not undoable.
    const handleUndo = async () => {
        if (!token || isSubmitting || session.status !== "active" || session.comparison_count < 1) return
        candidatePlayer.stop()
        targetPlayer.stop()
        setIsSubmitting(true)
        setError(null)
        try {
            // expected count is the optimistic guard: the backend rejects the undo if the
            // session moved on, so a double-tap/retry can't rewind two steps.
            const nextSession = await undoComparisonChoice(
                session.session_uuid,
                token,
                session.comparison_count,
            )
            const nextCoverUrl = nextSession.candidate?.song.cover_url
            if (nextCoverUrl) {
                await Promise.race([
                    Image.prefetch(nextCoverUrl).catch(() => false),
                    new Promise((resolve) => setTimeout(resolve, 600)),
                ])
            }
            setSession(nextSession)
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.detail)
            } else if (err instanceof Error) {
                setError(err.message)
            } else {
                setError("Could not undo comparison.")
            }
        } finally {
            setIsSubmitting(false)
        }
    }

    const candidate = session.candidate
    const targetSongId = session.target_song.id ?? session.target_song.song_id ?? null
    const targetCanFetchSavedPreview = targetSongId != null
        && targetPreviewUrl === null
        && session.target_song.preview_available === true
        && !targetPreviewUnavailable
    const candidateSongId = candidate?.song.id ?? candidate?.song_id ?? null
    const candidateCanFetchSavedPreview = candidateSongId != null
        && candidatePreviewUrl === null
        && candidate?.song.preview_available === true
        && !candidatePreviewUnavailable

    const handleTargetPreviewPress = async () => {
        setTargetHasPlayed(true)
        setLastPlayedSide("target")
        if (targetPreviewUrl !== null) {
            candidatePlayer.stop()
            targetPlayer.toggle()
            return
        }
        if (!token || targetSongId == null || !targetCanFetchSavedPreview || targetLazyPreviewLoading) return
        setTargetLazyPreviewLoading(true)
        try {
            const response = await fetchPreviewUrlBySongId(targetSongId, token)
            setTargetAppleViewUrl(response.apple_view_url)
            setTargetPreviewIsApple(response.provider === "apple")
            if (response.preview_url !== null) {
                setTargetPreviewUrl(response.preview_url)
                setShouldPlayTargetAfterLoad(true)
            } else {
                setTargetPreviewUnavailable(true)
            }
        } catch {
            setTargetPreviewUrl(null)
        } finally {
            setTargetLazyPreviewLoading(false)
        }
    }

    const handleCandidatePreviewPress = async () => {
        setCandidateHasPlayed(true)
        setLastPlayedSide("candidate")
        if (candidatePreviewUrl !== null) {
            targetPlayer.stop()
            candidatePlayer.toggle()
            return
        }
        if (!token || candidateSongId == null || !candidateCanFetchSavedPreview || candidateLazyPreviewLoading) return
        setCandidateLazyPreviewLoading(true)
        try {
            const response = await fetchPreviewUrlBySongId(candidateSongId, token)
            setCandidateAppleViewUrl(response.apple_view_url)
            setCandidatePreviewIsApple(response.provider === "apple")
            if (response.preview_url !== null) {
                setCandidatePreviewUrl(response.preview_url)
                setShouldPlayCandidateAfterLoad(true)
            } else {
                setCandidatePreviewUnavailable(true)
            }
        } catch {
            setCandidatePreviewUrl(null)
        } finally {
            setCandidateLazyPreviewLoading(false)
        }
    }

    useEffect(() => {
        const candidate = session.candidate
        // Each candidate carries its own preview state — reset the per-candidate flags.
        setCandidatePreviewUnavailable(false)
        setCandidatePreviewIsApple(candidate?.song.provider === "apple")
        setCandidateHasPlayed(false)
        if (candidate === null) {
            setCandidatePreviewUrl(null)
            setCandidateAppleViewUrl(null)
            setCandidatePreviewLoading(false)
            return
        }
        if (!token) {
            setCandidatePreviewUrl(candidate.song.preview_url)
            setCandidateAppleViewUrl(null)
            setCandidatePreviewLoading(false)
            return
        }
        const candidateSong = candidate.song
        if (candidateSong.deezer_id == null) {
            setCandidatePreviewUrl(candidate.song.preview_url)
            setCandidateAppleViewUrl(
                candidateSong.provider === "apple" && candidateSong.preview_url !== null
                    ? candidateSong.apple_view_url ?? null
                    : null,
            )
            setCandidatePreviewLoading(false)
            return
        }
        const candidateDeezerId = candidateSong.deezer_id

        let isActive = true
        const authToken = token
        setCandidatePreviewUrl(null)
        setCandidateAppleViewUrl(null)
        setCandidatePreviewLoading(true)

        async function loadCandidatePreviewUrl() {
            try {
                const url = await fetchPreviewUrl(candidateDeezerId, authToken)
                if (isActive) setCandidatePreviewUrl(url)
            } catch {
                if (isActive) setCandidatePreviewUrl(candidateSong.preview_url)
            } finally {
                if (isActive) setCandidatePreviewLoading(false)
            }
        }
        loadCandidatePreviewUrl()
        return () => { isActive = false }
    }, [session.candidate, token])

    useEffect(() => {
        setTargetPreviewUrl(session.target_song.preview_url)
        setTargetAppleViewUrl(
            session.target_song.provider === "apple" && session.target_song.preview_url !== null
                ? session.target_song.apple_view_url ?? null
                : null,
        )
        setTargetPreviewIsApple(session.target_song.provider === "apple")
        setTargetPreviewUnavailable(false)
        setTargetHasPlayed(false)
    }, [session.target_song])

    useEffect(() => {
        if (!shouldPlayTargetAfterLoad || targetPreviewUrl === null) return
        setShouldPlayTargetAfterLoad(false)
        candidatePlayer.stop()
        targetPlayer.toggle()
    }, [candidatePlayer, shouldPlayTargetAfterLoad, targetPlayer, targetPreviewUrl])

    useEffect(() => {
        if (!shouldPlayCandidateAfterLoad || candidatePreviewUrl === null) return
        setShouldPlayCandidateAfterLoad(false)
        targetPlayer.stop()
        candidatePlayer.toggle()
    }, [candidatePlayer, candidatePreviewUrl, shouldPlayCandidateAfterLoad, targetPlayer])

    useEffect(() => {
        if (session.candidate === null) { candidateShownAtRef.current = null; return }
        candidateShownAtRef.current = Date.now()
    }, [session.candidate])

    useEffect(() => {
        submitDim.value = withTiming(isSubmitting ? 1 : 0, { duration: 160 })
    }, [isSubmitting, submitDim])

    const rankings = session.current_bucket_rankings
    const targetHasApplePreview = targetPreviewUrl !== null && targetPreviewIsApple && targetHasPlayed
    const candidateHasApplePreview = candidatePreviewUrl !== null && candidatePreviewIsApple && candidateHasPlayed
    const handleOpenTargetApple = () => {
        if (targetAppleViewUrl) {
            Linking.openURL(targetAppleViewUrl).catch(() => {})
        }
    }
    const handleOpenCandidateApple = () => {
        if (candidateAppleViewUrl) {
            Linking.openURL(candidateAppleViewUrl).catch(() => {})
        }
    }
    // Footer attribution follows the side whose preview the user played last.
    const footerAttribution =
        lastPlayedSide === "target" && targetHasApplePreview
            ? { viewUrl: targetAppleViewUrl, onOpen: handleOpenTargetApple }
            : lastPlayedSide === "candidate" && candidateHasApplePreview
                ? { viewUrl: candidateAppleViewUrl, onOpen: handleOpenCandidateApple }
                : null

    // ── Leap-aware transition pacing ────────────────────────────────────────
    // Early head-to-heads can move the candidate half the list in one round
    // (binary search), replacing most of the visible window. Scale the
    // transition length with how many rows the candidate jumped so big leaps
    // play slowly enough to read, while late rounds settling to a neighbouring
    // row stay snappy.
    const candidateIndex = session.candidate_index ?? 0
    const prevCandidateIndexRef = useRef(candidateIndex)
    // On the render where the index changes, the ref still holds the previous
    // round's value — exactly what the transition triggered by this render needs
    const rowsJumped = Math.abs(candidateIndex - prevCandidateIndexRef.current)
    const ladderMs = Math.min(680, 320 + rowsJumped * 45)
    const enterMs = Math.round(ladderMs * 0.8)
    const exitMs = Math.round(ladderMs * 0.55)
    // On multi-row leaps, hold entering rows back so the exits/slides read first
    const enterDelayMs = rowsJumped > 1 ? Math.min(150, rowsJumped * 15) : 0

    useEffect(() => {
        prevCandidateIndexRef.current = candidateIndex
    }, [candidateIndex])

    // ── Arc geometry for ranked list ────────────────────────────────────────
    type RankingCell = typeof rankings[0] | null
    const { totalH, placedRows, arcPath, isShort } = useMemo(() => {
        type Row = { item: RankingCell; i: number; h: number; y0: number; yc: number; dx: number; isActive: boolean }
        const empty = { totalH: 0, placedRows: [] as Row[], arcPath: "", isShort: true }
        if (rankings.length === 0) return empty
        const ci = session.candidate_index ?? 0
        const n = rankings.length

        // Long list: window centered on pivot (clamped at ends).
        // Short list: real songs at top, rest are null ghost slots — ladder is
        // always WIN rows tall so the curve shape never changes.
        let cells: RankingCell[]
        let localPivot: number
        let short: boolean
        if (n >= WIN) {
            let start = ci - Math.floor(WIN / 2)
            start = Math.max(0, Math.min(start, n - WIN))
            cells = rankings.slice(start, start + WIN)
            localPivot = ci - start
            short = false
        } else {
            cells = [...rankings, ...Array<null>(WIN - n).fill(null)]
            localPivot = ci
            short = true
        }

        const heights = cells.map((_, i) => i === localPivot ? PIVOT_H : ROW_H)
        const H = heights.reduce((a, b) => a + b, 0)
        const arcX = arcGeometry(H)
        let accY = 0
        const rows: Row[] = cells.map((item, i) => {
            const h = heights[i]
            const y0 = accY
            const yc = accY + h / 2
            accY += h
            return { item, i, h, y0, yc, dx: arcX(yc), isActive: i === localPivot }
        })
        return { totalH: H, placedRows: rows, arcPath: buildArcPath(H, arcX), isShort: short }
    }, [rankings, session.candidate_index])

    const ring = bucketColor(session.bucket)
    const canUndo = session.status === "active" && session.comparison_count > 0 && !isSubmitting
    // Gold stop tracks the pivot row's vertical center so the gradient peak follows it
    const pivotOffset = totalH > 0
        ? (placedRows.find(r => r.isActive)?.yc ?? totalH / 2) / totalH
        : 0.5

    // ── Ranked list node helpers ─────────────────────────────────────────────
    function RankedNode({ dx, r, dotColor }: { dx: number; r: number; dotColor: string }) {
        const haloR = r + 3.5
        return (
            // layout transition slides the dot along the arc when its row shifts
            <Animated.View layout={LinearTransition.duration(ladderMs)} style={{
                position: "absolute",
                left: dx - haloR,
                top: 0, bottom: 0,
                width: haloR * 2,
                alignItems: "center",
                justifyContent: "center",
            }}>
                <View style={{
                    width: haloR * 2, height: haloR * 2, borderRadius: haloR,
                    backgroundColor: colors.bg, alignItems: "center", justifyContent: "center",
                }}>
                    <View style={{ width: r * 2, height: r * 2, borderRadius: r, backgroundColor: dotColor }} />
                </View>
            </Animated.View>
        )
    }

    function GhostDot({ dx }: { dx: number }) {
        return (
            <Animated.View layout={LinearTransition.duration(ladderMs)} style={{
                position: "absolute",
                left: dx - 7, top: 0, bottom: 0,
                width: 14,
                alignItems: "center", justifyContent: "center",
            }}>
                <Svg width={14} height={14} viewBox="0 0 14 14">
                    <Circle cx={7} cy={7} r={3.5}
                        fill="transparent"
                        stroke={colors.inkDim}
                        strokeWidth={1.5}
                        strokeDasharray="2 2"
                        opacity={0.6}
                    />
                </Svg>
            </Animated.View>
        )
    }

    return (
        <View style={styles.container}>
            {/* ── Top section — absorbs ranked list height changes ── */}
            <View style={styles.topSection}>
            {/* ── Header ── */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <TouchableOpacity style={styles.roundBtn} onPress={handleCancel} disabled={isSubmitting}>
                        <CloseIcon />
                    </TouchableOpacity>
                </View>
                <Text style={styles.calibTitle}>Calibrating</Text>
                <View style={styles.headerRight}>
                    <TouchableOpacity
                        style={[styles.undoBtn, { opacity: canUndo ? 1 : 0.45 }]}
                        onPress={handleUndo}
                        disabled={!canUndo}
                        accessibilityLabel="Undo last comparison"
                        accessibilityState={{ disabled: !canUndo }}
                    >
                        <UndoIcon s={15} c={colors.ink} />
                        <Text style={styles.undoBtnText}>Undo</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* ── Prompt box ── */}
            <View style={styles.promptBox}>
                <TargetSpinner size={38} />
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.promptQ}>Which song is better?</Text>
                    <Text style={styles.promptSub}>Tap the one you rank higher</Text>
                </View>
            </View>

            {/* ── Ranked list — circular arc with fade ── */}
            {rankings.length > 0 && (
                <View style={styles.listSection}>
                    <Text style={styles.listLabel}>YOUR RANKED LIST</Text>
                    <View style={{ overflow: "hidden" }}>
                        {/* Arc + rows */}
                        <View style={{ height: totalH, width: CW }}>
                            {/* Arc stroke SVG */}
                            <Svg width={CW} height={totalH} style={StyleSheet.absoluteFill}>
                                <Defs>
                                    <LinearGradient id="h2h-arc" x1="0" y1="0" x2="0" y2="1">
                                        <Stop offset={0} stopColor={ring} stopOpacity={0.45} />
                                        <Stop offset={pivotOffset} stopColor={colors.gold} stopOpacity={0.85} />
                                        <Stop offset={1} stopColor={ring} stopOpacity={0.45} />
                                    </LinearGradient>
                                </Defs>
                                <Path d={arcPath} fill="none" stroke="url(#h2h-arc)" strokeWidth={2} strokeLinecap="round" />
                            </Svg>

                            {/* Row items positioned along the arc. Keyed by song_id so when the
                                window shifts, surviving rows slide to their new slot (layout),
                                rows scrolled out fade away (exiting) and new ones fade in
                                (entering). The keyed inner wrappers crossfade a row between its
                                pivot and regular looks when the active song changes. */}
                            {placedRows.map(({ item, i, h, y0, dx, isActive }) => (
                                <Animated.View
                                    key={item ? item.song_id : `g${i}`}
                                    layout={LinearTransition.duration(ladderMs)}
                                    entering={FadeIn.duration(enterMs).delay(enterDelayMs)}
                                    exiting={FadeOut.duration(exitMs)}
                                    style={{ position: "absolute", top: y0, left: 0, right: 0, height: h }}
                                >
                                    {item === null ? (
                                        // Ghost row: dashed dot + hatched placeholder art + text blocks
                                        <>
                                            <GhostDot dx={dx} />
                                            <Animated.View layout={LinearTransition.duration(ladderMs)} style={[styles.rowContent, { left: dx + 31, opacity: 0.55 }]}>
                                                <View style={styles.ghostThumb} />
                                                <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                                                    <View style={styles.ghostTitleBar} />
                                                    <View style={styles.ghostArtistBar} />
                                                </View>
                                            </Animated.View>
                                        </>
                                    ) : isActive ? (
                                        // Pivot row: gold dot + gold pill with art + title + artist
                                        <Animated.View key="pivot" entering={FadeIn.duration(enterMs).delay(enterDelayMs)} exiting={FadeOut.duration(exitMs)} style={StyleSheet.absoluteFill}>
                                            <RankedNode dx={dx} r={5} dotColor={colors.gold} />
                                            <View style={[styles.pivotPill, { left: dx + 23 }]}>
                                                <View style={styles.pivotThumb}>
                                                    {item.cover_url ? (
                                                        <Image source={{ uri: item.cover_url }} style={{ width: "100%", height: "100%", borderRadius: 8 }} />
                                                    ) : null}
                                                </View>
                                                <View style={{ flex: 1, minWidth: 0 }}>
                                                    <Text numberOfLines={1} style={styles.pivotTitle}>{item.title}</Text>
                                                    <Text numberOfLines={1} style={styles.pivotArtist}>{item.artist}</Text>
                                                </View>
                                            </View>
                                        </Animated.View>
                                    ) : (
                                        // Regular row: small dark dot + art thumb + title + artist
                                        <Animated.View key="row" entering={FadeIn.duration(enterMs).delay(enterDelayMs)} exiting={FadeOut.duration(exitMs)} style={StyleSheet.absoluteFill}>
                                            <RankedNode dx={dx} r={4} dotColor="rgba(17,19,28,0.35)" />
                                            <Animated.View layout={LinearTransition.duration(ladderMs)} style={[styles.rowContent, { left: dx + 31 }]}>
                                                <View style={styles.rowThumb}>
                                                    {item.cover_url ? (
                                                        <Image source={{ uri: item.cover_url }} style={{ width: "100%", height: "100%", borderRadius: 9 }} />
                                                    ) : null}
                                                </View>
                                                <View style={{ flex: 1, minWidth: 0 }}>
                                                    <Text numberOfLines={1} style={styles.rowTitle}>{item.title}</Text>
                                                    <Text numberOfLines={1} style={styles.rowArtist}>{item.artist}</Text>
                                                </View>
                                            </Animated.View>
                                        </Animated.View>
                                    )}
                                </Animated.View>
                            ))}

                            {/* Fade overlay — short list: bottom only; long list: top + bottom */}
                            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                                <Svg width={CW} height={totalH}>
                                    <Defs>
                                        <LinearGradient id="fadeTop" x1="0" y1={0} x2="0" y2={totalH} gradientUnits="userSpaceOnUse">
                                            <Stop offset={0} stopColor={colors.bg} stopOpacity={isShort ? 0 : 1} />
                                            <Stop offset={Math.min(34 / totalH, 0.35)} stopColor={colors.bg} stopOpacity={0} />
                                            <Stop offset={Math.max(1 - 34 / totalH, 0.65)} stopColor={colors.bg} stopOpacity={0} />
                                            <Stop offset={1} stopColor={colors.bg} stopOpacity={1} />
                                        </LinearGradient>
                                    </Defs>
                                    <Rect x={0} y={0} width={CW} height={totalH} fill="url(#fadeTop)" />
                                </Svg>
                            </View>
                        </View>
                    </View>
                </View>
            )}

            </View>{/* end topSection */}

            {/* Equal flex spacers above and below VS cards so gap is balanced */}
            <View style={{ flex: 1 }} />

            {/* ── VS cards ── */}
            {candidate !== null ? (
                <Animated.View style={[styles.vsRow, vsRowDimStyle]}>
                    {/* Target card (new song — purple ring) */}
                    <TouchableOpacity
                        accessibilityLabel="Choose new song"
                        style={[styles.pairCard, { borderColor: ring }]}
                        onPress={() => handleChoice("target")}
                        disabled={isSubmitting}
                        activeOpacity={0.85}
                    >
                        {/* Art with badge + play button */}
                        <View style={styles.artWrap}>
                            {session.target_song.cover_url ? (
                                <Image source={{ uri: session.target_song.cover_url }} style={styles.pairArt} />
                            ) : (
                                <View style={[styles.pairArt, { backgroundColor: colors.paper2 }]} />
                            )}
                            {/* NEW badge — top-left of art */}
                            <View style={[styles.newBadge, { backgroundColor: ring }]}>
                                <Text style={styles.newBadgeText}>NEW</Text>
                            </View>
                            {/* Preview button — bottom-right of art */}
                            {(targetPreviewUrl !== null || targetCanFetchSavedPreview || targetLazyPreviewLoading) && (
                                <View style={styles.artPlayBtnWrap}>
                                    <TouchableOpacity
                                        style={styles.artPlayBtn}
                                        onPress={(e) => { e.stopPropagation(); handleTargetPreviewPress() }}
                                        activeOpacity={0.8}
                                        disabled={targetLazyPreviewLoading}
                                    >
                                        {targetLazyPreviewLoading ? (
                                            <ActivityIndicator color={colors.ink} size="small" />
                                        ) : targetPlayer.isPlaying ? (
                                            <PauseIcon color={colors.ink} />
                                        ) : (
                                            <PlayIcon color={colors.ink} />
                                        )}
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                        <Text style={styles.pairTitle} numberOfLines={2}>{session.target_song.title}</Text>
                        <Text style={styles.pairArtist} numberOfLines={1}>{session.target_song.artist}</Text>
                        {targetPreviewUnavailable && (
                            <View style={styles.appleAttribution}>
                                <Text style={styles.appleCourtesy} numberOfLines={1}>Preview unavailable</Text>
                                {targetAppleViewUrl != null && (
                                    <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleOpenTargetApple() }}>
                                        <Text style={styles.appleLink} numberOfLines={1}>Listen on Apple Music</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}
                    </TouchableOpacity>

                    {/* VS circle — centered via absolute inset */}
                    <View pointerEvents="none" style={styles.vsCircleWrap}>
                        <View style={styles.vsCircle}>
                            <Text style={styles.vsText}>VS</Text>
                        </View>
                    </View>

                    {/* Candidate card (existing ranking — gold ring). The card shell is
                        stable; only its contents crossfade when the next candidate loads. */}
                    <TouchableOpacity
                        accessibilityLabel="Choose candidate song"
                        style={[styles.pairCard, { borderColor: colors.gold }]}
                        onPress={() => handleChoice("candidate")}
                        disabled={isSubmitting}
                        activeOpacity={0.85}
                    >
                        <Animated.View
                            key={candidate.id}
                            entering={FadeIn.duration(enterMs)}
                            exiting={FadeOut.duration(exitMs)}
                            style={styles.cardInner}
                        >
                            <View style={styles.artWrap}>
                                {candidate.song.cover_url ? (
                                    <Image source={{ uri: candidate.song.cover_url }} style={styles.pairArt} />
                                ) : (
                                    <View style={[styles.pairArt, { backgroundColor: colors.paper2 }]} />
                                )}
                                {(candidatePreviewUrl !== null || candidateCanFetchSavedPreview || candidatePreviewLoading || candidateLazyPreviewLoading) && (
                                    // Fades in when the fresh preview URL resolves instead of popping
                                    <Animated.View entering={FadeIn.duration(180)} style={styles.artPlayBtnWrap}>
                                        <TouchableOpacity
                                            accessibilityLabel="Preview candidate"
                                            style={styles.artPlayBtn}
                                            onPress={(e) => { e.stopPropagation(); handleCandidatePreviewPress() }}
                                            activeOpacity={0.8}
                                            disabled={candidatePreviewLoading || candidateLazyPreviewLoading}
                                        >
                                            {candidatePreviewLoading || candidateLazyPreviewLoading ? (
                                                <ActivityIndicator color={colors.ink} size="small" />
                                            ) : candidatePlayer.isPlaying ? (
                                                <PauseIcon color={colors.ink} />
                                            ) : (
                                                <PlayIcon color={colors.ink} />
                                            )}
                                        </TouchableOpacity>
                                    </Animated.View>
                                )}
                            </View>
                            <Text style={styles.pairTitle} numberOfLines={2}>{candidate.song.title}</Text>
                            <Text style={styles.pairArtist} numberOfLines={1}>{candidate.song.artist}</Text>
                            {candidatePreviewUnavailable && (
                                <View style={styles.appleAttribution}>
                                    <Text style={styles.appleCourtesy} numberOfLines={1}>Preview unavailable</Text>
                                    {candidateAppleViewUrl != null && (
                                        <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleOpenCandidateApple() }}>
                                            <Text style={styles.appleLink} numberOfLines={1}>Listen on Apple Music</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            )}
                        </Animated.View>
                    </TouchableOpacity>
                </Animated.View>
            ) : (
                <View style={styles.loadingWrap}>
                    <ActivityIndicator color={colors.inkDim} />
                </View>
            )}

            <View style={{ flex: 1 }} />

            {error !== null && <Text style={styles.errorText}>{error}</Text>}

            {/* ── Footer — swaps to Apple attribution while a played preview is Apple's ── */}
            <View style={[styles.footer, { paddingBottom: Math.max(Platform.OS === "ios" ? 8 : 6, insets.bottom) }]}>
                {footerAttribution !== null ? (
                    <>
                        <Text style={styles.footerTagline} numberOfLines={1}>Provided courtesy of iTunes</Text>
                        {footerAttribution.viewUrl != null && (
                            <TouchableOpacity onPress={footerAttribution.onOpen}>
                                <Text style={styles.footerAppleLink} numberOfLines={1}>Get on Apple Music</Text>
                            </TouchableOpacity>
                        )}
                    </>
                ) : (
                    <>
                        <Text style={styles.footerTagline}>We'll find the fairest comparison.</Text>
                        <Text style={styles.footerBrand}>LISTN</Text>
                    </>
                )}
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    topSection: { flexShrink: 1, overflow: "hidden" },

    // ── Header ─────────────────────────────────────────────────────────────
    header: {
        paddingTop: 54, paddingHorizontal: 16, paddingBottom: 12,
        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    },
    roundBtn: {
        width: 38, height: 38, borderRadius: 19,
        backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line,
        alignItems: "center", justifyContent: "center",
        shadowColor: colors.ink, shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    },
    headerLeft: { width: 90 },
    headerRight: { width: 90, alignItems: "flex-end" },
    calibTitle: {
        flex: 1,
        textAlign: "center",
        fontFamily: fonts.display, fontSize: 19, letterSpacing: -0.2,
        color: colors.ink, lineHeight: 20,
    },
    undoBtn: {
        flexDirection: "row", alignItems: "center", gap: 6,
        backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line,
        borderRadius: 999, paddingVertical: 8, paddingLeft: 12, paddingRight: 14,
        shadowColor: colors.ink, shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    },
    undoBtnText: { fontFamily: fonts.display, fontSize: 12.5, letterSpacing: -0.01, color: colors.ink },

    // ── Prompt ─────────────────────────────────────────────────────────────
    promptBox: {
        flexDirection: "row", alignItems: "center", gap: 14,
        marginHorizontal: 16, marginBottom: 14,
        backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line,
        borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14,
        shadowColor: colors.ink, shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    },
    promptQ: { fontFamily: fonts.display, fontSize: 19, letterSpacing: -0.01, color: colors.ink, lineHeight: 21, marginBottom: 3 },
    promptSub: { fontFamily: fonts.mono, fontSize: 12.5, color: colors.inkDim },

    // ── Ranked list ─────────────────────────────────────────────────────────
    listSection: { paddingHorizontal: 16, paddingTop: 0, paddingBottom: 0, flexShrink: 0 },
    listLabel: {
        fontFamily: fonts.mono, fontSize: 8.5, letterSpacing: 0.18 * 8.5,
        color: colors.inkDim, fontWeight: "700", marginBottom: 8, paddingLeft: 4,
    },
    pivotPill: {
        position: "absolute", right: 4, top: 5, bottom: 5,
        borderRadius: 15, borderWidth: 1.5, borderColor: colors.gold,
        backgroundColor: "rgba(245,184,64,0.13)",
        shadowColor: colors.gold, shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 4 },
        flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 13,
    },
    pivotThumb: {
        width: 42, height: 42, borderRadius: 10, flexShrink: 0,
        overflow: "hidden",
        backgroundColor: colors.paper2, borderWidth: 2, borderColor: colors.gold,
    },
    pivotTitle: { fontFamily: fonts.display, fontSize: 15, color: colors.ink, lineHeight: 17 },
    pivotArtist: { fontFamily: fonts.mono, fontSize: 11, color: colors.inkDim, marginTop: 2 },
    rowContent: {
        position: "absolute", right: 6, top: 0, bottom: 0,
        flexDirection: "row", alignItems: "center", gap: 11,
    },
    rowThumb: {
        width: 36, height: 36, borderRadius: 9, flexShrink: 0,
        backgroundColor: colors.paper2,
        shadowColor: colors.ink, shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    },
    rowTitle: { fontFamily: fonts.display, fontSize: 13, color: colors.ink },
    rowArtist: { fontFamily: fonts.mono, fontSize: 10, color: colors.inkDim, marginTop: 2 },
    ghostThumb: {
        width: 36, height: 36, borderRadius: 9, flexShrink: 0,
        backgroundColor: colors.paper2,
        borderWidth: 1, borderStyle: "dashed", borderColor: colors.inkDim,
    },
    ghostTitleBar: {
        height: 8, width: "58%", borderRadius: 4,
        backgroundColor: "rgba(17,19,28,0.08)",
    },
    ghostArtistBar: {
        height: 6, width: "38%", borderRadius: 3,
        backgroundColor: "rgba(17,19,28,0.06)",
    },

    // ── VS row ──────────────────────────────────────────────────────────────
    vsRow: {
        flexDirection: "row", alignItems: "stretch", gap: 16,
        paddingHorizontal: 16, marginBottom: 8, position: "relative",
    },
    pairCard: {
        flex: 1, minWidth: 0,
        backgroundColor: colors.paper, borderWidth: 2.5,
        borderRadius: 20, padding: 14,
        alignItems: "center", textAlign: "center",
        shadowColor: "#000", shadowOpacity: 0.45, shadowRadius: 22, shadowOffset: { width: 0, height: 10 },
        elevation: 16,
    },
    cardInner: { alignItems: "center", alignSelf: "stretch" },
    artWrap: { position: "relative", width: 128, height: 128, marginBottom: 12 },
    pairArt: {
        width: 128, height: 128, borderRadius: 20,
        shadowColor: colors.ink, shadowOpacity: 0.14, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    },
    newBadge: {
        position: "absolute", top: -7, left: -7,
        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
        borderWidth: 2, borderColor: colors.paper,
        shadowColor: colors.ink, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    },
    newBadgeText: {
        fontFamily: fonts.mono, fontSize: 8, letterSpacing: 0.14 * 8, color: "#fff", fontWeight: "700",
    },
    artPlayBtnWrap: { position: "absolute", right: -8, bottom: -8 },
    artPlayBtn: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: "#fff", borderWidth: 1.5, borderColor: colors.line,
        alignItems: "center", justifyContent: "center",
        shadowColor: colors.ink, shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    },
    pairTitle: {
        fontFamily: fonts.display, fontSize: 15, color: colors.ink,
        textAlign: "center", lineHeight: 18, marginBottom: 4,
    },
    pairArtist: {
        fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.5, color: colors.inkDim, textAlign: "center",
    },
    appleAttribution: {
        alignItems: "center",
        gap: 3,
        marginTop: 7,
        alignSelf: "stretch",
    },
    appleCourtesy: {
        fontFamily: fonts.mono,
        fontSize: 7.5,
        letterSpacing: 0,
        color: colors.inkDim,
        textTransform: "uppercase",
        textAlign: "center",
    },
    appleLink: {
        fontFamily: fonts.mono,
        fontSize: 7.5,
        letterSpacing: 0,
        color: colors.accent,
        textTransform: "uppercase",
        textAlign: "center",
    },
    vsCircleWrap: {
        position: "absolute",
        top: 0, bottom: 0, left: 0, right: 0,
        alignItems: "center", justifyContent: "center",
        zIndex: 4,
    },
    vsCircle: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line,
        alignItems: "center", justifyContent: "center",
        shadowColor: colors.ink, shadowOpacity: 0.10, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    },
    vsText: { fontFamily: fonts.display, fontSize: 14, color: colors.ink, letterSpacing: -0.02 * 14 },

    // ── States ──────────────────────────────────────────────────────────────
    loadingWrap: { height: 200, alignItems: "center", justifyContent: "center" },
    errorText: {
        color: colors.danger, fontSize: 13, textAlign: "center",
        marginHorizontal: 16, marginVertical: 4,
    },

    // ── Footer ──────────────────────────────────────────────────────────────
    footer: {
        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
        paddingHorizontal: 18, paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line,
    },
    footerTagline: { fontFamily: fonts.mono, fontSize: 11, color: colors.inkDim },
    footerBrand: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.4 * 10, color: colors.inkDim, fontWeight: "700" },
    // Matches the Apple link treatment on the other preview surfaces (accent + uppercase).
    footerAppleLink: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0, color: colors.accent, textTransform: "uppercase", fontWeight: "700" },
})
