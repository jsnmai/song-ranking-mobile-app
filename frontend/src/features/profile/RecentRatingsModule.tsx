import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native"

import { bucketColor } from "../../theme"
import { colors, fonts } from "../../theme"
import { formatRelativeTime } from "../../utils/formatRelativeTime"
import { RecentVerdictItem } from "./types"

type Props = {
    verdicts: RecentVerdictItem[] | null;
    isLoading: boolean;
    onItemPress: (item: RecentVerdictItem) => void;
    title?: string;
}

export default function RecentVerdictsModule({ verdicts, isLoading, onItemPress, title = "Your Recent Verdicts" }: Props) {
    const items = verdicts?.slice(0, 3) ?? []

    if (isLoading || items.length === 0) return null

    return (
        <View style={styles.container} testID="recent-verdicts-module">
            <Text style={styles.sectionTitle}>{title}</Text>
            <View style={styles.card}>
                {items.map((item, i) => {
                    const col = bucketColor(item.bucket)
                    const when = formatRelativeTime(item.created_at)
                    const hasTake = item.note !== null && item.note !== ""
                    return (
                        <TouchableOpacity
                            key={item.rating_event_id}
                            style={[styles.row, i > 0 && styles.rowBorder]}
                            onPress={() => onItemPress(item)}
                            testID={`verdict-item-${item.rating_event_id}`}
                            activeOpacity={0.7}
                        >
                            {item.song.cover_url ? (
                                <Image
                                    source={{ uri: item.song.cover_url }}
                                    style={[styles.cover, { borderColor: col }]}
                                />
                            ) : (
                                <View style={[styles.cover, styles.coverPlaceholder, { borderColor: col }]} />
                            )}
                            <View style={styles.meta}>
                                <Text style={styles.take} numberOfLines={1}>
                                    {hasTake ? `"${item.note}"` : item.song.title}
                                </Text>
                                <Text style={styles.subline} numberOfLines={1}>
                                    {item.song.title.toUpperCase()} · {item.song.artist.toUpperCase()} · {when}
                                </Text>
                            </View>
                            <Text style={[styles.score, { color: col }]}>{item.score.toFixed(1)}</Text>
                        </TouchableOpacity>
                    )
                })}
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        marginTop: 4,
    },
    sectionTitle: {
        fontFamily: fonts.mono,
        color: colors.inkDim,
        fontSize: 9,
        letterSpacing: 1.8,
        fontWeight: "700",
        textTransform: "uppercase",
        marginBottom: 8,
        marginLeft: 2,
    },
    card: {
        backgroundColor: colors.paper,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.line,
        paddingHorizontal: 14,
        paddingVertical: 2,
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        gap: 10,
    },
    rowBorder: {
        borderTopWidth: 1,
        borderTopColor: colors.line,
    },
    cover: {
        width: 30,
        height: 30,
        borderRadius: 6,
        borderWidth: 1.5,
        flexShrink: 0,
    },
    coverPlaceholder: {
        backgroundColor: colors.paper,
    },
    meta: {
        flex: 1,
        minWidth: 0,
    },
    take: {
        fontFamily: fonts.serif,
        fontStyle: "italic",
        fontWeight: "700",
        fontSize: 12,
        color: colors.ink,
        lineHeight: 15,
    },
    subline: {
        fontFamily: fonts.mono,
        fontSize: 7.5,
        color: colors.inkDim,
        letterSpacing: 0.08,
        marginTop: 3,
    },
    score: {
        fontFamily: fonts.display,
        fontSize: 15,
        letterSpacing: -0.2,
        flexShrink: 0,
    },
})
