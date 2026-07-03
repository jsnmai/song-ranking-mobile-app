// Rank Map — the full-screen immersive cosmos. Opens from the Rankings tab's
// mini orbit. Renders your ranked songs through three "lenses" (Gravity /
// Genres / Verdict), each mapping a real data dimension to position, size and
// brightness. The universe is larger than the viewport so users can drag,
// pinch, zoom, filter, and inspect the map instead of looking at a static card.
import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
    GestureResponderEvent,
    PanResponder,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Mask, Path, RadialGradient, Rect, Stop } from "react-native-svg"
import { CompositeNavigationProp, RouteProp, useNavigation, useRoute } from "@react-navigation/native"
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"

import { AppStackParamList, RankingsStackParamList, TabParamList } from "../../../navigation/types"
import { useAuth } from "../../auth/AuthContext"
import { BucketName } from "../../comparison/types"
import { bucketColor, colors, fonts } from "../../../theme"
import { LockIcon } from "../../../components/LockIcon"
import { BloomCard } from "./BloomCard"
import { Cosmos, OrbitRings } from "./Cosmos"
import { Planet, Sun } from "./Planet"
import {
    bucketLabel,
    constellationLayout,
    constellationSegments,
    countBy,
    enrichRankings,
    eraTimeline,
    gravityLayout,
    nebulaLayout,
    RankMapSong,
    RankView,
    TimeGranularity,
} from "./layouts"

type RankMapNavigation = CompositeNavigationProp<
    NativeStackNavigationProp<RankingsStackParamList, "RankMap">,
    CompositeNavigationProp<
        BottomTabNavigationProp<TabParamList, "Rankings">,
        NativeStackNavigationProp<AppStackParamList>
    >
>

type Point = { x: number; y: number }

const VIEWS: { key: RankView; label: string }[] = [
    { key: "gravity", label: "Orbit" },
    { key: "genres", label: "Genres" },
    { key: "nebula", label: "Verdict" },
]

const CAPTION: Record<RankView, string> = {
    gravity: "Distance to your center = how much you love it",
    genres: "Songs cluster and connect by genre",
    nebula: "Three clouds, sized by how often you go there",
}

const BUCKETS: { key: BucketName; label: string }[] = [
    { key: "like", label: "Like" },
    { key: "alright", label: "Okay" },
    { key: "dislike", label: "Dislike" },
]

const TIME_GRANULARITIES: { key: TimeGranularity; label: string }[] = [
    { key: "week", label: "Weekly" },
    { key: "month", label: "Monthly" },
]

const TIME_STRIP_HEIGHT = 108
const TOP_CHROME_HEIGHT = 70
const BOTTOM_DOCK_HEIGHT = 118
const MIN_ZOOM = 0.58
const MAX_ZOOM = 3.6
const ZOOM_BUTTON_STEP = 0.5
// Orb size scales at this power of zoom instead of 1:1 with it (like a map pin
// staying roughly on-screen-sized while the map underneath scales) — orbs still
// grow when you zoom in, just a bit slower than the gaps between them do, so
// spacing visibly loosens/tightens with zoom instead of everything just looking
// uniformly bigger or smaller. Gravity leans on this harder (more damping) since
// its spiral is about revealing gaps across a big spread. Genres/Nebula are
// almost fully proportional (0.92, not 1.0) — legibility is the whole point of
// zooming into a cluster, so growth dominates; the layout gives their orbs
// enough baseline room (bigger base size + more declutter padding) that even
// near-1:1 growth doesn't reintroduce overlap at max zoom.
const GRAVITY_ZOOM_SIZE_EXPONENT = 0.45
const CLUSTER_ZOOM_SIZE_EXPONENT = 0.92

// The whole zoomable "world" is authored at this many times its logical resolution and
// base-scaled back down by 1/RENDER_SCALE, so the live zoom transform ends up as zoom /
// RENDER_SCALE — always ≤ 1 across the zoom range (MAX_ZOOM = RENDER_SCALE). Zooming in
// therefore approaches a 1:1 view of a high-res canvas instead of magnifying a low-res
// bitmap, which is what keeps orbs + album art sharp instead of pixelated. Set to 1 to
// disable supersampling entirely (behavior collapses to the plain transform-scale map).
// Fixed-size chrome (labels, the NO.1 badge) is drawn in a separate screen-space overlay
// so it never rides this transform at all — see the overlay block in render.
const RENDER_SCALE = MAX_ZOOM

// Screen-space chrome labels float this far above their group's top orb — approximate label
// heights (2 text lines each) plus a gap, so the label's bottom clears every orb at any zoom.
const LABEL_GAP = 10
const CLUSTER_LABEL_H = 38
const CLOUD_LABEL_H = 46
// Clear radius (logical units) kept empty at each Verdict cloud's center so its stat sits in
// the middle with the stars ringing around it. At zoom = 1 this is its on-screen radius too;
// zooming in only opens it wider, so the label is never covered at the default zoom or above.
const CLOUD_CENTER_KEEPOUT = 48
// Height of the Verdict left-rail taste-balance bar (bar + counts share it).
const BALANCE_STRIP_H = 220
// Sideways "TASTE BALANCE" label sits above the bar's like end (buckets render
// like → alright → dislike, top to bottom). Length is the label's pre-rotation
// width, i.e. its footprint once rotated -90deg to read sideways.
const BALANCE_LABEL_LEN = 100
const BALANCE_LABEL_GAP = 6
const BALANCE_LABEL_H = BALANCE_LABEL_LEN + BALANCE_LABEL_GAP
// Floor every bucket's bar segment and its count get, regardless of how few songs
// it holds. Without it, an empty bucket (0 songs) next to a heavy one collapses to
// an invisible sliver and its count label clips. Sized to clear one count row.
const BALANCE_MIN_SLOT = 22

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
}

function touchDistance(event: GestureResponderEvent): number {
    const [a, b] = event.nativeEvent.touches
    if (!a || !b) return 0
    const dx = a.pageX - b.pageX
    const dy = a.pageY - b.pageY
    return Math.sqrt(dx * dx + dy * dy)
}

// Average of all active touch points (in absolute page coords) — the pinch focal point for
// two fingers, or just the finger position for a one-finger drag. Zoom pins the world point
// under this so it stays put while you pinch, i.e. you zoom into wherever your fingers are.
function touchFocal(event: GestureResponderEvent): { x: number; y: number } {
    const touches = event.nativeEvent.touches
    if (touches.length === 0) return { x: 0, y: 0 }
    let sx = 0
    let sy = 0
    for (const t of touches) {
        sx += t.pageX
        sy += t.pageY
    }
    return { x: sx / touches.length, y: sy / touches.length }
}

// A verdict cloud is drawn as a few overlapping soft-edged radial puffs (each
// fades to transparent), so the union reads as fog rather than a hard polygon —
// the same radial-glow technique the Gravity sun's halo uses. Offsets are a
// fraction of the blob radius so larger buckets billow wider.
type FogPuff = { dx: number; dy: number; rx: number; ry: number; opacity: number }
const FOG_PUFFS: FogPuff[] = [
    { dx: 0, dy: 0, rx: 1.18, ry: 0.82, opacity: 1 },
    { dx: -0.34, dy: 0.14, rx: 0.74, ry: 0.62, opacity: 0.85 },
    { dx: 0.32, dy: -0.18, rx: 0.66, ry: 0.54, opacity: 0.72 },
    { dx: 0.06, dy: 0.3, rx: 0.58, ry: 0.46, opacity: 0.6 },
]

function ChevronLeft() {
    return (
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
            <Path
                d="M15 5l-7 7 7 7"
                stroke={colors.cream}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    )
}

function ResetIcon({ active }: { active: boolean }) {
    // Navy on the gold (active) button, neutral cream on the dark (idle) button.
    const stroke = active ? colors.navy : colors.cream
    return (
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Path
                d="M4 12a8 8 0 0 1 13.7-5.7M20 12a8 8 0 0 1-13.7 5.7"
                stroke={stroke}
                strokeWidth={2}
                strokeLinecap="round"
            />
            <Path d="M18 3v5h-5M6 21v-5h5" stroke={stroke} strokeWidth={2} strokeLinecap="round" />
        </Svg>
    )
}

function ClockIcon({ active }: { active: boolean }) {
    const stroke = active ? colors.navy : colors.cream
    return (
        <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
            <Circle cx={12} cy={12} r={8.5} stroke={stroke} strokeWidth={2} />
            <Path d="M12 7.5V12l3 2" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
    )
}

// Orbit — concentric orbit rings around a central sun, with a planet on the outer
// ring: the clearest read of the gravity/orbit lens (distance from your #1 sun).
function GravityIcon({ color }: { color: string }) {
    return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Circle cx={12} cy={12} r={5} stroke={color} strokeWidth={1.3} strokeOpacity={0.45} />
            <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.3} strokeOpacity={0.7} />
            <Circle cx={12} cy={12} r={2.7} fill={color} />
            <Circle cx={18.4} cy={5.6} r={1.8} fill={color} />
        </Svg>
    )
}

// Genres — a small constellation: linked stars, mirroring the cluster lens.
function GenresIcon({ color }: { color: string }) {
    return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Path
                d="M5 9L11 6L16 11L10 15ZM16 11L20 17"
                stroke={color}
                strokeWidth={1.3}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
            <Circle cx={5} cy={9} r={1.5} fill={color} />
            <Circle cx={11} cy={6} r={1.5} fill={color} />
            <Circle cx={16} cy={11} r={1.5} fill={color} />
            <Circle cx={10} cy={15} r={1.5} fill={color} />
            <Circle cx={20} cy={17} r={1.5} fill={color} />
        </Svg>
    )
}

// Verdict — a cloud, mirroring the three verdict fog clouds.
function VerdictIcon({ color }: { color: string }) {
    return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Circle cx={8} cy={14} r={3.7} fill={color} />
            <Circle cx={16} cy={14} r={3.7} fill={color} />
            <Circle cx={12} cy={10.5} r={4.4} fill={color} />
            <Rect x={7.5} y={13.4} width={9} height={4.3} rx={1} fill={color} />
        </Svg>
    )
}

function LensIcon({ view, color }: { view: RankView; color: string }) {
    if (view === "gravity") return <GravityIcon color={color} />
    if (view === "genres") return <GenresIcon color={color} />
    return <VerdictIcon color={color} />
}

function ZoomButton({
    label,
    accessibilityLabel,
    onPress,
    children,
    active = false,
}: {
    label?: string
    accessibilityLabel: string
    onPress: () => void
    children?: ReactNode
    active?: boolean
}) {
    return (
        <Pressable
            style={[styles.zoomButton, active && styles.zoomButtonActive]}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            hitSlop={6}
        >
            {children ?? <Text style={[styles.zoomButtonText, active && styles.zoomButtonTextActive]}>{label}</Text>}
        </Pressable>
    )
}

function LegendChip({
    color,
    label,
    count,
    active,
    onPress,
}: {
    color: string
    label: string
    count: number
    active: boolean
    onPress: () => void
}) {
    return (
        <Pressable
            style={[styles.legendChip, active ? { borderColor: color } : styles.legendChipOff]}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`Filter ${label}`}
        >
            <View style={[styles.legendDot, { backgroundColor: color, shadowColor: color }]} />
            <Text style={styles.legendText}>{label}</Text>
            <Text style={styles.legendCount}>{count}</Text>
        </Pressable>
    )
}

export default function RankMapScreen() {
    const navigation = useNavigation<RankMapNavigation>()
    const { token } = useAuth()
    // Disable the iOS swipe-back gesture: the whole stage is a drag-to-pan
    // canvas, so an edge swipe would pop the screen instead of moving the
    // universe. Applied at runtime (not just via static screen options) so it
    // re-asserts on every mount and survives Fast Refresh. Back button only.
    useLayoutEffect(() => {
        navigation.setOptions({ gestureEnabled: false })
    }, [navigation])
    const { rankings } = useRoute<RouteProp<RankingsStackParamList, "RankMap">>().params
    const { width, height } = useWindowDimensions()
    const insets = useSafeAreaInsets()

    const songs = useMemo(() => enrichRankings(rankings), [rankings])
    const counts = useMemo(() => countBy(songs), [songs])

    const [view, setView] = useState<RankView>("gravity")
    const [selectedId, setSelectedId] = useState<number | null>(null)
    const [eraSel, setEraSel] = useState(Number.MAX_SAFE_INTEGER)
    const [timeMode, setTimeMode] = useState(false)
    const [timeGranularity, setTimeGranularity] = useState<TimeGranularity>("month")
    const [activeBuckets, setActiveBuckets] = useState<Set<BucketName>>(
        () => new Set<BucketName>(["like", "alright", "dislike"]),
    )
    const [activeGenres, setActiveGenres] = useState<Set<string> | null>(null)
    const [pan, setPan] = useState<Point>({ x: 0, y: 0 })
    const [zoom, setZoom] = useState(1)
    // Counter-scale applied per-lens — see the constants' comment.
    const gravityZoomDamp = Math.pow(zoom, GRAVITY_ZOOM_SIZE_EXPONENT - 1)
    const clusterZoomDamp = Math.pow(zoom, CLUSTER_ZOOM_SIZE_EXPONENT - 1)
    const [timeTrackWidth, setTimeTrackWidth] = useState(1)
    // When time travel is still locked, tapping the clock explains what it is + how to unlock.
    const [showTimeLockInfo, setShowTimeLockInfo] = useState(false)

    const panRef = useRef(pan)
    const zoomRef = useRef(zoom)
    // Gesture baseline, re-captured whenever the number of fingers changes so a pinch→drag
    // (or lifting one finger) never jumps. focalStart is the pinch midpoint in viewport-local
    // coords at that baseline; deltas are measured against it.
    const gestureRef = useRef({
        panStart: pan,
        zoomStart: zoom,
        pinchStart: 0,
        focalStart: { x: 0, y: 0 },
        touchCount: 0,
    })
    // Live world geometry (updated every render, read by the memoized gesture handler).
    const geomRef = useRef({ stageTop: 0, cx: 0, cy: 0 })

    const selected = useMemo(() => songs.find((s) => s.id === selectedId) ?? null, [songs, selectedId])
    const weeklyEra = useMemo(() => eraTimeline(songs, "week"), [songs])
    const monthlyEra = useMemo(() => eraTimeline(songs, "month"), [songs])
    const currentEra = timeGranularity === "week" ? weeklyEra : monthlyEra
    const eras = currentEra.labels
    const maxEra = Math.max(0, eras.length - 1)
    const canTimeTravel = weeklyEra.labels.length > 1 || monthlyEra.labels.length > 1
    const effEra = Math.min(eraSel, maxEra)

    const showTimeStrip = view === "gravity" && timeMode && canTimeTravel && !selected
    const showBalanceStrip = view === "nebula" && !selected
    const bottomDockLift = insets.bottom + BOTTOM_DOCK_HEIGHT
    const bottomStripLift = bottomDockLift + 12
    const bottomChrome = bottomDockLift + 18 + (showTimeStrip ? TIME_STRIP_HEIGHT + 14 : 0)
    const stageTop = insets.top + TOP_CHROME_HEIGHT
    const stageH = Math.max(350, height - stageTop - bottomChrome)
    const worldW = Math.max(width * 1.65, 620)
    const worldH = Math.max(stageH * 1.16, 680)
    const worldLeft = (width - worldW) / 2
    const worldTop = (stageH - worldH) / 2

    // Supersampled world: same visual footprint at zoom = 1, but authored RENDER_SCALE×
    // bigger and base-scaled back so the live scale is zoom / RENDER_SCALE (≤ 1). left/top
    // shift so the (1/RENDER_SCALE)-scaled center lands exactly where the logical world's
    // center did. All layout geometry below is multiplied by RENDER_SCALE to match.
    const worldWSS = worldW * RENDER_SCALE
    const worldHSS = worldH * RENDER_SCALE
    const worldLeftSS = worldLeft - (worldW * (RENDER_SCALE - 1)) / 2
    const worldTopSS = worldTop - (worldH * (RENDER_SCALE - 1)) / 2
    // Map a supersampled world point to screen (viewport-local) space — the exact transform
    // the world View applies — so the overlay can place fixed-size chrome over moving orbs.
    const project = (sx: number, sy: number) => ({
        x: worldLeftSS + worldWSS / 2 + (zoom / RENDER_SCALE) * (sx - worldWSS / 2) + pan.x,
        // + stageTop: the viewport now spans the full screen (top = 0) so the map fades under the
        // title instead of hard-clipping at a line, but the world is still centered on the stage
        // region below the chrome — so shift projected chrome down by the stage's top inset.
        y: stageTop + worldTopSS + worldHSS / 2 + (zoom / RENDER_SCALE) * (sy - worldHSS / 2) + pan.y,
    })
    // Live world geometry for the gesture handler (its PanResponder is memoized once, so it must
    // read current values through a ref — stageH/worldH change when the time strip appears).
    // `cx`/`cy` are the viewport-local screen position of the world's center at pan = 0.
    geomRef.current = {
        stageTop,
        cx: worldLeftSS + worldWSS / 2,
        cy: worldTopSS + worldHSS / 2,
    }

    const genreLayouts = useMemo(() => {
        if (songs.length === 0) return []
        return constellationLayout(songs, { w: worldW, h: worldH }).map((con) => {
            const ctr = { x: con.ctr.x * RENDER_SCALE, y: con.ctr.y * RENDER_SCALE }
            const nodes = con.nodes.map((n) => ({
                ...n,
                x: n.x * RENDER_SCALE,
                y: n.y * RENDER_SCALE,
                size: n.size * RENDER_SCALE,
            }))
            // Farthest reach of any orb's edge from the cluster center — the group's radius.
            // Used to float the label just outside it so text never sits on top of an orb.
            const radius = nodes.reduce(
                (m, n) => Math.max(m, Math.hypot(n.x - ctr.x, n.y - ctr.y) + n.size / 2),
                0,
            )
            return { ...con, ctr, nodes, radius }
        })
    }, [songs, worldW, worldH])
    const genreNames = useMemo(() => genreLayouts.map((con) => con.genre), [genreLayouts])
    const activeGenreSet = activeGenres ?? new Set(genreNames)

    const updatePan = (next: Point) => {
        panRef.current = next
        setPan(next)
    }
    const updateZoom = (value: number) => {
        const next = clamp(value, MIN_ZOOM, MAX_ZOOM)
        zoomRef.current = next
        setZoom(next)
    }
    const resetMap = () => {
        updatePan({ x: 0, y: 0 })
        updateZoom(1)
    }
    const eraCountFor = (granularity: TimeGranularity) => (
        granularity === "week" ? weeklyEra.labels.length : monthlyEra.labels.length
    )
    const selectTimeGranularity = (granularity: TimeGranularity) => {
        if (eraCountFor(granularity) <= 1) return
        setTimeGranularity(granularity)
        setEraSel(Number.MAX_SAFE_INTEGER)
    }
    const handleTimeTravelPress = () => {
        if (!canTimeTravel) {
            setShowTimeLockInfo(true)
            return
        }
        if (timeMode) {
            setTimeMode(false)
            return
        }
        if (timeGranularity === "month" && monthlyEra.labels.length <= 1 && weeklyEra.labels.length > 1) {
            setTimeGranularity("week")
        } else if (timeGranularity === "week" && weeklyEra.labels.length <= 1 && monthlyEra.labels.length > 1) {
            setTimeGranularity("month")
        }
        setEraSel(Number.MAX_SAFE_INTEGER)
        setTimeMode(true)
    }

    const panResponder = useMemo(() => {
        // Snapshot the current view + finger positions as the reference the next moves measure
        // against. Called on grant and whenever the finger count changes mid-gesture.
        const rebaseline = (event: GestureResponderEvent) => {
            const focalPage = touchFocal(event)
            gestureRef.current = {
                panStart: panRef.current,
                zoomStart: zoomRef.current,
                pinchStart: touchDistance(event),
                focalStart: { x: focalPage.x, y: focalPage.y - geomRef.current.stageTop },
                touchCount: event.nativeEvent.touches.length,
            }
        }
        return PanResponder.create({
            onStartShouldSetPanResponder: (event) => event.nativeEvent.touches.length >= 2,
            onMoveShouldSetPanResponder: (event, gesture) => (
                event.nativeEvent.touches.length >= 2 ||
                Math.abs(gesture.dx) > 5 ||
                Math.abs(gesture.dy) > 5
            ),
            onPanResponderGrant: (event) => {
                rebaseline(event)
            },
            onPanResponderMove: (event) => {
                const touches = event.nativeEvent.touches
                // A finger landed or lifted since the last frame → reset the baseline to now so
                // the transition (1↔2 fingers) doesn't jump. This frame then applies zero delta.
                if (touches.length !== gestureRef.current.touchCount) {
                    rebaseline(event)
                    return
                }
                const g = gestureRef.current
                const { cx, cy, stageTop } = geomRef.current
                // Focal point in viewport-local coords (viewport sits at screen x = 0, y = stageTop).
                const focalPage = touchFocal(event)
                const fx = focalPage.x
                const fy = focalPage.y - stageTop

                // Zoom factor from the pinch (1 when a single finger is down = pure drag). Clamp
                // first, then derive the *actual* ratio so the focal point stays pinned even at
                // the zoom limits (the map doesn't creep once you hit min/max).
                let newZoom = g.zoomStart
                if (touches.length >= 2 && g.pinchStart > 0) {
                    newZoom = clamp(g.zoomStart * (touchDistance(event) / g.pinchStart), MIN_ZOOM, MAX_ZOOM)
                }
                const ratio = newZoom / g.zoomStart

                // Keep the world point that was under focalStart under the *current* focal point:
                // pan = currentFocal − worldCenter − ratio·(focalStart − worldCenter − panStart).
                // This composes zoom-about-focus with the focal's own drift (two-finger panning).
                const newPan = {
                    x: fx - cx - ratio * (g.focalStart.x - cx - g.panStart.x),
                    y: fy - cy - ratio * (g.focalStart.y - cy - g.panStart.y),
                }
                if (newZoom !== zoomRef.current) updateZoom(newZoom)
                updatePan(newPan)
            },
        })
    }, [])

    const timePanResponder = useMemo(
        () => PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: (event) => {
                const pct = clamp(event.nativeEvent.locationX / timeTrackWidth, 0, 1)
                setEraSel(Math.round(pct * maxEra))
            },
            onPanResponderMove: (event) => {
                const pct = clamp(event.nativeEvent.locationX / timeTrackWidth, 0, 1)
                setEraSel(Math.round(pct * maxEra))
            },
        }),
        [maxEra, timeTrackWidth],
    )

    const gravity = useMemo(() => {
        if (view !== "gravity" || songs.length === 0) return null
        const cx = worldW / 2
        const cy = worldH / 2
        const minR = 46
        const baseMaxR = Math.max(minR + 120, Math.min(worldW, worldH) / 2 - 62)
        // gravityLayout may grow maxR beyond baseMaxR for large libraries — use its
        // returned value (not baseMaxR) so the orbit rings match where planets land.
        const layout = gravityLayout(songs, { cx, cy, minR, maxR: baseMaxR })
        const s = RENDER_SCALE
        // Uniform supersample: scale every geometric field (positions + sizes) by the
        // same factor. Because declutter already ran in logical space, uniform scaling
        // preserves all spacing exactly — it's just a higher-resolution copy.
        return {
            sun: layout.sun,
            cx: cx * s,
            cy: cy * s,
            minR: minR * s,
            maxR: layout.maxR * s,
            planets: layout.planets.map((p) => ({
                ...p,
                x: p.x * s,
                y: p.y * s,
                r: p.r * s,
                size: p.size * s,
                fx: p.fx * s,
                fy: p.fy * s,
            })),
        }
    }, [view, songs, worldW, worldH])

    const genres = useMemo(() => {
        if (view !== "genres" || songs.length === 0) return null
        return { cl: genreLayouts, segs: constellationSegments(genreLayouts) }
    }, [view, songs, genreLayouts])

    const nebula = useMemo(() => {
        if (view !== "nebula" || songs.length === 0) return null
        const s = RENDER_SCALE
        return nebulaLayout(songs, {
            w: worldW,
            h: worldH,
            colors: { like: colors.like, sky: colors.sky, plum: colors.plum },
            innerRadius: CLOUD_CENTER_KEEPOUT,
        }).map((c) => ({
            ...c,
            cx: c.cx * s,
            cy: c.cy * s,
            blob: c.blob * s,
            nodes: c.nodes.map((n) => ({ ...n, x: n.x * s, y: n.y * s, size: n.size * s })),
        }))
    }, [view, songs, worldW, worldH])

    const toggleBucket = (bucket: BucketName) => {
        setActiveBuckets((prev) => {
            const next = new Set(prev)
            if (next.has(bucket)) next.delete(bucket)
            else next.add(bucket)
            return next.size === 0 ? prev : next
        })
    }

    const toggleGenre = (genre: string) => {
        setActiveGenres((prev) => {
            const base = prev ?? new Set(genreNames)
            const next = new Set(base)
            if (next.has(genre)) next.delete(genre)
            else next.add(genre)
            return next.size === 0 ? base : next
        })
    }

    const visible = (s: RankMapSong) => {
        const eraIdx = currentEra.indexBySongId.get(s.id) ?? 0
        const passesTime = view !== "gravity" || !timeMode || eraIdx <= effEra
        if (view === "genres") return passesTime && activeGenreSet.has(s.genre)
        return passesTime && activeBuckets.has(s.bucket)
    }
    const opacityOf = (s: RankMapSong, base = 1) => (visible(s) ? base : 0.12)
    const pressOf = (s: RankMapSong) => (visible(s) ? () => setSelectedId(s.id) : undefined)

    const openSelected = () => {
        if (selected) navigation.navigate("SongDetail", { ranking: selected.ranking })
    }

    const renderLegend = () => {
        if (view === "genres") {
            return genreLayouts.map((con) => (
                <LegendChip
                    key={con.genre}
                    color={con.color}
                    label={con.genre}
                    count={con.nodes.length}
                    active={activeGenreSet.has(con.genre)}
                    onPress={() => toggleGenre(con.genre)}
                />
            ))
        }
        return BUCKETS.map((bucket) => (
            <LegendChip
                key={bucket.key}
                color={bucketColor(bucket.key)}
                label={bucket.label}
                count={counts[bucket.key]}
                active={activeBuckets.has(bucket.key)}
                onPress={() => toggleBucket(bucket.key)}
            />
        ))
    }

    const progress = maxEra === 0 ? 1 : effEra / maxEra
    const progressPx = timeTrackWidth * progress
    const visibleAtTime = songs.filter((s) => (currentEra.indexBySongId.get(s.id) ?? 0) <= effEra).length
    // The label of a granularity that isn't scrubbable yet (needs more history), for the locked note.
    const lockedGranularity = TIME_GRANULARITIES.find((o) => eraCountFor(o.key) <= 1)?.label ?? null
    // The reset control only "lights up" when there's something to reset.
    const isDefaultView = pan.x === 0 && pan.y === 0 && zoom === 1

    return (
        <View style={styles.root}>
            <Cosmos width={width} height={height} seed={`rank-map-${view}`} zoom={zoom} pan={pan} />

            {/* Full-screen stage: the clip window is the whole screen (not a band below the title)
                so the map fills the screen top-to-bottom and dissolves into the edge fades near the
                title and lens dock instead of hard-clipping at a line. The world stays centered on
                the stage region between the chrome (top offset = stageTop), so its framing is unchanged. */}
            <View style={[styles.viewport, { top: 0, height }]} {...panResponder.panHandlers}>
                {songs.length === 0 && (
                    <View style={styles.empty}>
                        <Text style={styles.emptyText}>No songs to map yet.</Text>
                    </View>
                )}

                {selected && <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelectedId(null)} />}

                <View
                    style={[
                        styles.world,
                        {
                            left: worldLeftSS,
                            // + stageTop: viewport origin is now screen-top (0), so shift the world
                            // down by the stage inset to keep it centered on the same on-screen region.
                            top: worldTopSS + stageTop,
                            width: worldWSS,
                            height: worldHSS,
                            transform: [
                                { translateX: pan.x },
                                { translateY: pan.y },
                                { scale: zoom / RENDER_SCALE },
                            ],
                        },
                    ]}
                    pointerEvents="box-none"
                >
                    {gravity && (
                        <>
                            <OrbitRings
                                cx={gravity.cx}
                                cy={gravity.cy}
                                scale={RENDER_SCALE}
                                radii={[
                                    gravity.minR,
                                    gravity.minR + (gravity.maxR - gravity.minR) * 0.36,
                                    gravity.minR + (gravity.maxR - gravity.minR) * 0.68,
                                    gravity.maxR,
                                ]}
                            />
                            {gravity.planets.map((p) => (
                                <Planet
                                    key={p.s.id}
                                    x={p.x}
                                    y={p.y}
                                    size={p.size}
                                    cover={p.s.cover}
                                    bucket={p.s.bucket}
                                    glow={p.glow}
                                    fromX={p.fx}
                                    fromY={p.fy}
                                    delay={p.delay}
                                    ring={p.rank <= 3}
                                    glowRadius={12 * RENDER_SCALE}
                                    targetOpacity={opacityOf(p.s)}
                                    onPress={pressOf(p.s)}
                                    label={p.s.title}
                                    zoomDamp={gravityZoomDamp}
                                    renderScale={RENDER_SCALE}
                                />
                            ))}
                            <Sun
                                x={gravity.cx}
                                y={gravity.cy}
                                size={74 * RENDER_SCALE}
                                cover={gravity.sun.cover}
                                bucket={gravity.sun.bucket}
                                onPress={pressOf(gravity.sun)}
                                targetOpacity={opacityOf(gravity.sun)}
                                zoomDamp={gravityZoomDamp}
                                renderScale={RENDER_SCALE}
                                hideBadge
                            />
                        </>
                    )}

                    {genres && (
                        <>
                            <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
                                {genres.segs.map((sg) => (
                                    activeGenreSet.has(sg.genre) ? (
                                        <Line
                                            key={sg.key}
                                            x1={sg.x1}
                                            y1={sg.y1}
                                            x2={sg.x2}
                                            y2={sg.y2}
                                            stroke={sg.color}
                                            strokeOpacity={0.4}
                                            strokeWidth={1 * RENDER_SCALE}
                                            strokeDasharray={`${4 * RENDER_SCALE} ${4 * RENDER_SCALE}`}
                                        />
                                    ) : null
                                ))}
                            </Svg>
                            {genres.cl.map((con) =>
                                con.nodes.map((n, i) => (
                                    <Planet
                                        key={n.s.id}
                                        x={n.x}
                                        y={n.y}
                                        size={n.size}
                                        cover={n.s.cover}
                                        bucket={n.s.bucket}
                                        glow={con.color}
                                        fromX={con.ctr.x - n.x}
                                        fromY={con.ctr.y - n.y}
                                        delay={i * 28}
                                        glowRadius={8 * RENDER_SCALE}
                                        targetOpacity={opacityOf(n.s, n.bright)}
                                        onPress={pressOf(n.s)}
                                        label={n.s.title}
                                        zoomDamp={clusterZoomDamp}
                                        renderScale={RENDER_SCALE}
                                    />
                                )),
                            )}
                        </>
                    )}

                    {nebula && (
                        <>
                            <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
                                <Defs>
                                    {nebula.map((c) => (
                                        <RadialGradient
                                            key={c.key}
                                            id={`fog-${c.key}`}
                                            cx="50%"
                                            cy="50%"
                                            rx="50%"
                                            ry="50%"
                                        >
                                            <Stop offset="0%" stopColor={c.color} stopOpacity={0.26} />
                                            <Stop offset="48%" stopColor={c.color} stopOpacity={0.1} />
                                            <Stop offset="100%" stopColor={c.color} stopOpacity={0} />
                                        </RadialGradient>
                                    ))}
                                </Defs>
                                {nebula.map((c) => (
                                    activeBuckets.has(c.key) ? (
                                        <G key={c.key}>
                                            {FOG_PUFFS.map((puff, i) => (
                                                <Ellipse
                                                    key={i}
                                                    cx={c.cx + c.blob * puff.dx}
                                                    cy={c.cy + c.blob * puff.dy}
                                                    rx={c.blob * puff.rx}
                                                    ry={c.blob * puff.ry}
                                                    fill={`url(#fog-${c.key})`}
                                                    opacity={puff.opacity}
                                                />
                                            ))}
                                        </G>
                                    ) : null
                                ))}
                            </Svg>
                            {nebula.map((c) =>
                                c.nodes.map((n, i) => (
                                    <Planet
                                        key={n.s.id}
                                        x={n.x}
                                        y={n.y}
                                        size={n.size}
                                        cover={n.s.cover}
                                        bucket={n.s.bucket}
                                        glow={c.color}
                                        fromX={c.cx - n.x}
                                        fromY={c.cy - n.y}
                                        delay={i * 22}
                                        glowRadius={12 * RENDER_SCALE}
                                        targetOpacity={opacityOf(n.s)}
                                        onPress={pressOf(n.s)}
                                        label={n.s.title}
                                        zoomDamp={clusterZoomDamp}
                                        renderScale={RENDER_SCALE}
                                    />
                                )),
                            )}
                        </>
                    )}
                </View>

                {/* Screen-space chrome overlay — fixed-size labels + the NO.1 badge, drawn
                    OUTSIDE the zoomed world so they never ride its scale transform (which
                    bitmap-stretches text). Positions are projected through the same transform
                    so they track the moving orbs while staying crisp and constant size. */}
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                    {genres &&
                        genres.cl.map((con) => {
                            if (!activeGenreSet.has(con.genre)) return null
                            // Float the label just above the cluster's on-screen top edge (its
                            // world radius scaled to screen), so no orb is ever under the text.
                            const center = project(con.ctr.x, con.ctr.y)
                            const screenR = con.radius * (zoom / RENDER_SCALE)
                            const top = center.y - screenR - LABEL_GAP - CLUSTER_LABEL_H
                            return (
                                <View
                                    key={con.genre}
                                    style={[styles.clusterLabel, { left: center.x - 70, top }]}
                                >
                                    <Text style={styles.clusterTitle} numberOfLines={1}>
                                        {con.genre}
                                    </Text>
                                    <Text style={[styles.clusterCount, { color: con.color }]}>
                                        {con.nodes.length} SONGS
                                    </Text>
                                </View>
                            )
                        })}

                    {nebula &&
                        nebula.map((c) => {
                            if (!activeBuckets.has(c.key)) return null
                            // Sits dead center of the cloud — the stars are laid out in a ring around
                            // it (CLOUD_CENTER_KEEPOUT), so it's the middle of the group, never covered.
                            const center = project(c.cx, c.cy)
                            return (
                                <View
                                    key={c.key}
                                    style={[styles.cloudLabel, { left: center.x - 72, top: center.y - CLOUD_LABEL_H / 2 }]}
                                >
                                    <Text style={styles.cloudPercent}>{Math.round(c.share * 100)}%</Text>
                                    <Text style={[styles.cloudSub, { color: c.color }]}>
                                        {bucketLabel(c.key).toUpperCase()} · {c.list.length}
                                    </Text>
                                </View>
                            )
                        })}

                    {gravity && (() => {
                        const c = project(gravity.cx, gravity.cy)
                        // Sun's on-screen radius: authored radius 37×RS, times the world's net
                        // scale (zoom/RS), times the sun's own damp — sit the badge just above it.
                        const sunRadius = 37 * RENDER_SCALE * (zoom / RENDER_SCALE) * gravityZoomDamp
                        return (
                            <View style={[styles.sunBadgeWrap, { left: c.x - 60, top: c.y - sunRadius - 16 }]}>
                                <View style={styles.sunBadge}>
                                    <Text style={styles.sunBadgeText}>★ NO.1</Text>
                                </View>
                            </View>
                        )
                    })()}
                </View>
            </View>

            {/* Edge fade — dissolves the map into the cosmos near the title (top) and lens dock
                (bottom). Painting a flat colour seams against the cosmos' radial gradient, so instead
                it re-paints the SAME cosmos gradient (+ vignette) over the map, masked by a soft
                vertical alpha ramp: covered orbs vanish into a backdrop identical to the real cosmos,
                so there's no band or line. pointerEvents none; above the map, below the chrome. */}
            <View style={styles.edgeFade} pointerEvents="none">
                <Svg width={width} height={height}>
                    <Defs>
                        {/* Exact copies of Cosmos' background + vignette so the covered region
                            matches the real backdrop pixel-for-pixel (see Cosmos.tsx). */}
                        <RadialGradient id="rankMapFadeSky" cx="50%" cy="28%" rx="135%" ry="105%">
                            <Stop offset="0%" stopColor={colors.navyHi} />
                            <Stop offset="44%" stopColor={colors.navy} />
                            <Stop offset="100%" stopColor={colors.navy2} />
                        </RadialGradient>
                        <RadialGradient id="rankMapFadeVignette" cx="50%" cy="40%" rx="125%" ry="92%">
                            <Stop offset="50%" stopColor="#05070d" stopOpacity={0} />
                            <Stop offset="100%" stopColor="#05070d" stopOpacity={0.6} />
                        </RadialGradient>
                        {/* Alpha ramp: opaque behind the title, clear through the middle, opaque
                            again behind the dock — a long, gentle dissolve at each edge. */}
                        <LinearGradient id="rankMapEdgeAlpha" x1="0" y1="0" x2="0" y2="1">
                            {/* Top edge: opaque behind the title, then a long eased (smoothstep)
                                dissolve into the map so no slope kink reads as a line. */}
                            <Stop offset={0} stopColor="#fff" stopOpacity={1} />
                            <Stop offset={(insets.top + 42) / height} stopColor="#fff" stopOpacity={1} />
                            <Stop offset={(insets.top + 64) / height} stopColor="#fff" stopOpacity={0.85} />
                            <Stop offset={(insets.top + 88) / height} stopColor="#fff" stopOpacity={0.5} />
                            <Stop offset={(insets.top + 112) / height} stopColor="#fff" stopOpacity={0.15} />
                            <Stop offset={(insets.top + 132) / height} stopColor="#fff" stopOpacity={0} />
                            {/* Bottom edge: clear above the lens dock, opaque behind it. */}
                            <Stop offset={(height - insets.bottom - 178) / height} stopColor="#fff" stopOpacity={0} />
                            <Stop offset={(height - insets.bottom - 116) / height} stopColor="#fff" stopOpacity={1} />
                            <Stop offset={1} stopColor="#fff" stopOpacity={1} />
                        </LinearGradient>
                        <Mask id="rankMapEdgeMask">
                            <Rect x={0} y={0} width={width} height={height} fill="url(#rankMapEdgeAlpha)" />
                        </Mask>
                    </Defs>
                    <G mask="url(#rankMapEdgeMask)">
                        <Rect x={0} y={0} width={width} height={height} fill="url(#rankMapFadeSky)" />
                        <Rect x={0} y={0} width={width} height={height} fill="url(#rankMapFadeVignette)" />
                    </G>
                </Svg>
            </View>

            <View style={[styles.topChrome, { top: insets.top + 8 }]}>
                <Pressable
                    style={styles.back}
                    onPress={() => navigation.goBack()}
                    accessibilityLabel="Back"
                    hitSlop={8}
                >
                    <ChevronLeft />
                </Pressable>
                <View style={styles.titleCol}>
                    <Text style={styles.title}>Rank Map</Text>
                </View>
                {view === "gravity" && (
                    <Pressable
                        style={[
                            styles.timeTravelTop,
                            timeMode && styles.timeTravelTopActive,
                            !canTimeTravel && styles.timeTravelTopDisabled,
                        ]}
                        onPress={handleTimeTravelPress}
                        accessibilityRole="button"
                        accessibilityState={{ selected: timeMode }}
                        accessibilityLabel={
                            !canTimeTravel
                                ? "Taste over time, locked"
                                : timeMode ? "Exit taste over time" : "Taste over time"
                        }
                        accessibilityHint={!canTimeTravel ? "Explains how to unlock taste over time" : undefined}
                        hitSlop={8}
                    >
                        <ClockIcon active={timeMode} />
                    </Pressable>
                )}
            </View>

            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={[styles.legendWrap, { top: stageTop + 8 }]}
                contentContainerStyle={styles.legendRow}
            >
                {renderLegend()}
            </ScrollView>

            <View style={[styles.controls, { top: stageTop + 46 }]}>
                <ZoomButton label="+" accessibilityLabel="Zoom in" onPress={() => updateZoom(zoomRef.current + ZOOM_BUTTON_STEP)} />
                <ZoomButton
                    label="−"
                    accessibilityLabel="Zoom out"
                    onPress={() => updateZoom(zoomRef.current - ZOOM_BUTTON_STEP)}
                />
                <ZoomButton accessibilityLabel="Reset map" onPress={resetMap} active={!isDefaultView}>
                    <ResetIcon active={!isDefaultView} />
                </ZoomButton>
                <Text style={styles.zoomReadout}>{Math.round(zoom * 100)}%</Text>
            </View>

            <View style={[styles.bottomDock, { bottom: insets.bottom + 10 }]}>
                <View style={styles.switcher}>
                    {VIEWS.map((option) => {
                        const active = view === option.key
                        return (
                            <Pressable
                                key={option.key}
                                style={[styles.segment, active && styles.segmentActive]}
                                onPress={() => setView(option.key)}
                                accessibilityRole="button"
                                accessibilityState={{ selected: active }}
                                accessibilityLabel={`${option.label} view`}
                            >
                                <LensIcon view={option.key} color={active ? colors.navy : colors.cream} />
                                <Text style={[styles.segmentLabel, active && styles.segmentTextActive]}>
                                    {option.label}
                                </Text>
                            </Pressable>
                        )
                    })}
                </View>
                <View style={styles.dockMetaRow}>
                    <Text style={styles.caption} numberOfLines={1}>
                        {CAPTION[view].toUpperCase()}
                    </Text>
                </View>
            </View>

            {showTimeStrip && (
                <View style={[styles.timeStrip, { bottom: bottomStripLift }]}>
                    <View style={styles.timeHeader}>
                        <View style={styles.timeTitleCol}>
                            <Text style={styles.timeKicker}>TASTE OVER TIME</Text>
                            <Text style={styles.timeLabel}>{eras[effEra]}</Text>
                        </View>
                        <View style={styles.timeGranularity}>
                            {TIME_GRANULARITIES.map((option) => {
                                const active = timeGranularity === option.key
                                const disabled = eraCountFor(option.key) <= 1
                                return (
                                    <Pressable
                                        key={option.key}
                                        style={[
                                            styles.timeGranularityOption,
                                            active && styles.timeGranularityOptionActive,
                                            disabled && styles.timeGranularityOptionDisabled,
                                        ]}
                                        onPress={() => selectTimeGranularity(option.key)}
                                        disabled={disabled}
                                        accessibilityRole="button"
                                        accessibilityState={{ selected: active, disabled }}
                                        accessibilityLabel={`Show ${option.label.toLowerCase()} time travel${disabled ? " (locked)" : ""}`}
                                    >
                                        {disabled && <LockIcon color={colors.cdim} size={9} />}
                                        <Text
                                            style={[
                                                styles.timeGranularityText,
                                                active && styles.timeGranularityTextActive,
                                                disabled && styles.timeGranularityTextDisabled,
                                            ]}
                                        >
                                            {option.label}
                                        </Text>
                                    </Pressable>
                                )
                            })}
                        </View>
                    </View>
                    {lockedGranularity && (
                        <Text style={styles.timeLockedNote}>
                            {lockedGranularity} unlocks once you&apos;ve rated across more {lockedGranularity === "Monthly" ? "months" : "weeks"}
                        </Text>
                    )}
                    <View
                        style={styles.timeTrack}
                        onLayout={(event) => setTimeTrackWidth(Math.max(1, event.nativeEvent.layout.width))}
                        {...timePanResponder.panHandlers}
                    >
                        <View style={styles.timeRail} />
                        {/* Notches — one per era point you can scrub to; brighten once reached. */}
                        {maxEra > 0 &&
                            Array.from({ length: maxEra + 1 }).map((_, i) => (
                                <View
                                    key={i}
                                    style={[
                                        styles.timeNotch,
                                        { left: (i / maxEra) * timeTrackWidth - 1, opacity: i <= effEra ? 0.85 : 0.32 },
                                    ]}
                                />
                            ))}
                        {/* Orange→yellow gradient fill, clipped to the current progress. */}
                        <View style={[styles.timeFill, { width: progressPx }]}>
                            <Svg width={Math.max(progressPx, 1)} height={6}>
                                <Defs>
                                    <LinearGradient id="timeFillGrad" x1="0" y1="0" x2="1" y2="0">
                                        <Stop offset="0" stopColor={colors.accent} />
                                        <Stop offset="1" stopColor={colors.gold} />
                                    </LinearGradient>
                                </Defs>
                                <Rect x={0} y={0} width={Math.max(progressPx, 1)} height={6} fill="url(#timeFillGrad)" />
                            </Svg>
                        </View>
                        <View style={[styles.timeKnob, { left: progressPx - 8 }]} />
                    </View>
                    <Text style={styles.timeBody}>
                        {visibleAtTime} of {songs.length} stars have appeared · drag to replay how your taste formed
                    </Text>
                </View>
            )}

            {showBalanceStrip && nebula && (
                <View
                    style={[
                        styles.balanceStrip,
                        { top: stageTop + Math.max(0, (stageH - BALANCE_STRIP_H) / 2) - BALANCE_LABEL_H },
                    ]}
                    pointerEvents="none"
                >
                    <View style={styles.balanceLabelWrap}>
                        <Text style={styles.balanceVLabel}>TASTE BALANCE</Text>
                    </View>
                    <View style={styles.balanceStripRow}>
                        <View style={styles.balanceBar}>
                            {nebula.map((c) => (
                                <View
                                    key={c.key}
                                    style={{
                                        flex: Math.max(c.list.length, 0.2),
                                        minHeight: BALANCE_MIN_SLOT,
                                        backgroundColor: c.color,
                                        opacity: activeBuckets.has(c.key) ? 1 : 0.28,
                                    }}
                                />
                            ))}
                        </View>
                        <View style={styles.balanceCounts}>
                            {nebula.map((c) => (
                                // Each count gets a flex slot proportional to its share — exactly like the
                                // bar segment beside it (same flex, same minHeight floor, same gap) — and
                                // centers its number, so it sits at the vertical middle of its own bucket
                                // section and never clips when the bucket is empty.
                                <View
                                    key={c.key}
                                    style={{
                                        flex: Math.max(c.list.length, 0.2),
                                        minHeight: BALANCE_MIN_SLOT,
                                        justifyContent: "center",
                                        opacity: activeBuckets.has(c.key) ? 1 : 0.4,
                                    }}
                                >
                                    <View style={styles.balanceCountRow}>
                                        <Text style={styles.balanceCountNum}>{c.list.length}</Text>
                                        <Text style={styles.balanceCountLabel}>{bucketLabel(c.key).toUpperCase()}</Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>
                </View>
            )}

            {selected && (
                <BloomCard
                    s={selected}
                    rank={selected.pos}
                    token={token}
                    lift={bottomDockLift}
                    onClose={() => setSelectedId(null)}
                    onOpen={openSelected}
                />
            )}

            {showTimeLockInfo && (
                <View style={styles.timeLockOverlay}>
                    <Pressable
                        style={StyleSheet.absoluteFill}
                        onPress={() => setShowTimeLockInfo(false)}
                        accessibilityLabel="Dismiss"
                    />
                    <View style={styles.timeLockCard}>
                        <Text style={styles.timeLockKicker}>TASTE OVER TIME · LOCKED</Text>
                        <Text style={styles.timeLockTitle}>Replay how your taste formed</Text>
                        <Text style={styles.timeLockBody}>
                            Once unlocked, you can rewind your Rank Map and watch your stars
                            appear one era at a time, seeing how your taste took shape.
                        </Text>
                        <Text style={styles.timeLockBody}>
                            It opens up as soon as your ratings span more than one week. Keep
                            rating and check back as your timeline grows with you.
                        </Text>
                        <Pressable
                            style={styles.timeLockBtn}
                            onPress={() => setShowTimeLockInfo(false)}
                            accessibilityRole="button"
                            accessibilityLabel="Got it"
                        >
                            <Text style={styles.timeLockBtnText}>Got it</Text>
                        </Pressable>
                    </View>
                </View>
            )}
        </View>
    )
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.navy2 },
    viewport: {
        position: "absolute",
        left: 0,
        right: 0,
        overflow: "hidden",
    },
    world: { position: "absolute" },
    empty: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
    emptyText: { fontFamily: fonts.mono, fontSize: 12, color: colors.cdim, letterSpacing: 0.5 },

    // Full-screen; above the map (default z), below the title/back/legend/controls/dock so they
    // stay crisp on top. Its own mask limits the visible paint to the top and bottom edges.
    edgeFade: { ...StyleSheet.absoluteFillObject, zIndex: 22 },

    topChrome: {
        position: "absolute",
        left: 0,
        right: 0,
        minHeight: TOP_CHROME_HEIGHT - 18,
        alignItems: "center",
        zIndex: 34,
    },
    back: {
        position: "absolute",
        left: 12,
        top: 2,
        width: 38,
        height: 38,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(20,24,34,0.74)",
        borderWidth: 1,
        borderColor: colors.cline,
        zIndex: 28,
    },
    titleCol: { alignItems: "center", paddingTop: 1 },
    title: { fontFamily: fonts.serif, fontSize: 24, color: colors.cream, marginTop: 1 },
    bottomDock: {
        position: "absolute",
        left: 12,
        right: 12,
        zIndex: 33,
        padding: 7,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: colors.cline,
        backgroundColor: "rgba(16,20,30,0.88)",
    },
    switcher: {
        flexDirection: "row",
        gap: 5,
        width: "100%",
        borderRadius: 16,
        padding: 4,
        borderWidth: 1,
        borderColor: "rgba(245,238,220,0.11)",
        backgroundColor: "rgba(245,238,220,0.06)",
    },
    segment: {
        flex: 1,
        minHeight: 42,
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        borderRadius: 12,
    },
    segmentActive: { backgroundColor: colors.gold },
    segmentLabel: { fontFamily: fonts.serif, fontSize: 11, color: colors.cream },
    segmentTextActive: { color: colors.navy, opacity: 1 },
    dockMetaRow: {
        minHeight: 36,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        paddingHorizontal: 4,
        paddingTop: 7,
    },
    caption: {
        flex: 1,
        height: 11,
        fontFamily: fonts.mono,
        fontSize: 7.5,
        letterSpacing: 0.55,
        color: colors.cdim,
        textAlign: "center",
    },
    timeTravelTop: {
        position: "absolute",
        right: 12,
        top: 2,
        width: 38,
        height: 38,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(20,24,34,0.74)",
        borderWidth: 1,
        borderColor: "rgba(245,184,64,0.34)",
        zIndex: 28,
    },
    timeTravelTopActive: {
        borderColor: colors.gold,
        backgroundColor: colors.gold,
    },
    timeTravelTopDisabled: {
        opacity: 0.4,
    },

    timeLockOverlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 60,
        alignItems: "center",
        justifyContent: "center",
        padding: 28,
        backgroundColor: "rgba(8,10,16,0.66)",
    },
    timeLockCard: {
        width: "100%",
        maxWidth: 340,
        padding: 20,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(245,184,64,0.32)",
        backgroundColor: "rgba(16,20,30,0.97)",
    },
    timeLockKicker: { fontFamily: fonts.mono, fontSize: 8, letterSpacing: 1.1, color: colors.gold },
    timeLockTitle: { fontFamily: fonts.serif, fontSize: 20, color: colors.cream, marginTop: 7 },
    timeLockBody: {
        fontSize: 13,
        lineHeight: 19,
        color: "rgba(245,238,220,0.74)",
        marginTop: 11,
    },
    timeLockBtn: {
        marginTop: 18,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: colors.gold,
        alignItems: "center",
    },
    timeLockBtnText: { fontFamily: fonts.serif, fontSize: 15, color: colors.navy },

    legendWrap: {
        // A single full-width horizontal strip of filter pills; the zoom controls
        // sit below it (not beside it), so chips never collide with them. Scrolls
        // only if the chips can't all fit.
        position: "absolute",
        left: 12,
        right: 12,
        height: 30,
        zIndex: 26,
    },
    legendRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        paddingRight: 4,
    },
    legendChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        minHeight: 26,
        paddingLeft: 8,
        paddingRight: 10,
        borderRadius: 999,
        backgroundColor: "rgba(20,24,34,0.74)",
        borderWidth: 1,
    },
    legendChipOff: { borderColor: "rgba(245,238,220,0.14)", opacity: 0.46 },
    legendDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        shadowOpacity: 0.8,
        shadowRadius: 7,
        shadowOffset: { width: 0, height: 0 },
    },
    legendText: { fontFamily: fonts.serif, fontSize: 11, color: colors.cream },
    legendCount: { fontFamily: fonts.mono, fontSize: 8, color: colors.cdim },

    controls: {
        position: "absolute",
        right: 12,
        gap: 6,
        alignItems: "center",
        zIndex: 30,
    },
    zoomButton: {
        width: 34,
        height: 34,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(20,24,34,0.74)",
        borderWidth: 1,
        borderColor: "rgba(245,238,220,0.14)",
    },
    zoomButtonActive: { backgroundColor: colors.gold, borderColor: colors.gold },
    zoomButtonText: { fontFamily: fonts.serif, fontSize: 20, lineHeight: 23, color: colors.cream },
    zoomButtonTextActive: { color: colors.navy },
    zoomReadout: {
        fontFamily: fonts.mono,
        fontSize: 7.5,
        color: colors.cdim,
        letterSpacing: 0.5,
        marginTop: 1,
    },

    clusterLabel: { position: "absolute", width: 140, alignItems: "center" },
    clusterTitle: { fontFamily: fonts.serif, fontSize: 15, color: colors.cream },
    clusterCount: { fontFamily: fonts.mono, fontSize: 7, letterSpacing: 1.1, marginTop: 3 },
    cloudLabel: { position: "absolute", width: 144, alignItems: "center" },
    cloudPercent: { fontFamily: fonts.serif, fontSize: 22, color: colors.cream },
    cloudSub: { fontFamily: fonts.mono, fontSize: 8, letterSpacing: 1.1, marginTop: 2 },
    sunBadgeWrap: { position: "absolute", width: 120, alignItems: "center" },
    sunBadge: { backgroundColor: colors.gold, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
    sunBadgeText: { fontFamily: fonts.mono, fontSize: 7.5, fontWeight: "700", letterSpacing: 1, color: colors.navy },

    timeStrip: {
        position: "absolute",
        left: 12,
        right: 12,
        zIndex: 24,
        paddingHorizontal: 13,
        paddingVertical: 10,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "rgba(245,184,64,0.32)",
        backgroundColor: "rgba(16,20,30,0.84)",
    },
    timeHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        marginBottom: 8,
    },
    timeTitleCol: { flex: 1, minWidth: 0 },
    timeKicker: { fontFamily: fonts.mono, fontSize: 8, letterSpacing: 1.1, color: colors.gold },
    timeLabel: { fontFamily: fonts.serif, fontSize: 12, color: colors.cream, marginTop: 2 },
    timeGranularity: {
        flexDirection: "row",
        padding: 3,
        borderRadius: 11,
        backgroundColor: "rgba(245,238,220,0.08)",
        borderWidth: 1,
        borderColor: "rgba(245,238,220,0.1)",
    },
    timeGranularityOption: {
        minWidth: 58,
        height: 25,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        borderRadius: 8,
    },
    timeGranularityOptionActive: {
        backgroundColor: colors.gold,
    },
    timeGranularityOptionDisabled: {
        opacity: 0.6,
        backgroundColor: "rgba(245,238,220,0.04)",
    },
    timeGranularityText: {
        fontFamily: fonts.mono,
        fontSize: 7.5,
        letterSpacing: 0.55,
        color: colors.cdim,
    },
    timeGranularityTextActive: {
        color: colors.navy,
    },
    timeGranularityTextDisabled: {
        color: colors.cdim,
    },
    timeLockedNote: {
        fontFamily: fonts.mono,
        fontSize: 7,
        letterSpacing: 0.3,
        color: colors.cdim,
        marginTop: 6,
    },
    timeTrack: { height: 18, justifyContent: "center" },
    timeRail: {
        position: "absolute",
        left: 0,
        right: 0,
        top: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: "rgba(245,238,220,0.12)",
    },
    timeFill: {
        position: "absolute",
        left: 0,
        top: 6,
        height: 6,
        borderRadius: 3,
        overflow: "hidden",
    },
    timeNotch: {
        position: "absolute",
        top: 3,
        width: 2,
        height: 12,
        borderRadius: 1,
        backgroundColor: colors.cream,
    },
    timeKnob: {
        position: "absolute",
        top: 1,
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: colors.gold,
        borderWidth: 2,
        borderColor: colors.navy,
        shadowColor: colors.gold,
        shadowOpacity: 0.85,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 0 },
    },
    timeBody: { fontFamily: fonts.mono, fontSize: 7.5, color: colors.cdim, letterSpacing: 0.4, marginTop: 6 },

    balanceStrip: {
        position: "absolute",
        left: 14,
        zIndex: 23,
    },
    balanceLabelWrap: {
        width: 12,
        height: BALANCE_LABEL_LEN,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: BALANCE_LABEL_GAP,
    },
    balanceVLabel: {
        width: BALANCE_LABEL_LEN,
        textAlign: "center",
        transform: [{ rotate: "-90deg" }],
        fontFamily: fonts.mono,
        fontSize: 7.5,
        fontWeight: "700",
        letterSpacing: 2,
        color: colors.cdim,
    },
    balanceStripRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 9,
    },
    balanceBar: {
        width: 10,
        height: BALANCE_STRIP_H,
        borderRadius: 6,
        overflow: "hidden",
        flexDirection: "column",
        gap: 2,
    },
    // Same height and internal gap as balanceBar so each count resolves to the exact
    // same slot as its bar segment and stays aligned with it.
    balanceCounts: { height: BALANCE_STRIP_H, gap: 2 },
    balanceCountRow: { flexDirection: "row", alignItems: "center", gap: 5 },
    balanceCountNum: { fontFamily: fonts.serif, fontSize: 14, color: colors.cream, lineHeight: 16 },
    balanceCountLabel: { fontFamily: fonts.mono, fontSize: 7.5, letterSpacing: 0.6, color: colors.cdim },

})
