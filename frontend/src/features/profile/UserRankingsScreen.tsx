import { useCallback, useEffect, useState } from "react"
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { NativeStackScreenProps } from "@react-navigation/native-stack"

import { ApiError } from "../../api/client"
import { AppStackParamList } from "../../navigation/types"
import { colors, fonts } from "../../theme"
import { useAuth } from "../auth/AuthContext"
import { RankingResponse } from "../comparison/types"
import { getProfileRankings } from "./apiRequests"

type Props = NativeStackScreenProps<AppStackParamList, "UserRankings">

const PAGE_SIZE = 30

export default function UserRankingsScreen({ navigation, route }: Props) {
    const { username } = route.params
    const { token } = useAuth()
    const [rankings, setRankings] = useState<RankingResponse[]>([])
    const [nextCursor, setNextCursor] = useState<string | undefined>(undefined)
    const [isLoading, setIsLoading] = useState(true)
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const fetchPage = useCallback(
        async (cursor?: string) => {
            if (!token) {
                return
            }
            try {
                const data = await getProfileRankings(username, token, cursor)
                if (cursor) {
                    setRankings((prev) => [...prev, ...data.rankings])
                } else {
                    setRankings(data.rankings)
                }
                setNextCursor(data.next_cursor ?? undefined)
            } catch (err) {
                if (err instanceof ApiError) {
                    setError(err.detail)
                } else if (err instanceof Error) {
                    setError(err.message)
                } else {
                    setError("Failed to load rankings.")
                }
            }
        },
        [token, username],
    )

    useEffect(() => {
        setIsLoading(true)
        fetchPage().finally(() => setIsLoading(false))
    }, [fetchPage])

    const loadMore = async () => {
        if (!nextCursor || isLoadingMore) {
            return
        }
        setIsLoadingMore(true)
        await fetchPage(nextCursor)
        setIsLoadingMore(false)
    }

    const openSongDetail = (ranking: RankingResponse) => {
        navigation.navigate("SongDetail", { ranking })
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>
                <Text style={styles.heading}>@{username}'s Rankings</Text>
            </View>

            {isLoading ? (
                <ActivityIndicator color={colors.clay} style={styles.loader} />
            ) : error !== null ? (
                <Text style={styles.error}>{error}</Text>
            ) : (
                <FlatList
                    data={rankings}
                    keyExtractor={(item) => String(item.id)}
                    contentContainerStyle={styles.list}
                    onEndReached={loadMore}
                    onEndReachedThreshold={0.3}
                    ListEmptyComponent={
                        <Text style={styles.empty}>No visible rankings yet.</Text>
                    }
                    ListFooterComponent={
                        isLoadingMore ? (
                            <ActivityIndicator color={colors.clay} style={styles.footerLoader} />
                        ) : null
                    }
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={styles.row}
                            onPress={() => openSongDetail(item)}
                            testID={`user-ranking-row-${item.id}`}
                        >
                            <Text style={styles.position}>#{item.position}</Text>
                            <View style={styles.rowMeta}>
                                <Text style={styles.title} numberOfLines={1}>{item.song.title}</Text>
                                <Text style={styles.artist} numberOfLines={1}>
                                    {item.song.artist} · {item.song.album}
                                </Text>
                            </View>
                            <View style={styles.rowRight}>
                                <Text style={styles.score}>{item.score.toFixed(1)}</Text>
                            </View>
                        </TouchableOpacity>
                    )}
                />
            )}
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.bg,
    },
    header: {
        paddingTop: 60,
        paddingHorizontal: 18,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
    },
    backButton: {
        paddingVertical: 6,
        marginBottom: 8,
        alignSelf: "flex-start",
    },
    backText: {
        fontFamily: fonts.mono,
        color: colors.ink,
        fontSize: 14,
        letterSpacing: 0.4,
    },
    heading: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 24,
        lineHeight: 28,
    },
    loader: {
        marginTop: 48,
    },
    error: {
        color: colors.dislike,
        fontSize: 14,
        textAlign: "center",
        margin: 24,
    },
    list: {
        paddingHorizontal: 18,
        paddingBottom: 32,
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
        gap: 10,
    },
    position: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 12,
        width: 32,
        textAlign: "right",
    },
    rowMeta: {
        flex: 1,
        minWidth: 0,
    },
    title: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 15,
        lineHeight: 19,
    },
    artist: {
        color: colors.inkSoft,
        fontSize: 12,
        lineHeight: 16,
        marginTop: 2,
    },
    rowRight: {
        alignItems: "flex-end",
    },
    score: {
        fontFamily: fonts.mono,
        color: colors.ink,
        fontSize: 13,
    },
    empty: {
        color: colors.inkSoft,
        fontSize: 14,
        textAlign: "center",
        marginTop: 48,
    },
    footerLoader: {
        marginVertical: 16,
    },
})
