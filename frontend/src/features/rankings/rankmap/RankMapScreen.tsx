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
import Svg, { Circle, Defs, Ellipse, G, Line, Path, RadialGradient, Rect, Stop } from "react-native-svg"
import { CompositeNavigationProp, RouteProp, useNavigation, useRoute } from "@react-navigation/native"
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"

import { AppStackParamList, RankingsStackParamList, TabParamList } from "../../../navigation/types"
import { useAuth } from "../../auth/AuthContext"
import { BucketName } from "../../comparison/types"
import { bucketColor, colors, fonts } from "../../../theme"
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
    { key: "gravity", label: "Gravity" },
    { key: "genres", label: "Genres" },
    { key: "nebula", label: "Verdict" },
]

const CAPTION: Record<RankView, string> = {
    gravity: "Distance to your sun = how much you love it",
    genres: "Stars cluster and connect by genre",
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
const MAX_ZOOM = 2.35

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

// Gravity — a planet on a tilted orbit around a sun, mirroring the spiral lens.
function GravityIcon({ color }: { color: string }) {
    return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <G transform="rotate(-24 12 12)">
                <Ellipse cx={12} cy={12} rx={9.5} ry={5} stroke={color} strokeWidth={1.6} />
                <Circle cx={21.5} cy={12} r={1.7} fill={color} />
            </G>
            <Circle cx={12} cy={12} r={2.7} fill={color} />
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
    const [timeTrackWidth, setTimeTrackWidth] = useState(1)

    const panRef = useRef(pan)
    const zoomRef = useRef(zoom)
    const gestureRef = useRef({ panStart: pan, zoomStart: zoom, pinchStart: 0 })

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

    const genreLayouts = useMemo(() => {
        if (songs.length === 0) return []
        return constellationLayout(songs, { w: worldW, h: worldH })
    }, [songs, worldW, worldH])
    const genreNames = useMemo(() => genreLayouts.map((con) => con.genre), [genreLayouts])
    const activeGenreSet = activeGenres ?? new Set(genreNames)
    // A song's filter key is the constellation it landed in (its genre, or
    // "Other" when its genre rolled into the tail) — never its raw genre, so the
    // "Other" pill toggles the long-tail songs and nothing falls through.
    const genreOfSong = useMemo(() => {
        const m = new Map<number, string>()
        genreLayouts.forEach((con) => con.nodes.forEach((n) => m.set(n.s.id, con.genre)))
        return m
    }, [genreLayouts])

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
        if (!canTimeTravel) return
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

    const panResponder = useMemo(
        () => PanResponder.create({
            onStartShouldSetPanResponder: (event) => event.nativeEvent.touches.length >= 2,
            onMoveShouldSetPanResponder: (event, gesture) => (
                event.nativeEvent.touches.length >= 2 ||
                Math.abs(gesture.dx) > 5 ||
                Math.abs(gesture.dy) > 5
            ),
            onPanResponderGrant: (event) => {
                gestureRef.current = {
                    panStart: panRef.current,
                    zoomStart: zoomRef.current,
                    pinchStart: touchDistance(event),
                }
            },
            onPanResponderMove: (event, gesture) => {
                const touches = event.nativeEvent.touches
                if (touches.length >= 2 && gestureRef.current.pinchStart > 0) {
                    const dist = touchDistance(event)
                    updateZoom(gestureRef.current.zoomStart * (dist / gestureRef.current.pinchStart))
                    return
                }
                updatePan({
                    x: gestureRef.current.panStart.x + gesture.dx,
                    y: gestureRef.current.panStart.y + gesture.dy,
                })
            },
        }),
        [],
    )

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
        const maxR = Math.max(minR + 120, Math.min(worldW, worldH) / 2 - 62)
        return { ...gravityLayout(songs, { cx, cy, minR, maxR }), cx, cy, minR, maxR }
    }, [view, songs, worldW, worldH])

    const genres = useMemo(() => {
        if (view !== "genres" || songs.length === 0) return null
        return { cl: genreLayouts, segs: constellationSegments(genreLayouts) }
    }, [view, songs, genreLayouts])

    const nebula = useMemo(() => {
        if (view !== "nebula" || songs.length === 0) return null
        return nebulaLayout(songs, {
            w: worldW,
            h: worldH,
            colors: { like: colors.like, sky: colors.sky, plum: colors.plum },
        })
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
        if (view === "genres") return passesTime && activeGenreSet.has(genreOfSong.get(s.id) ?? s.genre)
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
    // The reset control only "lights up" when there's something to reset.
    const isDefaultView = pan.x === 0 && pan.y === 0 && zoom === 1

    return (
        <View style={styles.root}>
            <Cosmos width={width} height={height} seed={`rank-map-${view}`} />

            <View style={[styles.viewport, { top: stageTop, height: stageH }]} {...panResponder.panHandlers}>
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
                            left: worldLeft,
                            top: worldTop,
                            width: worldW,
                            height: worldH,
                            transform: [
                                { translateX: pan.x },
                                { translateY: pan.y },
                                { scale: zoom },
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
                                    targetOpacity={opacityOf(p.s)}
                                    onPress={pressOf(p.s)}
                                    label={p.s.title}
                                />
                            ))}
                            <Sun
                                x={gravity.cx}
                                y={gravity.cy}
                                cover={gravity.sun.cover}
                                bucket={gravity.sun.bucket}
                                onPress={pressOf(gravity.sun)}
                                targetOpacity={opacityOf(gravity.sun)}
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
                                            strokeWidth={1}
                                            strokeDasharray="4 4"
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
                                        glowRadius={8}
                                        targetOpacity={opacityOf(n.s, n.bright)}
                                        onPress={pressOf(n.s)}
                                        label={n.s.title}
                                    />
                                )),
                            )}
                            {genres.cl.map((con) => (
                                activeGenreSet.has(con.genre) ? (
                                    <View
                                        key={con.genre}
                                        pointerEvents="none"
                                        style={[styles.clusterLabel, { left: con.ctr.x - 70, top: con.ctr.y - 70 }]}
                                    >
                                        <Text style={styles.clusterTitle} numberOfLines={1}>
                                            {con.genre}
                                        </Text>
                                        <Text style={[styles.clusterCount, { color: con.color }]}>
                                            {con.nodes.length} STARS
                                        </Text>
                                    </View>
                                ) : null
                            ))}
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
                                        targetOpacity={opacityOf(n.s)}
                                        onPress={pressOf(n.s)}
                                        label={n.s.title}
                                    />
                                )),
                            )}
                            {nebula.map((c) => (
                                activeBuckets.has(c.key) ? (
                                    <View
                                        key={c.key}
                                        pointerEvents="none"
                                        style={[styles.cloudLabel, { left: c.cx - 72, top: c.cy - 26 }]}
                                    >
                                        <Text style={styles.cloudPercent}>{Math.round(c.share * 100)}%</Text>
                                        <Text style={[styles.cloudSub, { color: c.color }]}>
                                            {bucketLabel(c.key).toUpperCase()} · {c.list.length}
                                        </Text>
                                    </View>
                                ) : null
                            ))}
                        </>
                    )}
                </View>
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
                        disabled={!canTimeTravel}
                        accessibilityRole="button"
                        accessibilityState={{ selected: timeMode, disabled: !canTimeTravel }}
                        accessibilityLabel={timeMode ? "Exit taste over time" : "Taste over time"}
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
                <ZoomButton label="+" accessibilityLabel="Zoom in" onPress={() => updateZoom(zoomRef.current + 0.22)} />
                <ZoomButton
                    label="−"
                    accessibilityLabel="Zoom out"
                    onPress={() => updateZoom(zoomRef.current - 0.22)}
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
                                        accessibilityLabel={`Show ${option.label.toLowerCase()} time travel`}
                                    >
                                        <Text
                                            style={[
                                                styles.timeGranularityText,
                                                active && styles.timeGranularityTextActive,
                                            ]}
                                        >
                                            {option.label}
                                        </Text>
                                    </Pressable>
                                )
                            })}
                        </View>
                    </View>
                    <View
                        style={styles.timeTrack}
                        onLayout={(event) => setTimeTrackWidth(Math.max(1, event.nativeEvent.layout.width))}
                        {...timePanResponder.panHandlers}
                    >
                        <View style={styles.timeRail} />
                        <View style={[styles.timeFill, { width: progressPx }]} />
                        <View style={[styles.timeKnob, { left: progressPx - 8 }]} />
                    </View>
                    <Text style={styles.timeBody}>
                        {visibleAtTime} of {songs.length} stars have appeared · drag to replay how your taste formed
                    </Text>
                </View>
            )}

            {showBalanceStrip && (
                <View style={[styles.balanceStrip, { bottom: bottomStripLift }]}>
                    <Text style={styles.balanceKicker}>YOUR TASTE BALANCE</Text>
                    <View style={styles.balanceBar}>
                        {nebula?.map((c) => (
                            <View
                                key={c.key}
                                style={[
                                    styles.balancePart,
                                    {
                                        flex: Math.max(c.list.length, 0.2),
                                        backgroundColor: c.color,
                                        opacity: activeBuckets.has(c.key) ? 1 : 0.28,
                                    },
                                ]}
                            />
                        ))}
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
        justifyContent: "space-between",
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
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
    },
    timeGranularityOptionActive: {
        backgroundColor: colors.gold,
    },
    timeGranularityOptionDisabled: {
        opacity: 0.36,
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
        backgroundColor: colors.gold,
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
        left: 12,
        right: 12,
        zIndex: 23,
        paddingHorizontal: 13,
        paddingVertical: 10,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.cline,
        backgroundColor: "rgba(16,20,30,0.84)",
    },
    balanceKicker: { fontFamily: fonts.mono, fontSize: 7.5, letterSpacing: 1.1, color: colors.cdim, marginBottom: 7 },
    balanceBar: { flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", gap: 2 },
    balancePart: { height: 8 },

})
