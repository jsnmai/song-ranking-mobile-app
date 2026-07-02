// The recipient's in-app notifications list (follows + likes), opened from the Feed header bell.
// Tapping the actor avatar/handle opens their profile; tapping a "liked" row's body opens the
// activity card; tapping a "followed" row's body opens the follower's profile.
import { useCallback, useEffect, useState } from "react"
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native"
import { NativeStackScreenProps } from "@react-navigation/native-stack"

import { ApiError } from "../../api/client"
import { FeedStackParamList } from "../../navigation/types"
import { avatarColorFor, colors, fonts } from "../../theme"
import { usePullRefresh } from "../../hooks/usePullRefresh"
import { useAuth } from "../auth/AuthContext"
import { formatRelativeTime } from "../../utils/formatRelativeTime"
import { getNotifications, markNotificationsRead } from "./apiRequests"
import { NotificationItem } from "./types"

type Props = NativeStackScreenProps<FeedStackParamList, "Notifications">

function actorHandle(item: NotificationItem): string {
    return `@${item.actor.username}`
}

function actionText(item: NotificationItem): string {
    if (item.type === "follow") return " started following you"
    if (item.song) return ` liked your rating of ${item.song.title}`
    return " liked your rating"
}

export default function NotificationsScreen({ navigation }: Props) {
    const { token } = useAuth()
    const [items, setItems] = useState<NotificationItem[]>([])
    const [nextCursor, setNextCursor] = useState<string | undefined>(undefined)
    const [isLoading, setIsLoading] = useState(true)
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const fetchPage = useCallback(
        async (cursor?: string) => {
            if (!token) return
            try {
                const data = await getNotifications(token, cursor)
                setItems((prev) => (cursor ? [...prev, ...data.items] : data.items))
                setNextCursor(data.next_cursor ?? undefined)
            } catch (err) {
                setError(err instanceof ApiError ? err.detail : "Failed to load notifications.")
            }
        },
        [token],
    )

    useEffect(() => {
        setIsLoading(true)
        fetchPage().finally(() => setIsLoading(false))
        // Clear the unread badge in the background. The just-loaded rows keep their unread dots
        // for this viewing session; they read as read on the next visit.
        if (token) markNotificationsRead(token).catch(() => {})
    }, [fetchPage, token])

    const loadMore = async () => {
        if (!nextCursor || isLoadingMore) return
        setIsLoadingMore(true)
        await fetchPage(nextCursor)
        setIsLoadingMore(false)
    }

    // Pull-to-refresh: re-fetch the first page (no cursor → replaces the list).
    const { refreshing, onRefresh } = usePullRefresh(fetchPage)

    const openProfile = (item: NotificationItem) => {
        navigation.navigate("OtherProfile", { username: item.actor.username })
    }

    // Body tap: a follow opens the follower's profile; a like opens the activity that was liked.
    const handleBodyPress = (item: NotificationItem) => {
        if (item.type === "like" && item.rating_event_id !== null) {
            navigation.navigate("SingleActivity", { ratingEventId: item.rating_event_id })
            return
        }
        openProfile(item)
    }

    const renderItem = ({ item }: { item: NotificationItem }) => (
        <TouchableOpacity
            style={styles.row}
            onPress={() => handleBodyPress(item)}
            activeOpacity={0.7}
            testID={`notification-${item.id}`}
        >
            <TouchableOpacity
                onPress={() => openProfile(item)}
                activeOpacity={0.8}
                style={[styles.avatar, { backgroundColor: avatarColorFor(item.actor.avatar_color, item.actor.username) }]}
                testID={`notification-actor-${item.id}`}
            >
                <Text style={styles.avatarLetter}>{(item.actor.display_name || item.actor.username).charAt(0).toUpperCase()}</Text>
            </TouchableOpacity>

            <View style={styles.textCol}>
                <Text style={styles.message} numberOfLines={3}>
                    <Text style={styles.handle} onPress={() => openProfile(item)}>{actorHandle(item)}</Text>
                    <Text style={styles.action}>{actionText(item)}</Text>
                </Text>
                <Text style={styles.time}>{formatRelativeTime(item.created_at)}</Text>
            </View>

            {!item.read && <View style={styles.unreadDot} />}
        </TouchableOpacity>
    )

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>
                <Text style={styles.heading}>Notifications</Text>
            </View>

            {isLoading ? (
                <ActivityIndicator color={colors.accent} style={styles.loader} />
            ) : error !== null ? (
                <Text style={styles.error}>{error}</Text>
            ) : (
                <FlatList
                    data={items}
                    keyExtractor={(item) => String(item.id)}
                    contentContainerStyle={styles.list}
                    onEndReached={loadMore}
                    onEndReachedThreshold={0.4}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={colors.inkDim}
                        />
                    }
                    ListEmptyComponent={<Text style={styles.empty}>No notifications yet.</Text>}
                    ListFooterComponent={
                        isLoadingMore ? <ActivityIndicator color={colors.accent} style={styles.footerLoader} /> : null
                    }
                    renderItem={renderItem}
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
    backButton: { paddingVertical: 8, marginBottom: 8, alignSelf: "flex-start" },
    backText: { fontFamily: fonts.mono, color: colors.ink, fontSize: 14 },
    heading: { fontFamily: fonts.serif, color: colors.ink, fontSize: 30, lineHeight: 34 },
    loader: { marginTop: 48 },
    error: { color: colors.danger, fontSize: 14, textAlign: "center", margin: 24 },
    // paddingTop gives the native pull-to-refresh wheel room to shrink back into empty space above
    // the first row instead of grazing it on the way out.
    list: { paddingHorizontal: 14, paddingTop: 24, paddingBottom: 32 },
    empty: { color: colors.inkSoft, fontSize: 14, textAlign: "center", marginTop: 48 },
    footerLoader: { marginVertical: 18 },
    row: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 6,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.line,
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 13,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    avatarLetter: { color: "#fff", fontWeight: "700", fontSize: 17 },
    textCol: { flex: 1, minWidth: 0 },
    message: { fontSize: 14, color: colors.inkSoft, lineHeight: 19 },
    handle: { fontWeight: "700", color: colors.ink },
    action: { color: colors.inkSoft },
    time: {
        fontFamily: fonts.mono,
        fontSize: 10,
        color: colors.inkDim,
        marginTop: 3,
        letterSpacing: 0.3,
    },
    unreadDot: {
        width: 9,
        height: 9,
        borderRadius: 5,
        backgroundColor: colors.accent,
        flexShrink: 0,
    },
})
