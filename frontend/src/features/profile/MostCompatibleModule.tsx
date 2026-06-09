import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native"

import { colors, fonts } from "../../theme"
import { MostCompatibleItem } from "./types"

type Props = {
    users: MostCompatibleItem[] | null;
    isLoading: boolean;
    onUserPress: (username: string) => void;
    onViewAll: () => void;
}

export default function MostCompatibleModule({ users, isLoading, onUserPress, onViewAll }: Props) {
    const preview = users?.slice(0, 3) ?? []

    return (
        <View style={styles.container} testID="most-compatible-module">
            <View style={styles.headerRow}>
                <Text style={styles.sectionTitle}>MOST COMPATIBLE</Text>
                {users && users.length > 0 && (
                    <TouchableOpacity onPress={onViewAll} testID="most-compatible-view-all">
                        <Text style={styles.viewAll}>View all →</Text>
                    </TouchableOpacity>
                )}
            </View>
            {isLoading && <ActivityIndicator color={colors.clay} style={styles.loader} />}
            {!isLoading && users !== null && users.length === 0 && (
                <Text style={styles.empty}>Rate more songs to find compatible listeners.</Text>
            )}
            {!isLoading && preview.map((user) => (
                <TouchableOpacity
                    key={user.username}
                    style={styles.row}
                    onPress={() => onUserPress(user.username)}
                    testID={`most-compatible-item-${user.username}`}
                >
                    <View style={styles.userInfo}>
                        <Text style={styles.displayName} numberOfLines={1}>{user.display_name}</Text>
                        <Text style={styles.username} numberOfLines={1}>@{user.username}</Text>
                    </View>
                    <View style={styles.scoreInfo}>
                        <Text style={styles.percent}>{Math.round(user.similarity_score * 100)}% match</Text>
                        <Text style={styles.sharedCount}>Based on {user.shared_song_count} shared ratings</Text>
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
        lineHeight: 18,
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: colors.line,
        gap: 10,
    },
    userInfo: {
        flex: 1,
        minWidth: 0,
    },
    displayName: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 15,
        lineHeight: 20,
    },
    username: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 11,
        marginTop: 2,
    },
    scoreInfo: {
        alignItems: "flex-end",
    },
    percent: {
        fontFamily: fonts.mono,
        color: colors.like,
        fontSize: 13,
        letterSpacing: 0.2,
    },
    sharedCount: {
        fontFamily: fonts.mono,
        color: colors.inkDim,
        fontSize: 10,
        marginTop: 2,
        letterSpacing: 0.2,
    },
})
