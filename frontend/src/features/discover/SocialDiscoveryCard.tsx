import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import Svg, { Path } from "react-native-svg"

import { colors, fonts } from "../../theme"
import { CoSignItem } from "./types"

type SocialDiscoveryCardProps = {
    item: CoSignItem;
    token: string;
    onOpen: () => void;
    onRate: () => void;
    embedded?: boolean;
    pageIndex?: number;
    pageCount?: number;
}

const AVATAR_COLORS = [colors.accent, colors.sky, colors.plum, colors.gold, colors.butter]

export default function SocialDiscoveryCard({ item, onOpen, embedded = false, pageIndex = 0, pageCount = 1 }: SocialDiscoveryCardProps) {
    const coSignCount = item.co_sign_count
    const peopleLabel = coSignCount === 1 ? "person" : "people"
    const avg = item.average_visible_friend_score
    const isPaged = pageCount > 1

    return (
        <TouchableOpacity
            style={[styles.card, embedded ? styles.embeddedCard : null]}
            onPress={onOpen}
            activeOpacity={0.85}
            accessibilityLabel={`Open ${item.song.title}`}
        >
            {/* Row 1: pill + (pager count) + chevron */}
            <View style={styles.headerRow}>
                <View style={styles.pill}>
                    <Text style={styles.pillText} numberOfLines={1}>Co-sign · {coSignCount} {peopleLabel}</Text>
                </View>
                <View style={styles.headerRight}>
                    {isPaged ? (
                        <Text style={styles.pagerCount}>{pageIndex + 1}/{pageCount}</Text>
                    ) : null}
                    <View style={styles.chevronCircle}>
                        <Svg width={15} height={15} viewBox="0 0 24 24" fill="none"
                            stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                            <Path d="m9 6 6 6-6 6" />
                        </Svg>
                    </View>
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
                <Text style={styles.tagline} numberOfLines={2}>people you follow gave 9+</Text>
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
        backgroundColor: colors.berry,
        borderRadius: 16,
        // Top and horizontal padding match (10) so the chevron sits equidistant
        // from the card's top and right edges.
        paddingTop: 10,
        paddingBottom: 8,
        paddingHorizontal: 10,
        marginBottom: 8,
        gap: 0,
        overflow: "hidden",
    },
    embeddedCard: {
        backgroundColor: "transparent",
        borderRadius: 0,
        marginBottom: 0,
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
        flexShrink: 1,
    },
    pillText: {
        fontFamily: fonts.mono,
        fontSize: 8.5,
        color: "#fff",
        letterSpacing: 1.4,
        fontWeight: "700",
        textTransform: "uppercase",
    },
    headerRight: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        flexShrink: 0,
    },
    pagerCount: {
        fontFamily: fonts.mono,
        fontSize: 9,
        color: "rgba(255,255,255,0.75)",
        letterSpacing: 0.7,
        fontWeight: "700",
    },
    chevronCircle: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: "rgba(255,255,255,0.22)",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    songRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 9,
    },
    coverFrame: {
        width: 42,
        height: 42,
        borderRadius: 7,
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
        fontSize: 16,
        color: "#fff",
        lineHeight: 18,
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
        alignItems: "center",
        gap: 7,
        justifyContent: "space-between",
        marginTop: 3,
    },
    avatarStack: {
        flexDirection: "row",
    },
    avatar: {
        width: 23,
        height: 23,
        borderRadius: 11.5,
        borderWidth: 1.5,
        borderColor: colors.berry,
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
        fontSize: 10.5,
        lineHeight: 12.5,
        color: "#fff",
        flex: 1,
        minWidth: 0,
    },
    avgBlock: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        flexShrink: 0,
    },
    avgLabelWrap: {},
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
        fontSize: 36,
        color: "#fff",
        lineHeight: 36,
    },
})
