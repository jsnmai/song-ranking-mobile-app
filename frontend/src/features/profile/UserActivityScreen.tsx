// "View all" — a paginated list of one user's activity, using the shared feed-style card.
import { useCallback, useEffect, useState } from "react"
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { NativeStackScreenProps } from "@react-navigation/native-stack"

import { ApiError } from "../../api/client"
import { AppStackParamList } from "../../navigation/types"
import { colors, fonts } from "../../theme"
import ActivityLikeButton from "../activity/ActivityLikeButton"
import RatingActivityCard from "../activity/RatingActivityCard"
import { useAuth } from "../auth/AuthContext"
import { useScoresLocked } from "../../hooks/useScoresLocked"
import { formatRelativeTime } from "../../utils/formatRelativeTime"
import { getProfileActivity } from "./apiRequests"
import { RecentRatingItem } from "./types"

type Props = NativeStackScreenProps<AppStackParamList, "UserActivity">

// Deterministic avatar background per user, matching OtherProfile/follow lists.
const AVATAR_COLORS = [colors.accent, colors.sky, colors.plum, colors.mint, colors.gold]
function avatarColor(username: string): string {
    let hash = 0
    for (let i = 0; i < username.length; i++) hash = (hash * 31 + username.charCodeAt(i)) % 997
    return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

export default function UserActivityScreen({ navigation, route }: Props) {
    const { username } = route.params
    const { token, profile } = useAuth()
    // Only the current user's own scores are locked (< 10 rated); other users' stay visible.
    const hideScore = useScoresLocked() && profile?.username === username
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
                        <RatingActivityCard
                            initial={username[0].toUpperCase()}
                            avatarColor={avatarColor(username)}
                            who={`@${username}`}
                            actionLabel="rated"
                            timeAgo={formatRelativeTime(item.created_at)}
                            song={item.song}
                            bucket={item.bucket}
                            score={item.score}
                            hideScore={hideScore}
                            note={item.note}
                            onPress={() => navigation.navigate("SongDetail", { song: item.song as never })}
                            testID={`activity-card-${item.rating_event_id}`}
                        >
                            <ActivityLikeButton
                                ratingEventId={item.rating_event_id}
                                initialLikedByViewer={item.liked_by_viewer}
                                initialLikeCount={item.like_count}
                                onOpenLikers={(ratingEventId) => navigation.navigate("ActivityLikers", { ratingEventId })}
                            />
                        </RatingActivityCard>
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
    list: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 32 },
    empty: { color: colors.inkSoft, fontSize: 14, textAlign: "center", marginTop: 48 },
    footerLoader: { marginVertical: 18 },
})
