// Shared "Top Genres" card used by both the own-profile and other-profile screens so the two
// always render an identical genre breakdown. Each bar's width is the genre's actual share of the
// user's rated songs (the percentage shown beside it), so a 16% genre fills 16% of the track. Each
// percentage is tinted to match its bar.
import { ActivityIndicator, StyleSheet, Text, View } from "react-native"

import { colors, fonts } from "../../theme"

const GENRE_COLORS = [colors.accent, colors.plum, colors.mint]

type Genre = { name: string; percentage: number }

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
                genres.map((genre, i) => {
                    const color = GENRE_COLORS[i] ?? colors.accent
                    return (
                        <View key={genre.name} style={styles.row}>
                            <Text style={styles.name} numberOfLines={1}>{genre.name}</Text>
                            <View style={styles.track}>
                                <View
                                    style={[
                                        styles.fill,
                                        { width: `${Math.min(100, Math.max(0, genre.percentage))}%`, backgroundColor: color },
                                    ]}
                                />
                            </View>
                            <Text style={[styles.pct, { color }]}>{Math.round(genre.percentage)}%</Text>
                        </View>
                    )
                })
            ) : emptyText ? (
                <Text style={styles.empty}>{emptyText}</Text>
            ) : null}
        </View>
    )
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 16,
        paddingVertical: 11,
        paddingHorizontal: 12,
        gap: 9,
        shadowColor: colors.ink,
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    name: {
        fontSize: 11.5,
        fontWeight: "700",
        color: colors.ink,
        width: 84,
    },
    track: {
        flex: 1,
        height: 8,
        borderRadius: 5,
        backgroundColor: colors.bg,
        overflow: "hidden",
    },
    fill: {
        height: "100%",
        borderRadius: 5,
    },
    pct: {
        fontFamily: fonts.display,
        fontSize: 13,
        width: 34,
        textAlign: "right",
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
