// Shared taste profile component used by ProfileScreen and OtherProfileScreen.
import { useState } from "react"
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native"

import { colors, fonts, bucketColor } from "../../theme"
import { TasteBucketSection, TasteProfileResponse, TasteSection } from "./types"

const MIN_RATINGS_FOR_GENRES = 10

type TabKey = "overall" | "like" | "okay" | "dislike"

type Props = {
    taste: TasteProfileResponse | null;
    isLoading: boolean;
    error: string | null;
}

export default function TasteTabContent({ taste, isLoading, error }: Props) {
    const [activeTab, setActiveTab] = useState<TabKey>("overall")

    if (isLoading) {
        return (
            <View style={styles.loadingState}>
                <ActivityIndicator color={colors.accent} />
            </View>
        )
    }

    if (error) {
        return (
            <View style={styles.errorState}>
                <Text style={styles.errorText}>{error}</Text>
            </View>
        )
    }

    if (!taste) {
        return null
    }

    const { total_rated, avg_score, bucket_breakdown, overall, by_bucket } = taste

    const activeSection: TasteSection | TasteBucketSection =
        activeTab === "overall" ? overall :
        activeTab === "like" ? by_bucket.like :
        activeTab === "okay" ? by_bucket.okay :
        by_bucket.dislike

    const activeBucketSection = activeTab !== "overall"
        ? (activeSection as TasteBucketSection)
        : null

    return (
        <View style={styles.content}>
            {/* Summary paper card */}
            <View style={styles.summaryCard}>
                <View style={styles.statsRow}>
                    <View style={styles.statBox}>
                        <Text style={styles.statValue}>{total_rated}</Text>
                        <Text style={styles.statLabel}>RATED</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statBox}>
                        <Text style={styles.statValue}>
                            {avg_score !== null ? avg_score.toFixed(2) : "—"}
                        </Text>
                        <Text style={styles.statLabel}>AVG SCORE</Text>
                    </View>
                </View>

                <View style={styles.bucketRow}>
                    <Text style={[styles.bucketChip, { color: bucketColor("like") }]}>
                        Like {bucket_breakdown.like}
                    </Text>
                    <Text style={styles.bucketSep}>·</Text>
                    <Text style={[styles.bucketChip, { color: bucketColor("alright") }]}>
                        Okay {bucket_breakdown.okay}
                    </Text>
                    <Text style={styles.bucketSep}>·</Text>
                    <Text style={[styles.bucketChip, { color: bucketColor("dislike") }]}>
                        Dislike {bucket_breakdown.dislike}
                    </Text>
                </View>
            </View>

            {/* BO segmented toggle */}
            <View style={styles.toggleWrap}>
                {(["overall", "like", "okay", "dislike"] as TabKey[]).map((tab) => (
                    <TouchableOpacity
                        key={tab}
                        style={[styles.togglePill, activeTab === tab && styles.togglePillActive]}
                        onPress={() => setActiveTab(tab)}
                    >
                        <Text style={[styles.toggleText, activeTab === tab && styles.toggleTextActive]}>
                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {activeBucketSection && (
                <View style={styles.bucketStatRow}>
                    <Text style={styles.bucketStatText}>
                        {activeBucketSection.count} songs
                        {activeBucketSection.avg_score !== null
                            ? `  ·  avg ${activeBucketSection.avg_score.toFixed(2)}`
                            : ""}
                    </Text>
                </View>
            )}

            {total_rated < MIN_RATINGS_FOR_GENRES ? (
                <View style={styles.emptyCard}>
                    <Text style={styles.emptyTitle}>Rate at least 10 songs to unlock your taste profile</Text>
                    <Text style={styles.emptyCount}>{total_rated} / 10 rated</Text>
                </View>
            ) : (
                <>
                    {activeSection.genres.length > 0 && (
                        <View style={styles.sectionCard}>
                            <Text style={styles.sectionKicker}>GENRES</Text>
                            {activeSection.genres.map((genre) => (
                                <View key={genre.name} style={styles.listRow}>
                                    <Text
                                        style={[
                                            styles.listLabel,
                                            genre.name === "Unknown" && styles.listLabelMuted,
                                        ]}
                                    >
                                        {genre.name}
                                    </Text>
                                    <Text
                                        style={[
                                            styles.listMeta,
                                            genre.name === "Unknown" && styles.listLabelMuted,
                                        ]}
                                    >
                                        {genre.percentage.toFixed(1)}%
                                    </Text>
                                </View>
                            ))}
                        </View>
                    )}
                </>
            )}

            {activeSection.top_artists.length > 0 && (
                <View style={styles.sectionCard}>
                    <Text style={styles.sectionKicker}>TOP ARTISTS</Text>
                    {activeSection.top_artists.map((artist) => (
                        <View key={artist.name} style={styles.listRow}>
                            <Text style={styles.listLabel}>{artist.name}</Text>
                            <Text style={styles.listMeta}>{artist.count}</Text>
                        </View>
                    ))}
                </View>
            )}
        </View>
    )
}

const styles = StyleSheet.create({
    content: {
        paddingHorizontal: 14,
        paddingTop: 14,
    },
    loadingState: {
        paddingTop: 60,
        alignItems: "center",
    },
    errorState: {
        paddingTop: 60,
        alignItems: "center",
        paddingHorizontal: 24,
    },
    errorText: {
        color: colors.danger,
        fontSize: 14,
        textAlign: "center",
        paddingHorizontal: 24,
    },
    // ── Summary card ──────────────────────────────────────────────────
    summaryCard: {
        backgroundColor: colors.paper,
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: colors.line,
        shadowColor: colors.ink,
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
    },
    statsRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 0,
        marginBottom: 14,
    },
    statBox: {
        flex: 1,
        alignItems: "center",
        paddingVertical: 4,
    },
    statDivider: {
        width: 1,
        height: 36,
        backgroundColor: colors.line,
    },
    statValue: {
        fontFamily: fonts.display,
        fontSize: 28,
        letterSpacing: -0.4,
        lineHeight: 32,
        color: colors.ink,
        marginBottom: 3,
    },
    statLabel: {
        fontFamily: fonts.mono,
        color: colors.inkDim,
        fontSize: 8.5,
        letterSpacing: 1.4,
    },
    bucketRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
    },
    bucketChip: {
        fontFamily: fonts.mono,
        fontSize: 11,
        fontWeight: "700",
        letterSpacing: 0.3,
    },
    bucketSep: {
        fontFamily: fonts.mono,
        color: colors.inkDim,
        fontSize: 11,
    },
    // ── Segmented toggle ─────────────────────────────────────────────
    toggleWrap: {
        flexDirection: "row",
        backgroundColor: colors.bg,
        borderRadius: 999,
        padding: 4,
        gap: 2,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: colors.line,
    },
    togglePill: {
        flex: 1,
        paddingVertical: 8,
        borderRadius: 999,
        alignItems: "center",
    },
    togglePillActive: {
        backgroundColor: colors.ink,
    },
    toggleText: {
        fontWeight: "600",
        fontSize: 11.5,
        color: colors.inkSoft,
    },
    toggleTextActive: {
        color: "#fff",
    },
    bucketStatRow: {
        alignItems: "center",
        marginBottom: 12,
    },
    bucketStatText: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 11,
        letterSpacing: 0.3,
    },
    // ── Empty state ──────────────────────────────────────────────────
    emptyCard: {
        backgroundColor: colors.paper,
        borderRadius: 16,
        paddingVertical: 32,
        paddingHorizontal: 20,
        alignItems: "center",
        borderWidth: 1,
        borderColor: colors.line,
        marginBottom: 12,
    },
    emptyTitle: {
        color: colors.inkSoft,
        fontSize: 15,
        textAlign: "center",
        marginBottom: 12,
        lineHeight: 22,
    },
    emptyCount: {
        fontFamily: fonts.mono,
        color: colors.inkDim,
        fontSize: 12,
        letterSpacing: 0.4,
    },
    // ── Genre / artist cards ─────────────────────────────────────────
    sectionCard: {
        backgroundColor: colors.paper,
        borderRadius: 16,
        padding: 14,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: colors.line,
        shadowColor: colors.ink,
        shadowOpacity: 0.04,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
    },
    sectionKicker: {
        fontFamily: fonts.mono,
        color: colors.inkDim,
        fontSize: 9,
        letterSpacing: 1.6,
        fontWeight: "700",
        marginBottom: 10,
    },
    listRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 9,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.line,
    },
    listLabel: {
        fontWeight: "600",
        fontSize: 14,
        color: colors.ink,
    },
    listLabelMuted: {
        color: colors.inkDim,
    },
    listMeta: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 12,
        letterSpacing: 0.3,
    },
})
