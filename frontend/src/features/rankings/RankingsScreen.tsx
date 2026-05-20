// Rankings tab — shows the user's ranked songs sorted by score.
import { useCallback, useState } from "react"
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { FlashList } from "@shopify/flash-list"
import { useFocusEffect, useNavigation } from "@react-navigation/native"
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs"

import { TabParamList } from "../../navigation/types"
import { useAuth } from "../auth/AuthContext"
import { BucketName, RankingResponse } from "../comparison/types"
import { listMyRankings } from "./apiRequests"

type RankingsViewMode = "flat" | "grouped" | "separators"

const BUCKET_LABELS: Record<BucketName, string> = {
    like: "Like",
    alright: "Alright",
    dislike: "Dislike",
}

export default function RankingsScreen() {
    // Navigate to Discover and auto-focus the search bar — same action as tapping the FAB.
    const navigation = useNavigation<BottomTabNavigationProp<TabParamList>>()
    const { token } = useAuth()
    const [viewMode] = useState<RankingsViewMode>("flat")
    const [rankings, setRankings] = useState<RankingResponse[]>([])
    const [nextCursor, setNextCursor] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const loadRankings = useCallback(async (
        cursor: string | null,
        shouldReplace: boolean,
    ) => {
        if (!token) {
            return
        }

        if (shouldReplace) {
            setIsLoading(true)
        } else {
            setIsLoadingMore(true)
        }
        setError(null)

        try {
            const response = await listMyRankings(token, cursor ?? undefined)
            if (shouldReplace) {
                setRankings(response.rankings)
            } else {
                setRankings((currentRankings) => [...currentRankings, ...response.rankings])
            }
            setNextCursor(response.next_cursor)
        } catch (err) {
            if (err instanceof Error) {
                setError(err.message)
            } else {
                setError("Rankings are temporarily unavailable.")
            }
        } finally {
            setIsLoading(false)
            setIsLoadingMore(false)
        }
    }, [token])

    const handleLoadMore = () => {
        if (!nextCursor || isLoading || isLoadingMore) {
            return
        }

        loadRankings(nextCursor, false)
    }

    function handleRateFirstSong() {
        navigation.navigate("Discover", { focusSearch: true })
    }

    const renderRanking = ({ item }: { item: RankingResponse }) => {
        if (viewMode !== "flat") {
            return null
        }

        return (
            <View style={styles.rankingRow}>
                <View style={styles.coverFrame}>
                    {item.song.cover_url ? (
                        <Image source={{ uri: item.song.cover_url }} style={styles.coverImage} />
                    ) : null}
                </View>
                <View style={styles.songText}>
                    <Text style={styles.title} numberOfLines={1}>{item.song.title}</Text>
                    <Text style={styles.artist} numberOfLines={1}>{item.song.artist}</Text>
                    <Text style={styles.meta} numberOfLines={1}>
                        {BUCKET_LABELS[item.bucket]} · #{item.position}
                    </Text>
                </View>
                <Text style={styles.score}>{item.score.toFixed(2)}</Text>
            </View>
        )
    }

    const renderFooter = () => {
        if (!isLoadingMore) {
            return null
        }

        return <ActivityIndicator color="#fff" style={styles.footerSpinner} />
    }

    useFocusEffect(
        useCallback(() => {
            loadRankings(null, true)
        }, [loadRankings]),
    )

    if (isLoading && rankings.length === 0) {
        return (
            <View style={styles.centerState}>
                <ActivityIndicator color="#fff" />
            </View>
        )
    }

    if (error !== null && rankings.length === 0) {
        return (
            <View style={styles.centerState}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={styles.button} onPress={() => loadRankings(null, true)}>
                    <Text style={styles.buttonText}>Try again</Text>
                </TouchableOpacity>
            </View>
        )
    }

    if (rankings.length === 0) {
        return (
            <View style={styles.centerState}>
                <Text style={styles.emptyText}>Rate your first song</Text>
                <TouchableOpacity style={styles.button} onPress={handleRateFirstSong}>
                    <Text style={styles.buttonText}>Find a song</Text>
                </TouchableOpacity>
            </View>
        )
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.heading}>Rankings</Text>
                {error !== null && <Text style={styles.inlineError}>{error}</Text>}
            </View>
            <FlashList
                data={rankings}
                estimatedItemSize={81}
                renderItem={renderRanking}
                keyExtractor={(item) => item.id.toString()}
                onEndReached={handleLoadMore}
                onEndReachedThreshold={0.6}
                ListFooterComponent={renderFooter}
                contentContainerStyle={styles.listContent}
            />
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#000",
    },
    centerState: {
        flex: 1,
        backgroundColor: "#000",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 24,
    },
    header: {
        paddingTop: 60,
        paddingHorizontal: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#1f1f1f",
    },
    heading: {
        color: "#fff",
        fontSize: 28,
        fontWeight: "700",
    },
    inlineError: {
        color: "#ff6b6b",
        fontSize: 14,
        marginTop: 8,
    },
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 24,
    },
    emptyText: {
        color: "#fff",
        fontSize: 18,
        marginBottom: 24,
    },
    button: {
        paddingVertical: 12,
        paddingHorizontal: 32,
        borderWidth: 1,
        borderColor: "#fff",
        borderRadius: 8,
    },
    buttonText: {
        color: "#fff",
        fontSize: 16,
    },
    errorText: {
        color: "#ff6b6b",
        fontSize: 15,
        marginBottom: 24,
        textAlign: "center",
    },
    rankingRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#1f1f1f",
    },
    coverFrame: {
        width: 56,
        height: 56,
        borderRadius: 6,
        marginRight: 12,
        backgroundColor: "#1a1a1a",
        overflow: "hidden",
    },
    coverImage: {
        width: "100%",
        height: "100%",
    },
    songText: {
        flex: 1,
        minWidth: 0,
    },
    title: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "600",
        marginBottom: 3,
    },
    artist: {
        color: "#b8b8b8",
        fontSize: 14,
        marginBottom: 4,
    },
    meta: {
        color: "#777",
        fontSize: 13,
    },
    score: {
        color: "#fff",
        fontSize: 20,
        fontWeight: "700",
        marginLeft: 12,
        minWidth: 52,
        textAlign: "right",
    },
    footerSpinner: {
        marginVertical: 18,
    },
})
