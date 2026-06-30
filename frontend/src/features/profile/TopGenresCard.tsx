// Shared "Top Genres" card used by both the own-profile and other-profile screens so the two always
// render an identical genre breakdown. The genres render as one full-width stacked bar whose segments
// are sized by each genre's share of the user's rated songs, with a legend below. Genres rarely
// individually approach 100%, so independent per-genre bars left the track mostly empty; here the
// segments fill the whole bar. When the named genres don't cover everything, an honest "Other"
// remainder fills the rest so no single genre is overstated.
import { ActivityIndicator, StyleSheet, Text, View } from "react-native"

import { colors, fonts } from "../../theme"

const GENRE_COLORS = [colors.accent, colors.plum, colors.mint]
// The leftover beyond the named genres only earns its own segment when it's a meaningful slice.
const OTHER_MIN_PERCENT = 4
// A segment narrower than this share of the bar gets a floor width so it stays visible / tappable.
const TINY_SEGMENT_SHARE = 0.07
// In-bar percentage labels are only drawn on segments wide enough to fit them legibly.
const LABEL_MIN_SHARE = 0.13

type Genre = { name: string; percentage: number }
type Segment = { name: string; percentage: number; color: string; isOther?: boolean }

export default function TopGenresCard({
    genres,
    loading = false,
    emptyText,
}: {
    genres: Genre[]
    loading?: boolean
    // Shown when there are no genres yet. Omit to render nothing in that case
    // (the other-profile screen gates the whole section on having genres).
    emptyText?: string
}) {
    return (
        <View style={styles.card}>
            {loading ? (
                <ActivityIndicator color={colors.accent} style={styles.loader} />
            ) : genres.length > 0 ? (
                <GenreSplit genres={genres} />
            ) : emptyText ? (
                <Text style={styles.empty}>{emptyText}</Text>
            ) : null}
        </View>
    )
}

function GenreSplit({ genres }: { genres: Genre[] }) {
    // Round each share up front so the printed numbers and the "Other" remainder always add up.
    const named: Segment[] = genres.map((g, i) => ({
        name: g.name,
        percentage: Math.round(Math.min(100, Math.max(0, g.percentage))),
        color: GENRE_COLORS[i] ?? colors.accent,
    }))
    const namedTotal = named.reduce((sum, s) => sum + s.percentage, 0)
    const rest = Math.max(0, 100 - namedTotal)
    const segments: Segment[] =
        rest >= OTHER_MIN_PERCENT
            ? [...named, { name: "Other genres", percentage: rest, color: colors.inkDim, isOther: true }]
            : named
    const total = segments.reduce((sum, s) => sum + s.percentage, 0) || 1

    return (
        <View>
            <View style={styles.bar}>
                {segments.map((seg) => {
                    const share = seg.percentage / total
                    return (
                        <View
                            key={seg.name}
                            style={[
                                styles.segment,
                                {
                                    flex: seg.percentage,
                                    minWidth: share < TINY_SEGMENT_SHARE ? 14 : 0,
                                    backgroundColor: seg.color,
                                },
                            ]}
                        >
                            {share >= LABEL_MIN_SHARE && (
                                <Text
                                    style={[styles.segLabel, seg.isOther && styles.segLabelOther]}
                                    numberOfLines={1}
                                >
                                    {seg.percentage}
                                    <Text style={styles.segPct}>%</Text>
                                </Text>
                            )}
                        </View>
                    )
                })}
            </View>
            <View style={styles.legend}>
                {segments.map((seg) => (
                    <View key={seg.name} style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: seg.color }]} />
                        <Text
                            style={[styles.legendName, seg.isOther && styles.legendNameOther]}
                            numberOfLines={1}
                        >
                            {seg.name}
                        </Text>
                        <Text style={styles.legendPct}>{seg.percentage}%</Text>
                    </View>
                ))}
            </View>
        </View>
    )
}

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
    // The stacked bar. The 2.5px gaps reveal the card behind it as hairline dividers between segments.
    bar: {
        flexDirection: "row",
        gap: 2.5,
        height: 30,
        borderRadius: 8,
        overflow: "hidden",
    },
    segment: {
        alignItems: "center",
        justifyContent: "center",
    },
    segLabel: {
        fontFamily: fonts.display,
        fontSize: 11,
        color: "#fff",
        lineHeight: 13,
    },
    segLabelOther: {
        color: colors.paper,
    },
    segPct: {
        fontSize: 8,
        opacity: 0.85,
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
    legendNameOther: {
        color: colors.inkDim,
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
