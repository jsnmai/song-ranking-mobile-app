// Shared "Top Genres" card used by both the own-profile and other-profile screens so the two always
// render an identical genre breakdown. Every genre the user has rated is shown (no top-N cap) as one
// full-width stacked bar whose segments are sized by each genre's share of the user's rated songs,
// with a legend below. Songs we couldn't tag arrive as a single "Unknown" bucket, shown inline as a
// full genre like any other.
//
// The bar is scrubbable: press and drag along it and a tooltip tracks your finger, naming the genre
// under it with its exact share and song count. This is the only way to read the tiny slivers, whose
// share is too small to print in the bar. Releasing parks the last tooltip; the parent screens clear
// it (via the imperative handle below) when you touch or scroll anywhere else.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import {
    ActivityIndicator,
    type LayoutChangeEvent,
    PanResponder,
    StyleSheet,
    Text,
    View,
} from "react-native"
import * as Haptics from "expo-haptics"

import { colors, fonts } from "../../theme"

// Distinct hues cycled across the genres in count order. Seven is more than most users reach; beyond
// that the palette repeats, but same-hue genres are never adjacent at realistic counts.
const GENRE_PALETTE = [
    colors.accent,
    colors.sky,
    colors.plum,
    colors.mint,
    colors.butter,
    colors.berry,
    colors.teal,
]
// A segment narrower than this share of the bar gets a floor width so it stays visible / tappable.
const TINY_SEGMENT_SHARE = 0.07
// In-bar percentage labels are only drawn on segments wide enough to fit them legibly.
const LABEL_MIN_SHARE = 0.13
// Keep the bar height in sync with styles.bar so the tooltip can anchor just above it.
const BAR_HEIGHT = 30
// Half-width of the tooltip's arrow, used to keep it pointing at the finger even when the bubble is
// clamped to the bar's edges.
const ARROW_SIZE = 10

type Genre = { name: string; percentage: number; count: number }
type Segment = { name: string; color: string; label: number; pct: number; count: number }
// A touch on the bar: index of the segment under the finger, and the finger's x within the bar.
type Active = { index: number; touchX: number }

// What the parent profile screens drive: park-and-dismiss so a touch/scroll elsewhere clears the
// tooltip, mirroring how they already dismiss the taste-tile popover.
export type TopGenresHandle = {
    dismiss: () => void
    // Given a screen-space touch, dismiss the tooltip if one is parked and the touch landed outside
    // the bar. Returns true when it handled (and swallowed) the touch so the screen can capture it.
    handleScreenTouch: (pageX: number, pageY: number) => boolean
}

function formatPct(p: number): string {
    // Show one decimal only when it carries information, so wide genres read "12%" but a tiny sliver
    // reads "0.4%" instead of a meaningless rounded "0%".
    const rounded = Math.round(p * 10) / 10
    return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`
}

function formatCount(c: number): string {
    return `${c} ${c === 1 ? "song" : "songs"}`
}

const TopGenresCard = forwardRef<
    TopGenresHandle,
    {
        genres: Genre[]
        loading?: boolean
        // Shown when there are no genres yet. Omit to render nothing in that case
        // (the other-profile screen gates the whole section on having genres).
        emptyText?: string
        // When set, the section title renders inside the card (own profile, matching the YOUR BUCKETS
        // card). Omit to render no title — the other-profile screen labels the card externally.
        title?: string
        // Fired when a scrub gesture on the bar starts (true) and ends (false). The screen uses this
        // to lock page scrolling for the duration of a scrub, and to close any other open popup
        // (e.g. a taste-tile explainer) when one starts — the two are never up at the same time.
        onScrubbingChange?: (scrubbing: boolean) => void
    }
>(function TopGenresCard({ genres, loading = false, emptyText, title, onScrubbingChange }, ref) {
    return (
        <View style={styles.card}>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {loading ? (
                <ActivityIndicator color={colors.accent} style={styles.loader} />
            ) : genres.length > 0 ? (
                <GenreSplit ref={ref} genres={genres} onScrubbingChange={onScrubbingChange} />
            ) : emptyText ? (
                <Text style={styles.empty}>{emptyText}</Text>
            ) : null}
        </View>
    )
})

export default TopGenresCard

const GenreSplit = forwardRef<
    TopGenresHandle,
    { genres: Genre[]; onScrubbingChange?: (scrubbing: boolean) => void }
>(function GenreSplit({ genres, onScrubbingChange }, ref) {
    // Keep the latest callback in a ref so the once-created PanResponder always calls the current one.
    const onScrubbingChangeRef = useRef(onScrubbingChange)
    onScrubbingChangeRef.current = onScrubbingChange
    const segments: Segment[] = genres.map((g, i) => ({
        name: g.name,
        // `label` is the whole-number share printed inside the bar; `pct` keeps the exact value the
        // tooltip shows so tiny slivers aren't flattened to 0%.
        label: Math.round(Math.min(100, Math.max(0, g.percentage))),
        pct: g.percentage,
        count: g.count,
        color: GENRE_PALETTE[i % GENRE_PALETTE.length],
    }))
    const total = segments.reduce((sum, s) => sum + s.label, 0) || 1

    // Which slice the finger is on (drives the tooltip). Kept in a ref too so the pan handlers and the
    // imperative handle can read it without being re-created.
    const [active, setActiveState] = useState<Active | null>(null)
    const activeRef = useRef<Active | null>(null)
    const setActive = useCallback((next: Active | null) => {
        activeRef.current = next
        setActiveState(next)
    }, [])

    const [barW, setBarW] = useState(0)
    const [bubbleW, setBubbleW] = useState(0)

    const barRef = useRef<View>(null)
    // Bar geometry in window coords (for the outside-touch test) and its width (for hit-testing). The
    // page only scrolls vertically, so the horizontal frame stays valid for a parked tooltip.
    const barFrameRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
    const barWidthRef = useRef(0)
    // Each segment's rendered rect within the bar. Measured (not derived from %) so the floored tiny
    // slivers are hit-tested at the width they actually occupy — the whole point of the interaction.
    const segRectsRef = useRef<Array<{ x: number; width: number } | undefined>>([])
    const segCountRef = useRef(segments.length)
    segCountRef.current = segments.length
    // Last selected index, so we only fire a haptic when the finger crosses into a new genre.
    const lastIndexRef = useRef(-1)

    const measureBar = useCallback(() => {
        barRef.current?.measureInWindow((x, y, w, h) => {
            barFrameRef.current = { x, y, w, h }
        })
    }, [])

    const segmentIndexAtX = useCallback((x: number): number => {
        const rects = segRectsRef.current
        const n = segCountRef.current
        for (let i = 0; i < n; i++) {
            const r = rects[i]
            if (r && x >= r.x && x <= r.x + r.width) return i
        }
        // In a gap between segments or past an end: snap to the nearest segment by center.
        let best = 0
        let bestDist = Infinity
        for (let i = 0; i < n; i++) {
            const r = rects[i]
            if (!r) continue
            const dist = Math.abs(x - (r.x + r.width / 2))
            if (dist < bestDist) {
                bestDist = dist
                best = i
            }
        }
        return best
    }, [])

    const updateActive = useCallback(
        (pageX: number) => {
            const frame = barFrameRef.current
            const width = barWidthRef.current
            if (!frame || !width) return
            const touchX = Math.max(0, Math.min(width, pageX - frame.x))
            const index = segmentIndexAtX(touchX)
            if (index !== lastIndexRef.current) {
                lastIndexRef.current = index
                // A soft tick as the finger crosses into a new genre — lets you feel the tiny slivers.
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
            }
            setActive({ index, touchX })
        },
        [segmentIndexAtX, setActive],
    )

    const dismiss = useCallback(() => {
        lastIndexRef.current = -1
        setActive(null)
    }, [setActive])

    const handleScreenTouch = useCallback(
        (pageX: number, pageY: number): boolean => {
            if (!activeRef.current) return false
            const frame = barFrameRef.current
            if (frame) {
                // A little slop so a touch right on the bar's edge counts as "on the bar" (re-scrub).
                const pad = 14
                const insideBar =
                    pageX >= frame.x - pad &&
                    pageX <= frame.x + frame.w + pad &&
                    pageY >= frame.y - pad &&
                    pageY <= frame.y + frame.h + pad
                if (insideBar) return false
            }
            dismiss()
            return true
        },
        [dismiss],
    )

    useImperativeHandle(ref, () => ({ dismiss, handleScreenTouch }), [dismiss, handleScreenTouch])

    // Clear a parked tooltip if the genre set changes (e.g. taste refetch) so it can't point at a
    // stale slice. We deliberately do NOT wipe segRectsRef here: onLayout fills it during mount and
    // only refires when a segment actually resizes, so clearing it after mount would leave hit-testing
    // blind and every touch would fall back to the first genre.
    useEffect(() => {
        dismiss()
    }, [genres, dismiss])

    const panResponder = useMemo(
        () =>
            PanResponder.create({
                // Claim any touch that starts or moves on the bar so the enclosing ScrollView can't
                // steal it into a scroll; refuse to yield the gesture once we have it.
                onStartShouldSetPanResponder: () => true,
                onStartShouldSetPanResponderCapture: () => true,
                onMoveShouldSetPanResponder: () => true,
                onMoveShouldSetPanResponderCapture: () => true,
                onPanResponderTerminationRequest: () => false,
                onPanResponderGrant: (evt) => {
                    // A scrub started: lock page scroll and close any other open popup.
                    onScrubbingChangeRef.current?.(true)
                    measureBar()
                    updateActive(evt.nativeEvent.pageX)
                },
                onPanResponderMove: (evt) => updateActive(evt.nativeEvent.pageX),
                // Finger lifted (or the gesture was lost): unlock scroll. The last tooltip stays
                // parked until a touch elsewhere clears it.
                onPanResponderRelease: () => onScrubbingChangeRef.current?.(false),
                onPanResponderTerminate: () => onScrubbingChangeRef.current?.(false),
            }),
        [measureBar, updateActive],
    )

    const onBarLayout = useCallback(
        (e: LayoutChangeEvent) => {
            const w = e.nativeEvent.layout.width
            barWidthRef.current = w
            setBarW(w)
            measureBar()
        },
        [measureBar],
    )

    const activeSeg = active ? segments[active.index] : null
    // Clamp the bubble inside the bar, then offset its arrow so it still points at the finger.
    const bubbleLeft = active
        ? Math.max(0, Math.min(active.touchX - bubbleW / 2, Math.max(0, barW - bubbleW)))
        : 0
    const arrowLeft = active
        ? Math.max(8, Math.min(active.touchX - bubbleLeft - ARROW_SIZE / 2, bubbleW - ARROW_SIZE - 8))
        : 0

    return (
        <View>
            <View style={styles.barWrap}>
                <View ref={barRef} style={styles.bar} onLayout={onBarLayout} {...panResponder.panHandlers}>
                    {segments.map((seg, i) => {
                        const share = seg.label / total
                        return (
                            <View
                                key={seg.name}
                                onLayout={(e) => {
                                    segRectsRef.current[i] = {
                                        x: e.nativeEvent.layout.x,
                                        width: e.nativeEvent.layout.width,
                                    }
                                }}
                                style={[
                                    styles.segment,
                                    {
                                        flex: seg.label,
                                        minWidth: share < TINY_SEGMENT_SHARE ? 14 : 0,
                                        backgroundColor: seg.color,
                                    },
                                ]}
                            >
                                {share >= LABEL_MIN_SHARE && (
                                    <Text style={styles.segLabel} numberOfLines={1}>
                                        {seg.label}
                                        <Text style={styles.segPct}>%</Text>
                                    </Text>
                                )}
                                {active?.index === i && <View pointerEvents="none" style={styles.segActive} />}
                            </View>
                        )
                    })}
                </View>
                {active && activeSeg && barW > 0 ? (
                    <View
                        pointerEvents="none"
                        onLayout={(e) => setBubbleW(e.nativeEvent.layout.width)}
                        style={[
                            styles.bubble,
                            { left: bubbleLeft, bottom: BAR_HEIGHT + 10, maxWidth: barW, opacity: bubbleW > 0 ? 1 : 0 },
                        ]}
                    >
                        <Text style={styles.bubbleName} numberOfLines={1}>
                            {activeSeg.name}
                        </Text>
                        <Text style={styles.bubbleMeta}>
                            {formatPct(activeSeg.pct)} · {formatCount(activeSeg.count)}
                        </Text>
                        <View style={[styles.bubbleArrow, { left: arrowLeft }]} />
                    </View>
                ) : null}
            </View>
            <View style={styles.legend}>
                {segments.map((seg) => (
                    <View key={seg.name} style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: seg.color }]} />
                        <Text style={styles.legendName} numberOfLines={1}>
                            {seg.name}
                        </Text>
                        <Text style={styles.legendPct}>{seg.label}%</Text>
                    </View>
                ))}
            </View>
        </View>
    )
})

const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 16,
        padding: 12,
        shadowColor: colors.ink,
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
    },
    // In-card section title (own profile), matching the YOUR BUCKETS card's kicker.
    title: {
        fontFamily: fonts.mono,
        fontSize: 9,
        letterSpacing: 1.8,
        color: colors.inkDim,
        fontWeight: "700",
        marginBottom: 10,
    },
    // Anchors the scrub tooltip above the bar. Not clipped, so the bubble can float over the card.
    barWrap: {
        position: "relative",
    },
    // The stacked bar. The 2.5px gaps reveal the card behind it as hairline dividers between segments.
    bar: {
        flexDirection: "row",
        gap: 2.5,
        height: BAR_HEIGHT,
        borderRadius: 8,
        overflow: "hidden",
    },
    segment: {
        alignItems: "center",
        justifyContent: "center",
    },
    // Outline drawn over the slice under the finger so it's clear which one the tooltip describes.
    segActive: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderWidth: 2,
        borderColor: "rgba(255,255,255,0.92)",
        borderRadius: 3,
    },
    segLabel: {
        fontFamily: fonts.display,
        fontSize: 11,
        color: "#fff",
        lineHeight: 13,
    },
    segPct: {
        fontSize: 8,
        opacity: 0.85,
    },
    // Scrub tooltip bubble, floating above the bar and tracking the finger.
    bubble: {
        position: "absolute",
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 10,
        paddingVertical: 6,
        paddingHorizontal: 10,
        shadowColor: colors.ink,
        shadowOpacity: 0.16,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 3 },
        elevation: 4,
    },
    bubbleName: {
        fontSize: 12.5,
        fontWeight: "700",
        color: colors.ink,
    },
    bubbleMeta: {
        fontFamily: fonts.mono,
        fontSize: 10,
        color: colors.inkDim,
        marginTop: 2,
        letterSpacing: 0.3,
    },
    // A small rotated square peeking below the bubble as a downward pointer toward the bar.
    bubbleArrow: {
        position: "absolute",
        bottom: -ARROW_SIZE / 2,
        width: ARROW_SIZE,
        height: ARROW_SIZE,
        backgroundColor: colors.paper,
        borderRightWidth: 1,
        borderBottomWidth: 1,
        borderColor: colors.line,
        transform: [{ rotate: "45deg" }],
    },
    legend: {
        flexDirection: "row",
        flexWrap: "wrap",
        rowGap: 7,
        columnGap: 14,
        marginTop: 11,
    },
    legendItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    legendDot: {
        width: 8,
        height: 8,
        borderRadius: 3,
    },
    legendName: {
        fontSize: 11.5,
        fontWeight: "700",
        color: colors.ink,
    },
    legendPct: {
        fontFamily: fonts.mono,
        fontSize: 9.5,
        color: colors.inkDim,
        letterSpacing: 0.4,
    },
    loader: {
        marginVertical: 16,
    },
    empty: {
        fontFamily: fonts.mono,
        fontSize: 10.5,
        color: colors.inkDim,
        paddingVertical: 6,
    },
})
