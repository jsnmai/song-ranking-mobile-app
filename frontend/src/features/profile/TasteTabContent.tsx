// Shared taste profile component used by ProfileScreen and OtherProfileScreen.
import { useState } from "react"
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native"

import DiamondScore from "../../components/DiamondScore"
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
                <ActivityIndicator color={colors.clay} />
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
            <View style={styles.summaryCard}>
                <View style={styles.headerRow}>
                    <View style={styles.statBox}>
                        <Text style={styles.statValue}>{total_rated}</Text>
                        <Text style={styles.statLabel}>RATED</Text>
                    </View>
                    <View style={styles.statBox}>
                        <View style={styles.avgRow}>
                            <Text style={styles.statValue}>
                                {avg_score !== null ? avg_score.toFixed(2) : "—"}
                            </Text>
                            {avg_score !== null && (
                                <DiamondScore
                                    score={avg_score}
                                    total={5}
                                    size={7}
                                    color={colors.clay}
                                    testID="taste-avg-diamonds"
                                />
                            )}
                        </View>
                        <Text style={styles.statLabel}>AVG SCORE</Text>
                    </View>
                </View>

                <View style={styles.bucketRow}>
                    <Text style={styles.bucketText}>
                        <Text style={{ color: bucketColor("like") }}>Like {bucket_breakdown.like}</Text>
                        <Text style={styles.bucketSep}>  ·  </Text>
                        <Text style={{ color: bucketColor("alright") }}>Okay {bucket_breakdown.okay}</Text>
                        <Text style={styles.bucketSep}>  ·  </Text>
                        <Text style={{ color: bucketColor("dislike") }}>Dislike {bucket_breakdown.dislike}</Text>
                    </Text>
                </View>
            </View>

            <View style={styles.toggleRow}>
                {(["overall", "like", "okay", "dislike"] as TabKey[]).map((tab) => (
                    <TouchableOpacity
                        key={tab}
                        style={[styles.toggleBtn, activeTab === tab && styles.toggleBtnActive]}
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
                            <Text style={styles.sectionTitle}>GENRES</Text>
                            {activeSection.genres.map((genre) => (
                                <View key={genre.name} style={styles.genreRow}>
                                    <Text
                                        style={[
                                            styles.genreName,
                                            genre.name === "Unknown" && styles.genreNameMuted,
                                        ]}
                                    >
                                        {genre.name}
                                    </Text>
                                    <Text
                                        style={[
                                            styles.genrePct,
                                            genre.name === "Unknown" && styles.genreNameMuted,
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
                    <Text style={styles.sectionTitle}>TOP ARTISTS</Text>
                    {activeSection.top_artists.map((artist) => (
                        <View key={artist.name} style={styles.artistRow}>
                            <Text style={styles.artistName}>{artist.name}</Text>
                            <Text style={styles.artistCount}>{artist.count}</Text>
                        </View>
                    ))}
                </View>
            )}
        </View>
    )
}

const cardShadow = {
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
}

const styles = StyleSheet.create({
    content: {
        paddingHorizontal: 16,
        paddingTop: 16,
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
        color: colors.dislike,
        fontSize: 14,
        textAlign: "center",
        paddingHorizontal: 24,
    },
    summaryCard: {
        backgroundColor: colors.paper,
        borderRadius: 14,
        padding: 18,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: colors.line,
        ...cardShadow,
    },
    headerRow: {
        flexDirection: "row",
        justifyContent: "center",
        gap: 48,
        marginBottom: 16,
    },
    statBox: {
        alignItems: "center",
    },
    avgRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginBottom: 4,
    },
    statValue: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 28,
        lineHeight: 32,
    },
    statLabel: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 10,
        letterSpacing: 1.6,
    },
    bucketRow: {
        alignItems: "center",
    },
    bucketText: {
        fontFamily: fonts.mono,
        fontSize: 12,
    },
    bucketSep: {
        color: colors.inkDim,
    },
    toggleRow: {
        flexDirection: "row",
        marginBottom: 16,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.line,
        overflow: "hidden",
        backgroundColor: colors.paper,
    },
    toggleBtn: {
        flex: 1,
        paddingVertical: 10,
        alignItems: "center",
        backgroundColor: colors.paper,
    },
    toggleBtnActive: {
        backgroundColor: colors.sand,
    },
    toggleText: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 12,
        letterSpacing: 0.4,
    },
    toggleTextActive: {
        color: colors.ink,
    },
    bucketStatRow: {
        alignItems: "center",
        marginBottom: 16,
    },
    bucketStatText: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 12,
    },
    emptyCard: {
        backgroundColor: colors.paper,
        borderRadius: 14,
        paddingVertical: 32,
        paddingHorizontal: 20,
        alignItems: "center",
        borderWidth: 1,
        borderColor: colors.line,
        marginBottom: 16,
        ...cardShadow,
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
    sectionCard: {
        backgroundColor: colors.paper,
        borderRadius: 14,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: colors.line,
        ...cardShadow,
    },
    sectionTitle: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 10,
        letterSpacing: 1.8,
        marginBottom: 12,
    },
    genreRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.line,
    },
    genreName: {
        color: colors.ink,
        fontSize: 15,
    },
    genreNameMuted: {
        color: colors.inkDim,
    },
    genrePct: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 13,
    },
    artistRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.line,
    },
    artistName: {
        color: colors.ink,
        fontSize: 15,
    },
    artistCount: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 13,
    },
})
