import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native"

import { ArrowLabel } from "../../components/Arrow"
import { colors, fonts } from "../../theme"
import { MostCompatibleItem } from "./types"

type Props = {
    users: MostCompatibleItem[] | null;
    isLoading: boolean;
    onUserPress: (username: string) => void;
    onViewAll: () => void;
}

// Deterministic avatar background per user, matching the profile-list palette.
const AVATAR_COLORS = [colors.accent, colors.sky, colors.plum, colors.mint, colors.gold]

function avatarColor(username: string): string {
    let hash = 0
    for (let i = 0; i < username.length; i++) {
        hash = (hash * 31 + username.charCodeAt(i)) % 997
    }
    return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

export default function MostCompatibleModule({ users, isLoading, onUserPress, onViewAll }: Props) {
    const preview = users?.slice(0, 3) ?? []

    return (
        <View style={styles.card} testID="most-compatible-module">
            <View style={styles.headerRow}>
                <Text style={styles.sectionTitle}>COMPATIBILITY</Text>
                {users && users.length > 0 && (
                    <TouchableOpacity onPress={onViewAll} testID="most-compatible-view-all">
                        <ArrowLabel text="VIEW ALL" direction="right" color={colors.accent} textStyle={styles.viewAll} />
                    </TouchableOpacity>
                )}
            </View>
            {isLoading && <ActivityIndicator color={colors.clay} style={styles.loader} />}
            {!isLoading && users !== null && users.length === 0 && (
                <Text style={styles.empty}>Rate more songs to find compatible listeners.</Text>
            )}
            {!isLoading && preview.map((user, i) => {
                const pct = Math.min(100, Math.max(0, Math.round(user.similarity_score * 100)))
                const color = avatarColor(user.username)
                const initial = (user.display_name || user.username || "?").charAt(0).toUpperCase()
                return (
                    <TouchableOpacity
                        key={user.username}
                        style={[styles.row, i === 0 ? styles.rowFirst : styles.rowRest]}
                        onPress={() => onUserPress(user.username)}
                        testID={`most-compatible-item-${user.username}`}
                        activeOpacity={0.7}
                    >
                        <View style={[styles.avatar, { backgroundColor: color }]}>
                            <Text style={styles.avatarLetter}>{initial}</Text>
                        </View>
                        <Text style={styles.username} numberOfLines={1}>@{user.username}</Text>
                        <View style={styles.barTrack}>
                            <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
                        </View>
                        <Text style={[styles.percent, { color }]}>{pct}%</Text>
                    </TouchableOpacity>
                )
            })}
        </View>
    )
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.paper,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.line,
        padding: 12,
    },
    headerRow: {
        flexDirection: "row",
        alignItems: "baseline",
        justifyContent: "space-between",
    },
    sectionTitle: {
        fontFamily: fonts.mono,
        color: colors.inkDim,
        fontSize: 9,
        letterSpacing: 1.8,
        fontWeight: "700",
        textTransform: "uppercase",
    },
    viewAll: {
        fontFamily: fonts.mono,
        color: colors.clay,
        fontSize: 9,
        letterSpacing: 0.5,
        fontWeight: "700",
    },
    loader: {
        marginVertical: 12,
    },
    empty: {
        color: colors.inkSoft,
        fontSize: 13,
        marginTop: 10,
        lineHeight: 18,
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
        gap: 9,
    },
    rowFirst: {
        marginTop: 10,
    },
    rowRest: {
        marginTop: 8,
    },
    avatar: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    avatarLetter: {
        fontFamily: fonts.display,
        color: "#fff",
        fontSize: 11,
    },
    username: {
        fontFamily: fonts.display,
        color: colors.ink,
        fontSize: 13,
        flex: 1,
        minWidth: 0,
    },
    barTrack: {
        width: 108,
        height: 7,
        backgroundColor: colors.bg,
        borderRadius: 4,
        overflow: "hidden",
        flexShrink: 0,
    },
    barFill: {
        height: 7,
        borderRadius: 4,
    },
    percent: {
        fontFamily: fonts.display,
        fontSize: 13,
        width: 42,
        textAlign: "right",
        flexShrink: 0,
    },
})
