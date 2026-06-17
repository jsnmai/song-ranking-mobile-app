// "View all" — a paginated list of one user's activity cards (their full rating history).
import { useCallback, useEffect, useState } from "react"
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { NativeStackScreenProps } from "@react-navigation/native-stack"

import { ApiError } from "../../api/client"
import { AppStackParamList } from "../../navigation/types"
import { colors, fonts } from "../../theme"
import ActivityCard from "../activity/ActivityCard"
import { useAuth } from "../auth/AuthContext"
import { getProfileActivity } from "./apiRequests"
import { RecentRatingItem } from "./types"

type Props = NativeStackScreenProps<AppStackParamList, "UserActivity">

export default function UserActivityScreen({ navigation, route }: Props) {
    const { username } = route.params
    const { token } = useAuth()
    const [items, setItems] = useState<RecentRatingItem[]>([])
    const [nextCursor, setNextCursor] = useState<string | undefined>(undefined)
    const [isLoading, setIsLoading] = useState(true)
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const fetchPage = useCallback(
        async (cursor?: string) => {
            if (!token) return
            try {
                const data = await getProfileActivity(username, token, cursor)
                setItems((prev) => (cursor ? [...prev, ...data.items] : data.items))
                setNextCursor(data.next_cursor ?? undefined)
            } catch (err) {
                if (err instanceof ApiError) {
                    setError(err.detail)
                } else if (err instanceof Error) {
                    setError(err.message)
                } else {
                    setError("Failed to load activity.")
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
        if (!nextCursor || isLoadingMore) return
        setIsLoadingMore(true)
        await fetchPage(nextCursor)
        setIsLoadingMore(false)
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>
                <Text style={styles.heading}>@{username}'s Activity</Text>
            </View>

            {isLoading ? (
                <ActivityIndicator color={colors.accent} style={styles.loader} />
            ) : error !== null ? (
                <Text style={styles.error}>{error}</Text>
            ) : (
                <FlatList
                    data={items}
                    keyExtractor={(item) => String(item.rating_event_id)}
                    contentContainerStyle={styles.list}
                    onEndReached={loadMore}
                    onEndReachedThreshold={0.4}
                    ListEmptyComponent={<Text style={styles.empty}>No visible activity yet.</Text>}
                    ListFooterComponent={
                        isLoadingMore ? <ActivityIndicator color={colors.accent} style={styles.footerLoader} /> : null
                    }
                    renderItem={({ item }) => (
                        <ActivityCard
                            username={username}
                            item={item}
                            onOpenSong={() => navigation.navigate("SongDetail", { song: item.song as never })}
                            onOpenLikers={(ratingEventId) => navigation.navigate("ActivityLikers", { ratingEventId })}
                        />
                    )}
                />
            )}
        </View>
    )
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: {
        paddingTop: 60,
        paddingHorizontal: 18,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
    },
    backButton: { paddingVertical: 6, marginBottom: 8, alignSelf: "flex-start" },
    backText: { fontFamily: fonts.mono, color: colors.ink, fontSize: 14, letterSpacing: 0.4 },
    heading: { fontFamily: fonts.serif, color: colors.ink, fontSize: 24, lineHeight: 28 },
    loader: { marginTop: 48 },
    error: { color: colors.danger, fontSize: 14, textAlign: "center", margin: 24 },
    list: { paddingTop: 12, paddingBottom: 32 },
    empty: { color: colors.inkSoft, fontSize: 14, textAlign: "center", marginTop: 48 },
    footerLoader: { marginVertical: 18 },
})
