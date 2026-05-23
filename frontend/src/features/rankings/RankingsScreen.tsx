// Rankings tab — shows the user's ranked songs sorted by score.
import { useCallback, useState } from "react"
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { FlashList } from "@shopify/flash-list"
import { CompositeNavigationProp, useFocusEffect, useNavigation } from "@react-navigation/native"
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"

import { ApiError } from "../../api/client"
import DiamondScore from "../../components/DiamondScore"
import { AppStackParamList, TabParamList } from "../../navigation/types"
import { colors, fonts, bucketColor } from "../../theme"
import { useAuth } from "../auth/AuthContext"
import { RankingResponse } from "../comparison/types"
import { listMyRankings } from "./apiRequests"

type RankingsNavigation = CompositeNavigationProp<
    BottomTabNavigationProp<TabParamList, "Rankings">,
    NativeStackNavigationProp<AppStackParamList>
>

export default function RankingsScreen() {
    const navigation = useNavigation<RankingsNavigation>()
    const { token } = useAuth()
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
            if (err instanceof ApiError) {
                setError(err.detail)
            } else if (err instanceof Error) {
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

    const handleRankingPress = (ranking: RankingResponse) => {
        navigation.navigate("SongDetail", { ranking })
    }

    const handleReorderPress = () => {
        navigation.navigate("Reorder")
    }

    const renderRanking = ({ item }: { item: RankingResponse }) => {
        const accent = bucketColor(item.bucket)

        return (
            <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.song.title} details`}
                testID={`ranking-row-${item.id}`}
                style={styles.rankingRow}
                onPress={() => handleRankingPress(item)}
                activeOpacity={0.8}
            >
                <Text style={styles.position}>#{item.position}</Text>
                <View style={styles.coverFrame}>
                    {item.song.cover_url ? (
                        <Image source={{ uri: item.song.cover_url }} style={styles.coverImage} />
                    ) : null}
                </View>
                <View style={styles.songInfo}>
                    <Text style={styles.title} numberOfLines={1}>{item.song.title}</Text>
                    <Text style={styles.artist} numberOfLines={1}>{item.song.artist}</Text>
                </View>
                <View style={styles.scoreArea}>
                    <DiamondScore score={item.score} total={5} size={7} color={accent} />
                    <Text style={[styles.scoreText, { color: accent }]}>{item.score.toFixed(1)}</Text>
                </View>
            </TouchableOpacity>
        )
    }

    const renderFooter = () => {
        if (!isLoadingMore) {
            return null
        }

        return <ActivityIndicator color={colors.clay} style={styles.footerSpinner} />
    }

    useFocusEffect(
        useCallback(() => {
            loadRankings(null, true)
        }, [loadRankings]),
    )

    if (isLoading && rankings.length === 0) {
        return (
            <View style={styles.centerState}>
                <ActivityIndicator color={colors.clay} />
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
                <View>
                    <Text style={styles.kicker}>YOUR LIST</Text>
                    <Text style={styles.heading}>Rankings</Text>
                </View>
                <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Reorder rankings"
                    onPress={handleReorderPress}
                    style={styles.reorderButton}
                >
                    <Text style={styles.reorderButtonText}>Reorder</Text>
                </TouchableOpacity>
                {error !== null && <Text style={styles.inlineError}>{error}</Text>}
            </View>
            <FlashList
                data={rankings}
                renderItem={renderRanking}
                keyExtractor={(item) => item.id.toString()}
                onEndReached={handleLoadMore}
                onEndReachedThreshold={0.6}
                ListFooterComponent={renderFooter}
                maintainVisibleContentPosition={{ disabled: true }}
                contentContainerStyle={styles.listContent}
            />
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.bg,
    },
    centerState: {
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 24,
    },
    header: {
        paddingTop: 60,
        paddingHorizontal: 18,
        paddingBottom: 14,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        backgroundColor: colors.bg,
    },
    kicker: {
        color: colors.inkSoft,
        fontSize: 10,
        fontWeight: "600",
        letterSpacing: 1.8,
        marginBottom: 2,
    },
    heading: {
        color: colors.ink,
        fontSize: 26,
        fontFamily: fonts.serif,
    },
    inlineError: {
        color: colors.dislike,
        fontSize: 14,
        marginTop: 8,
        width: "100%",
    },
    reorderButton: {
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderColor: colors.ink,
        borderRadius: 8,
    },
    reorderButtonText: {
        color: colors.ink,
        fontSize: 13,
        fontWeight: "600",
    },
    listContent: {
        paddingHorizontal: 18,
        paddingBottom: 24,
    },
    emptyText: {
        color: colors.ink,
        fontSize: 18,
        marginBottom: 24,
    },
    button: {
        paddingVertical: 12,
        paddingHorizontal: 32,
        borderWidth: 1,
        borderColor: colors.ink,
        borderRadius: 8,
    },
    buttonText: {
        color: colors.ink,
        fontSize: 16,
    },
    errorText: {
        color: colors.dislike,
        fontSize: 15,
        marginBottom: 24,
        textAlign: "center",
    },
    rankingRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        paddingHorizontal: 6,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
        backgroundColor: colors.paper,
    },
    position: {
        color: colors.inkDim,
        fontSize: 10,
        fontFamily: fonts.mono,
        minWidth: 32,
        letterSpacing: 0.4,
    },
    coverFrame: {
        width: 40,
        height: 40,
        borderRadius: 6,
        marginRight: 10,
        backgroundColor: colors.sand,
        overflow: "hidden",
    },
    coverImage: {
        width: "100%",
        height: "100%",
    },
    songInfo: {
        flex: 1,
        minWidth: 0,
    },
    title: {
        color: colors.ink,
        fontSize: 14,
        fontWeight: "600",
        marginBottom: 3,
    },
    artist: {
        color: colors.inkSoft,
        fontSize: 12,
    },
    scoreArea: {
        alignItems: "center",
        gap: 5,
        marginLeft: 10,
    },
    scoreText: {
        fontSize: 13,
        fontFamily: fonts.mono,
    },
    footerSpinner: {
        marginVertical: 18,
    },
})
