// Shared taste profile component used by ProfileScreen and OtherProfileScreen.
import { useState } from "react"
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native"

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
            <View style={styles.centered}>
                <ActivityIndicator color="#fff" />
            </View>
        )
    }

    if (error) {
        return (
            <View style={styles.centered}>
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
        <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
        >
            <View style={styles.headerRow}>
                <View style={styles.statBox}>
                    <Text style={styles.statValue}>{total_rated}</Text>
                    <Text style={styles.statLabel}>Rated</Text>
                </View>
                <View style={styles.statBox}>
                    <Text style={styles.statValue}>
                        {avg_score !== null ? avg_score.toFixed(2) : "—"}
                    </Text>
                    <Text style={styles.statLabel}>Avg Score</Text>
                </View>
            </View>

            <View style={styles.bucketRow}>
                <Text style={styles.bucketText}>
                    <Text style={styles.bucketLike}>Like {bucket_breakdown.like}</Text>
                    <Text style={styles.bucketSep}>  ·  </Text>
                    <Text style={styles.bucketOkay}>Okay {bucket_breakdown.okay}</Text>
                    <Text style={styles.bucketSep}>  ·  </Text>
                    <Text style={styles.bucketDislike}>Dislike {bucket_breakdown.dislike}</Text>
                </Text>
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
                <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>Rate at least 10 songs to unlock your taste profile</Text>
                    <Text style={styles.emptyCount}>{total_rated} / 10 rated</Text>
                </View>
            ) : (
                <>
                    {activeSection.genres.length > 0 && (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Genres</Text>
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
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Top Artists</Text>
                    {activeSection.top_artists.map((artist) => (
                        <View key={artist.name} style={styles.artistRow}>
                            <Text style={styles.artistName}>{artist.name}</Text>
                            <Text style={styles.artistCount}>{artist.count}</Text>
                        </View>
                    ))}
                </View>
            )}
        </ScrollView>
    )
}

const styles = StyleSheet.create({
    scroll: {
        flex: 1,
        backgroundColor: "#000",
    },
    content: {
        paddingHorizontal: 24,
        paddingBottom: 40,
        paddingTop: 20,
    },
    centered: {
        flex: 1,
        backgroundColor: "#000",
        alignItems: "center",
        justifyContent: "center",
        paddingTop: 60,
    },
    errorText: {
        color: "#ff6b6b",
        fontSize: 14,
        textAlign: "center",
    },
    headerRow: {
        flexDirection: "row",
        justifyContent: "center",
        gap: 48,
        marginBottom: 20,
    },
    statBox: {
        alignItems: "center",
    },
    statValue: {
        color: "#fff",
        fontSize: 28,
        fontWeight: "700",
        marginBottom: 4,
    },
    statLabel: {
        color: "#888",
        fontSize: 13,
    },
    bucketRow: {
        alignItems: "center",
        marginBottom: 24,
    },
    bucketText: {
        fontSize: 14,
    },
    bucketLike: {
        color: "#4caf50",
    },
    bucketOkay: {
        color: "#ffd54f",
    },
    bucketDislike: {
        color: "#ef5350",
    },
    bucketSep: {
        color: "#555",
    },
    toggleRow: {
        flexDirection: "row",
        marginBottom: 20,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#333",
        overflow: "hidden",
    },
    toggleBtn: {
        flex: 1,
        paddingVertical: 10,
        alignItems: "center",
        backgroundColor: "#000",
    },
    toggleBtnActive: {
        backgroundColor: "#fff",
    },
    toggleText: {
        color: "#888",
        fontSize: 13,
        fontWeight: "600",
    },
    toggleTextActive: {
        color: "#000",
    },
    bucketStatRow: {
        alignItems: "center",
        marginBottom: 16,
    },
    bucketStatText: {
        color: "#888",
        fontSize: 13,
    },
    emptyState: {
        alignItems: "center",
        paddingVertical: 40,
    },
    emptyTitle: {
        color: "#888",
        fontSize: 15,
        textAlign: "center",
        marginBottom: 12,
    },
    emptyCount: {
        color: "#555",
        fontSize: 13,
    },
    section: {
        marginBottom: 28,
    },
    sectionTitle: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "600",
        marginBottom: 12,
    },
    genreRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: "#222",
    },
    genreName: {
        color: "#fff",
        fontSize: 15,
    },
    genreNameMuted: {
        color: "#555",
    },
    genrePct: {
        color: "#888",
        fontSize: 15,
    },
    artistRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: "#222",
    },
    artistName: {
        color: "#fff",
        fontSize: 15,
    },
    artistCount: {
        color: "#888",
        fontSize: 15,
    },
})
