import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native"

import BucketBadge from "../../components/BucketBadge"
import { BucketName } from "../comparison/types"
import { colors, fonts } from "../../theme"
import { formatRelativeTime } from "../../utils/formatRelativeTime"
import { RecentVerdictItem } from "./types"

type Props = {
    verdicts: RecentVerdictItem[] | null;
    isLoading: boolean;
    onItemPress: (item: RecentVerdictItem) => void;
}

export default function RecentVerdictsModule({ verdicts, isLoading, onItemPress }: Props) {
    return (
        <View style={styles.container} testID="recent-verdicts-module">
            <Text style={styles.sectionTitle}>Recent Verdicts</Text>
            {isLoading && <ActivityIndicator color={colors.clay} style={styles.loader} />}
            {!isLoading && verdicts !== null && verdicts.length === 0 && (
                <Text style={styles.empty}>No ratings yet.</Text>
            )}
            {!isLoading && verdicts !== null && verdicts.map((item) => (
                <TouchableOpacity
                    key={item.rating_event_id}
                    style={styles.row}
                    onPress={() => onItemPress(item)}
                    testID={`verdict-item-${item.rating_event_id}`}
                >
                    {item.song.cover_url ? (
                        <Image source={{ uri: item.song.cover_url }} style={styles.cover} />
                    ) : (
                        <View style={[styles.cover, styles.coverPlaceholder]} />
                    )}
                    <View style={styles.meta}>
                        <Text style={styles.title} numberOfLines={1}>{item.song.title}</Text>
                        <Text style={styles.artist} numberOfLines={1}>{item.song.artist}</Text>
                        {item.note !== null && item.note !== "" && (
                            <Text style={styles.note} numberOfLines={1}>{item.note}</Text>
                        )}
                    </View>
                    <View style={styles.right}>
                        <BucketBadge bucket={item.bucket as BucketName} />
                        <Text style={styles.score}>{item.score.toFixed(1)}</Text>
                        <Text style={styles.time}>{formatRelativeTime(item.created_at)}</Text>
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
    sectionTitle: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 10,
        letterSpacing: 1.8,
        marginBottom: 10,
        textTransform: "uppercase",
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
    cover: {
        width: 44,
        height: 44,
        borderRadius: 6,
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
    note: {
        color: colors.inkDim,
        fontSize: 11,
        lineHeight: 15,
        marginTop: 2,
        fontStyle: "italic",
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
    time: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 10,
        letterSpacing: 0.3,
    },
})
