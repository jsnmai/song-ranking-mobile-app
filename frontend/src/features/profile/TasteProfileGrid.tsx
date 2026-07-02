// TasteProfileGrid — the Bento Orbit "Layout H" Taste Profile, shared by the own-
// and other-profile screens so both always mirror: a 3-up row of stat cards
// (Range with genre dots, Top Artist disc, Selectivity EQ bars) over an
// Avg Score card beside the Rating Split donut. Everything derives from one
// TasteProfileResponse, so callers pass the response and nothing else.
import { useCallback, useState } from "react"
import { type GestureResponderEvent, Image, StyleSheet, Text, View } from "react-native"
import Svg, { Circle } from "react-native-svg"

import { bucketColor, colors, fonts } from "../../theme"
import TasteStripTile, { type PopoverFrame } from "./TasteStripTile"
import { TasteProfileResponse } from "./types"

// Genre-dot spectrum under the Range count (design kit GENRE_DOTS order).
const GENRE_DOT_COLORS = [colors.accent, colors.sky, colors.plum, colors.mint, colors.gold]
// Selectivity EQ bars climb a gold ramp, muted to bright (design kit golds).
const EQ_GOLDS = ["#f5d98a", "#f5c860", "#f5b840", "#e59a1e"]

function GenreDots({ n }: { n: number }) {
    return (
        <View style={styles.genreDots}>
            {Array.from({ length: Math.max(1, Math.min(n, 5)) }).map((_, i) => (
                <View key={i} style={[styles.genreDot, { backgroundColor: GENRE_DOT_COLORS[i] }]} />
            ))}
        </View>
    )
}

// Four ascending bars; `level` of them light up gold, the rest stay as track stubs.
function EqBars({ level }: { level: number }) {
    return (
        <View style={styles.eqBars}>
            {EQ_GOLDS.map((gold, i) => (
                <View
                    key={i}
                    style={[
                        styles.eqBar,
                        { height: 10 + i * 8, backgroundColor: i < level ? gold : colors.paper2 },
                    ]}
                />
            ))}
        </View>
    )
}

// "Forming" indicator for Selectivity: gold bars climbing upward — the stat is accumulating as
// more ratings come in across the app, so it reads as "building, arrives on its own", not a lock.
function FormingBars() {
    return (
        <View style={styles.eqBars}>
            {[0.35, 0.55, 0.78, 1].map((op, i) => (
                <View
                    key={i}
                    style={[
                        styles.eqBar,
                        { height: 10 + i * 8, backgroundColor: colors.gold, opacity: op },
                    ]}
                />
            ))}
        </View>
    )
}

// Ten slim pips under the average — round(avg) light up accent.
function ScorePips({ score }: { score: number }) {
    const filled = Math.round(score)
    return (
        <View style={styles.scorePips}>
            {Array.from({ length: 10 }).map((_, i) => (
                <View
                    key={i}
                    style={[
                        styles.scorePip,
                        { backgroundColor: i < filled ? colors.accent : colors.paper2 },
                    ]}
                />
            ))}
        </View>
    )
}

// Compact proportion donut for the rating split. Each bucket is one arc; small gaps
// between arcs come off each segment's dash length. The Svg is rotated so the first
// segment starts at 12 o'clock; the center total overlays unrotated.
const DONUT_SIZE = 62
const DONUT_STROKE = 9
const DONUT_GAP = 3
const POPOVER_TOUCH_SLOP = 8
export type TasteProfileOpenTile = "range" | "topArtist" | "selectivity" | "avgScore" | null

function pointIsInPopoverFrame(x: number, y: number, frame: PopoverFrame) {
    return (
        x >= frame.x - POPOVER_TOUCH_SLOP &&
        x <= frame.x + frame.w + POPOVER_TOUCH_SLOP &&
        y >= frame.y - POPOVER_TOUCH_SLOP &&
        y <= frame.y + frame.h + POPOVER_TOUCH_SLOP
    )
}

function SplitDonut({ segments, total }: { segments: [string, number, string][]; total: number }) {
    const r = (DONUT_SIZE - DONUT_STROKE) / 2
    const c = 2 * Math.PI * r
    const drawn = segments.filter(([, n]) => n > 0)
    let acc = 0
    return (
        <View style={styles.donutWrap}>
            <Svg
                width={DONUT_SIZE}
                height={DONUT_SIZE}
                viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}
                style={{ transform: [{ rotate: "-90deg" }] }}
            >
                {drawn.length === 0 ? (
                    <Circle
                        cx={DONUT_SIZE / 2}
                        cy={DONUT_SIZE / 2}
                        r={r}
                        fill="none"
                        stroke={colors.paper2}
                        strokeWidth={DONUT_STROKE}
                    />
                ) : (
                    drawn.map(([label, n, color]) => {
                        const frac = n / total
                        const dash = Math.max(0.001, frac * c - DONUT_GAP)
                        const el = (
                            <Circle
                                key={label}
                                cx={DONUT_SIZE / 2}
                                cy={DONUT_SIZE / 2}
                                r={r}
                                fill="none"
                                stroke={color}
                                strokeWidth={DONUT_STROKE}
                                strokeLinecap="round"
                                strokeDasharray={`${dash} ${c - dash}`}
                                strokeDashoffset={-acc}
                            />
                        )
                        acc += frac * c
                        return el
                    })
                )}
            </Svg>
            <View style={styles.donutCenter} pointerEvents="none">
                <Text style={styles.donutTotal}>{total}</Text>
                <Text style={styles.donutTotalLabel}>SONGS</Text>
            </View>
        </View>
    )
}

export default function TasteProfileGrid({
    taste,
    isOwn = false,
    openTile,
    onOpenTileChange,
    onPopoverFrameChange,
    popoverViewportBottomInset = 0,
}: {
    taste: TasteProfileResponse
    // Switches the popover explainer copy between second person (your own profile)
    // and third person (someone else's).
    isOwn?: boolean
    openTile?: TasteProfileOpenTile
    onOpenTileChange?: (nextOpenTile: TasteProfileOpenTile) => void
    onPopoverFrameChange?: (frame: PopoverFrame | null) => void
    popoverViewportBottomInset?: number
}) {
    const [localOpenTile, setLocalOpenTile] = useState<TasteProfileOpenTile>(null)
    const [popoverFrame, setPopoverFrame] = useState<PopoverFrame | null>(null)
    const activeOpenTile = openTile ?? localOpenTile
    const setOpenTileState = onOpenTileChange ?? setLocalOpenTile
    const setActiveOpenTile = useCallback((nextOpenTile: TasteProfileOpenTile) => {
        if (nextOpenTile === null) {
            setPopoverFrame(null)
            onPopoverFrameChange?.(null)
        }
        setOpenTileState(nextOpenTile)
    }, [onPopoverFrameChange, setOpenTileState])
    // Range counts distinct genres, including the "Unknown" bucket (untagged songs
    // count as one group, matching Top Genres).
    const genreCount = taste.overall?.genres?.length ?? 0
    const topArtist = taste.overall?.top_artists?.[0] ?? null

    // Selectivity "warms up": the percentile is null/forming until there are enough
    // peers to rank against. The backend percentile is how harsh you are (share of
    // raters more generous), so we flip it to a positive "Top X%" on whichever side
    // this profile leans — SELECTIVITY for few likes, GENEROSITY for many — so the
    // tile never reads as negative. Older responses may omit harshness entirely;
    // treat that the same as forming.
    const harshness = taste.harshness ?? null
    const selectivityPct = harshness?.status === "ready" ? harshness.percentile : null
    const selectivityLabel =
        selectivityPct === null || selectivityPct >= 50 ? "SELECTIVITY" : "GENEROSITY"
    const selectivityStrength =
        selectivityPct === null ? 0 : selectivityPct >= 50 ? selectivityPct : 100 - selectivityPct
    const selectivityText = selectivityPct === null ? "Forming" : `Top ${100 - selectivityStrength}%`
    const selectivityTitle = selectivityLabel === "GENEROSITY" ? "Generosity" : "Selectivity"
    const selectivityDesc = selectivityPct === null
        ? [
            `How often ${isOwn ? "you give" : "they give"} a 'like' rating compared to everyone else.`,
            `We'll rank ${isOwn ? "you" : "them"} once enough other people have rated songs too.`,
        ].join(" ")
        : [
            `How often ${isOwn ? "you give" : "they give"} a 'like' rating compared to everyone else.`,
            `Fewer likes ranks ${isOwn ? "you" : "them"} as more selective, more likes as more generous.`,
            `'Top X%' is where ${isOwn ? "you land" : "they land"} among all raters.`,
        ].join(" ")

    const avg = taste.avg_score
    const avgDescription = avg === null
        ? [
            `Based on every score ${isOwn ? "you've" : "they've"} given`,
            "once the ranking map has enough songs.",
        ].join(" ")
        : [
            `Based on every score ${isOwn ? "you've" : "they've"} given`,
            "across Like, Okay, and Dislike.",
        ].join(" ")
    const buckets: [string, number, string][] = [
        ["Like", taste.bucket_breakdown?.like ?? 0, bucketColor("like")],
        ["Okay", taste.bucket_breakdown?.okay ?? 0, bucketColor("okay")],
        ["Dislike", taste.bucket_breakdown?.dislike ?? 0, bucketColor("dislike")],
    ]
    const bucketTotal = buckets.reduce((sum, [, n]) => sum + n, 0)

    const updatePopoverFrame = useCallback((frame: PopoverFrame | null) => {
        setPopoverFrame(frame)
        onPopoverFrameChange?.(frame)
    }, [onPopoverFrameChange])

    const dismissOpenTileForBackgroundTouch = (event: GestureResponderEvent) => {
        if (!activeOpenTile) return false

        const { pageX, pageY } = event.nativeEvent
        if (popoverFrame && pointIsInPopoverFrame(pageX, pageY, popoverFrame)) {
            setActiveOpenTile(null)
            return true
        }

        return false
    }

    return (
        <View onStartShouldSetResponderCapture={dismissOpenTileForBackgroundTouch}>
            {/* Row 1 — Range / Top Artist / Selectivity */}
            <View
                pointerEvents="box-none"
                style={[styles.topRow, activeOpenTile && activeOpenTile !== "avgScore" ? styles.activeRow : null]}
            >
                <TasteStripTile
                    label="RANGE"
                    sublabel={genreCount === 1 ? "GENRE" : "GENRES"}
                    title="Range"
                    description={
                        `How many different genres ${isOwn ? "you've" : "they've"} rated across. ` +
                        "Songs we couldn't tag are grouped as one 'Unknown' genre."
                    }
                    testID="strip-range"
                    open={activeOpenTile === "range"}
                    onOpenChange={(nextOpen) => setActiveOpenTile(nextOpen ? "range" : null)}
                    popoverEdge="start"
                    viewportBottomInset={popoverViewportBottomInset}
                    onPopoverFrameChange={activeOpenTile === "range" ? updatePopoverFrame : undefined}
                >
                    <Text style={styles.rangeNumber}>{genreCount}</Text>
                    <GenreDots n={genreCount} />
                </TasteStripTile>
                <TasteStripTile
                    label="TOP ARTIST"
                    title="Top Artist"
                    description={`The artist ${isOwn ? "you've" : "they've"} rated the most songs from.`}
                    statValue={topArtist && topArtist.count > 0 ? String(topArtist.count) : undefined}
                    statLabel="SONGS RATED"
                    testID="strip-top-artist"
                    open={activeOpenTile === "topArtist"}
                    onOpenChange={(nextOpen) => setActiveOpenTile(nextOpen ? "topArtist" : null)}
                    popoverEdge="center"
                    viewportBottomInset={popoverViewportBottomInset}
                    onPopoverFrameChange={activeOpenTile === "topArtist" ? updatePopoverFrame : undefined}
                    // The name rides the card's bottom slot, so its baseline lines up with the
                    // sibling captions (GENRES / TOP X% / FORMING) and the art disc gets all the
                    // leftover height to breathe in. Two lines let "Taylor Swift"-style names put
                    // one word per line; really long names ellipsize. Count lives in the popover.
                    foot={topArtist ? (
                        <Text style={styles.artistName} numberOfLines={2}>
                            {topArtist.name}
                        </Text>
                    ) : undefined}
                >
                    {topArtist ? (
                        // Art disc: the cover of their highest-scored song by this artist
                        // (from the taste response); initial disc only as a fallback.
                        topArtist.cover_url ? (
                            <Image source={{ uri: topArtist.cover_url }} style={styles.artistDisc} />
                        ) : (
                            <View style={[styles.artistDisc, styles.artistDiscFallback]}>
                                <Text style={styles.artistDiscLetter}>
                                    {topArtist.name.charAt(0).toUpperCase()}
                                </Text>
                            </View>
                        )
                    ) : (
                        <Text style={styles.artistEmpty}>Not enough ratings yet</Text>
                    )}
                </TasteStripTile>
                <TasteStripTile
                    label={selectivityLabel}
                    sublabel={selectivityPct === null ? "FORMING" : selectivityText.toUpperCase()}
                    title={selectivityTitle}
                    description={selectivityDesc}
                    statValue={selectivityPct === null ? undefined : selectivityText}
                    statLabel={selectivityPct === null ? undefined : "OF ALL RATERS"}
                    testID="strip-selectivity"
                    open={activeOpenTile === "selectivity"}
                    onOpenChange={(nextOpen) => setActiveOpenTile(nextOpen ? "selectivity" : null)}
                    popoverEdge="end"
                    viewportBottomInset={popoverViewportBottomInset}
                    onPopoverFrameChange={activeOpenTile === "selectivity" ? updatePopoverFrame : undefined}
                >
                    {selectivityPct === null ? (
                        <FormingBars />
                    ) : (
                        <EqBars level={Math.max(1, Math.round(selectivityStrength / 25))} />
                    )}
                </TasteStripTile>
            </View>

            {/* Row 2 — Avg Score beside the Rating Split donut */}
            <View
                pointerEvents="box-none"
                style={[styles.bottomRow, activeOpenTile === "avgScore" ? styles.activeRow : null]}
            >
                <TasteStripTile
                    label="AVG SCORE"
                    sublabel="OUT OF 10"
                    title="Average Score"
                    description={avgDescription}
                    statValue={avg !== null ? avg.toFixed(1) : undefined}
                    statLabel={avg !== null ? "OUT OF 10" : undefined}
                    testID="strip-avg-score"
                    style={styles.avgTile}
                    open={activeOpenTile === "avgScore"}
                    onOpenChange={(nextOpen) => setActiveOpenTile(nextOpen ? "avgScore" : null)}
                    popoverEdge="start"
                    viewportBottomInset={popoverViewportBottomInset}
                    onPopoverFrameChange={activeOpenTile === "avgScore" ? updatePopoverFrame : undefined}
                >
                    <Text style={styles.avgNumber}>{avg !== null ? avg.toFixed(1) : "—"}</Text>
                    <ScorePips score={avg ?? 0} />
                </TasteStripTile>
                <View style={styles.splitCard} testID="rating-split-card">
                    <Text style={styles.splitLabel}>RATING SPLIT</Text>
                    <View style={styles.splitBody}>
                        <SplitDonut segments={buckets} total={bucketTotal} />
                        <View style={styles.splitLegend}>
                            {buckets.map(([label, n, color]) => (
                                <View key={label} style={styles.splitLegendRow}>
                                    <View style={[styles.splitLegendDot, { backgroundColor: color }]} />
                                    <Text style={styles.splitLegendLabel}>{label}</Text>
                                    <Text style={styles.splitLegendCount}>{n}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                </View>
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    topRow: {
        flexDirection: "row",
        gap: 8,
    },
    bottomRow: {
        flexDirection: "row",
        gap: 9,
        marginTop: 9,
    },
    activeRow: {
        zIndex: 20,
        elevation: 20,
    },
    // Range
    rangeNumber: {
        fontFamily: fonts.display,
        fontSize: 26,
        lineHeight: 28,
        letterSpacing: -0.5,
        color: colors.ink,
    },
    genreDots: {
        flexDirection: "row",
        gap: 5,
    },
    genreDot: {
        width: 9,
        height: 9,
        borderRadius: 4.5,
    },
    // Top Artist
    artistDisc: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: colors.paper2,
        overflow: "hidden",
    },
    artistDiscFallback: {
        backgroundColor: colors.navy,
        alignItems: "center",
        justifyContent: "center",
    },
    artistDiscLetter: {
        fontFamily: fonts.display,
        fontSize: 15,
        color: colors.cream,
    },
    artistName: {
        fontFamily: fonts.display,
        fontSize: 14,
        lineHeight: 16,
        color: colors.ink,
        textAlign: "center",
        // Optical baseline alignment with the sibling cards' 8pt mono captions:
        // the display face reserves more descender space below its glyphs, so at
        // 0 the name's letters sit visibly higher than GENRES / FORMING even
        // though the text boxes share a bottom edge; -2 visibly overshot low.
        // -1 is the tuned-by-eye midpoint.
        marginBottom: -1,
        includeFontPadding: false,
    },
    artistEmpty: {
        fontSize: 11,
        color: colors.inkDim,
        textAlign: "center",
    },
    // Selectivity
    eqBars: {
        flexDirection: "row",
        alignItems: "flex-end",
        gap: 4,
        height: 34,
    },
    eqBar: {
        width: 8,
        borderRadius: 3,
    },
    // Avg Score
    // No height floor: the tile stretches to match the Rating Split card beside it.
    avgTile: {
        flex: 0.85,
    },
    avgNumber: {
        fontFamily: fonts.display,
        fontSize: 28,
        lineHeight: 30,
        letterSpacing: -0.5,
        color: colors.ink,
    },
    scorePips: {
        flexDirection: "row",
        gap: 3,
    },
    scorePip: {
        width: 5,
        height: 12,
        borderRadius: 2,
    },
    // Rating Split
    splitCard: {
        flex: 1.15,
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 16,
        paddingTop: 14,
        paddingBottom: 13,
        paddingHorizontal: 14,
        shadowColor: colors.ink,
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
    },
    splitLabel: {
        fontFamily: fonts.mono,
        fontSize: 8.5,
        letterSpacing: 1.3,
        color: colors.accent,
        fontWeight: "700",
        textAlign: "center",
        marginBottom: 12,
    },
    splitBody: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 15,
    },
    donutWrap: {
        width: DONUT_SIZE,
        height: DONUT_SIZE,
        flexShrink: 0,
    },
    donutCenter: {
        ...StyleSheet.absoluteFillObject,
        alignItems: "center",
        justifyContent: "center",
    },
    donutTotal: {
        fontFamily: fonts.display,
        fontSize: 15,
        lineHeight: 17,
        color: colors.ink,
    },
    donutTotalLabel: {
        fontFamily: fonts.mono,
        fontSize: 6,
        letterSpacing: 0.9,
        fontWeight: "700",
        color: colors.inkDim,
        marginTop: 2,
    },
    splitLegend: {
        flex: 1,
        minWidth: 0,
        gap: 6,
    },
    splitLegendRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    splitLegendDot: {
        width: 8,
        height: 8,
        borderRadius: 2,
        flexShrink: 0,
    },
    splitLegendLabel: {
        flex: 1,
        fontSize: 11.5,
        fontWeight: "700",
        color: colors.ink,
    },
    splitLegendCount: {
        fontFamily: fonts.display,
        fontSize: 12.5,
        color: colors.ink,
    },
})
