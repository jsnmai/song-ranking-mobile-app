import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import Svg, { Path } from "react-native-svg"

import { colors, fonts } from "../../theme"
import { CoSignItem } from "./types"

type SocialDiscoveryCardProps = {
    item: CoSignItem;
    token: string;
    onOpen: () => void;
    onRate: () => void;
}

const AVATAR_COLORS = [colors.accent, colors.sky, colors.plum, colors.gold, colors.butter]

export default function SocialDiscoveryCard({ item, onOpen }: SocialDiscoveryCardProps) {
    const friendCount = item.contributors.length
    const avg = item.average_visible_friend_score

    return (
        <TouchableOpacity
            style={styles.card}
            onPress={onOpen}
            activeOpacity={0.85}
            accessibilityLabel={`Open ${item.song.title}`}
        >
            {/* Row 1: pill + chevron */}
            <View style={styles.headerRow}>
                <View style={styles.pill}>
                    <Text style={styles.pillText}>Co-sign · {friendCount} friends</Text>
                </View>
                <View style={styles.chevronCircle}>
                    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none"
                        stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                        <Path d="m9 6 6 6-6 6" />
                    </Svg>
                </View>
            </View>

            {/* Row 2: cover + title/artist */}
            <View style={styles.songRow}>
                <View style={styles.coverFrame}>
                    {item.song.cover_url
                        ? <Image source={{ uri: item.song.cover_url }} style={styles.cover} />
                        : null
                    }
                </View>
                <View style={styles.songText}>
                    <Text style={styles.title} numberOfLines={1}>{item.song.title}</Text>
                    <Text style={styles.artist} numberOfLines={1}>{item.song.artist.toUpperCase()}</Text>
                </View>
            </View>

            {/* Row 3: avatars + tagline + AVG — all center-aligned in one row */}
            <View style={styles.socialRow}>
                <View style={styles.avatarStack}>
                    {item.contributors.slice(0, 4).map((c, i) => (
                        <View
                            key={i}
                            style={[styles.avatar, {
                                backgroundColor: AVATAR_COLORS[i % AVATAR_COLORS.length],
                                marginLeft: i > 0 ? -6 : 0,
                            }]}
                        >
                            <Text style={styles.avatarInitial}>
                                {(c.display_name || c.username || "?")[0].toUpperCase()}
                            </Text>
                        </View>
                    ))}
                </View>
                <Text style={styles.tagline} numberOfLines={1}>everyone gave it 9+</Text>
                <View style={styles.avgBlock}>
                    <View style={styles.avgLabelWrap}>
                        <Text style={styles.avgLabel}>AVG</Text>
                    </View>
                    <Text style={styles.avgNum}>{avg.toFixed(1)}</Text>
                </View>
            </View>
        </TouchableOpacity>
    )
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.mint,
        borderRadius: 16,
        paddingTop: 5,
        paddingBottom: 12,
        paddingHorizontal: 12,
        marginBottom: 10,
        gap: 0,
        overflow: "hidden",
    },
    headerRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
    },
    pill: {
        backgroundColor: "rgba(0,0,0,0.22)",
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    pillText: {
        fontFamily: fonts.mono,
        fontSize: 8.5,
        color: "#fff",
        letterSpacing: 1.4,
        fontWeight: "700",
        textTransform: "uppercase",
    },
    chevronCircle: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: "rgba(255,255,255,0.22)",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        marginTop: 4,
    },
    songRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 11,
    },
    coverFrame: {
        width: 48,
        height: 48,
        borderRadius: 8,
        backgroundColor: "rgba(0,0,0,0.2)",
        overflow: "hidden",
        flexShrink: 0,
    },
    cover: {
        width: "100%",
        height: "100%",
    },
    songText: {
        flex: 1,
        minWidth: 0,
    },
    title: {
        fontFamily: fonts.display,
        fontSize: 17,
        color: "#fff",
        lineHeight: 20,
    },
    artist: {
        fontFamily: fonts.mono,
        fontSize: 8,
        color: "rgba(255,255,255,0.85)",
        letterSpacing: 1,
        marginTop: 3,
    },
    socialRow: {
        flexDirection: "row",
        alignItems: "flex-end",
        gap: 8,
        justifyContent: "space-between",
        marginTop: -10,
    },
    avatarStack: {
        flexDirection: "row",
    },
    avatar: {
        width: 26,
        height: 26,
        borderRadius: 13,
        borderWidth: 1.5,
        borderColor: colors.mint,
        alignItems: "center",
        justifyContent: "center",
    },
    avatarInitial: {
        fontFamily: fonts.display,
        fontSize: 10,
        color: "#fff",
        lineHeight: 12,
    },
    tagline: {
        fontFamily: fonts.serif,
        fontStyle: "italic",
        fontSize: 11.5,
        color: "#fff",
        flex: 1,
        minWidth: 0,
    },
    avgBlock: {
        flexDirection: "row",
        alignItems: "flex-end",
        gap: 4,
        flexShrink: 0,
        marginBottom: -8,
    },
    avgLabelWrap: {
        paddingBottom: 10,
    },
    avgLabel: {
        fontFamily: fonts.mono,
        fontSize: 8,
        color: "rgba(255,255,255,0.6)",
        letterSpacing: 1.4,
        fontWeight: "700",
        lineHeight: 14,
    },
    avgNum: {
        fontFamily: fonts.display,
        fontSize: 58,
        color: "#fff",
        lineHeight: 54,
    },
})
