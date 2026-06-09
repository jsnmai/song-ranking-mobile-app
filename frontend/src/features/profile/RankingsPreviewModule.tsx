import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native"

import BucketBadge from "../../components/BucketBadge"
import { RankingResponse } from "../comparison/types"
import { colors, fonts } from "../../theme"

type Props = {
    rankings: RankingResponse[] | null;
    isLoading: boolean;
    onItemPress: (ranking: RankingResponse) => void;
    onViewAll: () => void;
}

export default function RankingsPreviewModule({ rankings, isLoading, onItemPress, onViewAll }: Props) {
    return (
        <View style={styles.container} testID="rankings-preview-module">
            <View style={styles.headerRow}>
                <Text style={styles.sectionTitle}>Rankings</Text>
                <TouchableOpacity onPress={onViewAll} testID="rankings-view-all">
                    <Text style={styles.viewAll}>View all →</Text>
                </TouchableOpacity>
            </View>
            {isLoading && <ActivityIndicator color={colors.clay} style={styles.loader} />}
            {!isLoading && rankings !== null && rankings.length === 0 && (
                <Text style={styles.empty}>No rankings yet.</Text>
            )}
            {!isLoading && rankings !== null && rankings.map((ranking) => (
                <TouchableOpacity
                    key={ranking.id}
                    style={styles.row}
                    onPress={() => onItemPress(ranking)}
                    testID={`rankings-preview-item-${ranking.id}`}
                >
                    <Text style={styles.position}>#{ranking.position}</Text>
                    {ranking.song.cover_url ? (
                        <Image source={{ uri: ranking.song.cover_url }} style={styles.cover} />
                    ) : (
                        <View style={[styles.cover, styles.coverPlaceholder]} />
                    )}
                    <View style={styles.meta}>
                        <Text style={styles.title} numberOfLines={1}>{ranking.song.title}</Text>
                        <Text style={styles.artist} numberOfLines={1}>{ranking.song.artist}</Text>
                    </View>
                    <View style={styles.right}>
                        <BucketBadge bucket={ranking.bucket} />
                        <Text style={styles.score}>{ranking.score.toFixed(1)}</Text>
                    </View>
                </TouchableOpacity>
            ))}
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        marginTop: 20,
    },
    headerRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 10,
    },
    sectionTitle: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 10,
        letterSpacing: 1.8,
        textTransform: "uppercase",
    },
    viewAll: {
        fontFamily: fonts.mono,
        color: colors.clay,
        fontSize: 11,
        letterSpacing: 0.4,
    },
    loader: {
        marginVertical: 12,
    },
    empty: {
        color: colors.inkSoft,
        fontSize: 13,
        marginVertical: 8,
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: colors.line,
        gap: 10,
    },
    position: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 11,
        width: 28,
        textAlign: "right",
    },
    cover: {
        width: 40,
        height: 40,
        borderRadius: 5,
        backgroundColor: colors.paper,
    },
    coverPlaceholder: {
        borderWidth: 1,
        borderColor: colors.line,
    },
    meta: {
        flex: 1,
        minWidth: 0,
    },
    title: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 14,
        lineHeight: 18,
    },
    artist: {
        color: colors.inkSoft,
        fontSize: 12,
        lineHeight: 16,
        marginTop: 2,
    },
    right: {
        alignItems: "flex-end",
        gap: 2,
    },
    score: {
        fontFamily: fonts.mono,
        color: colors.ink,
        fontSize: 12,
    },
})
