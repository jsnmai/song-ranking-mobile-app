// Feed tab — shows rating activity from users the current user follows.
import { useCallback, useState } from "react"
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { FlashList } from "@shopify/flash-list"
import { CompositeNavigationProp, useFocusEffect, useNavigation } from "@react-navigation/native"
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"

import { ApiError } from "../../api/client"
import BucketBadge from "../../components/BucketBadge"
import { AppStackParamList, TabParamList } from "../../navigation/types"
import { formatRelativeTime } from "../../utils/formatRelativeTime"
import { useAuth } from "../auth/AuthContext"
import { RankingResponse } from "../comparison/types"
import { getMyRankingByDeezerId } from "../rankings/apiRequests"
import { listMyFeed } from "./apiRequests"
import { FeedEvent } from "./types"

type FeedNavigation = CompositeNavigationProp<
    BottomTabNavigationProp<TabParamList, "Feed">,
    NativeStackNavigationProp<AppStackParamList>
>

export default function FeedScreen() {
    const navigation = useNavigation<FeedNavigation>()
    const { token } = useAuth()
    const [events, setEvents] = useState<FeedEvent[]>([])
    const [nextCursor, setNextCursor] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const [openingEventId, setOpeningEventId] = useState<number | null>(null)
    const [error, setError] = useState<string | null>(null)

    const loadFeed = useCallback(async (
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
            const response = await listMyFeed(token, cursor ?? undefined)
            if (shouldReplace) {
                setEvents(response.events)
            } else {
                setEvents((currentEvents) => [...currentEvents, ...response.events])
            }
            setNextCursor(response.next_cursor)
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.detail)
            } else if (err instanceof Error) {
                setError(err.message)
            } else {
                setError("Feed is temporarily unavailable.")
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

        loadFeed(nextCursor, false)
    }

    const handleFindUsers = () => {
        navigation.navigate("Discover", {
            focusSearch: true,
            searchMode: "users",
        })
    }

    const handleFeedPress = async (event: FeedEvent) => {
        if (!token || openingEventId !== null) {
            return
        }

        setOpeningEventId(event.id)
        setError(null)

        try {
            const ranking: RankingResponse = await getMyRankingByDeezerId(event.song.deezer_id, token)
            navigation.navigate("SongDetail", { ranking })
        } catch (err) {
            if (err instanceof ApiError && err.status === 404) {
                navigation.navigate("SongDetail", { song: event.song })
                return
            }

            if (err instanceof ApiError) {
                setError(err.detail)
            } else if (err instanceof Error) {
                setError(err.message)
            } else {
                setError("Could not open this song.")
            }
        } finally {
            setOpeningEventId(null)
        }
    }

    const renderFeedEvent = ({ item }: { item: FeedEvent }) => (
        <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.song.title} details`}
            testID={`feed-row-${item.id}`}
            style={styles.eventRow}
            onPress={() => handleFeedPress(item)}
            activeOpacity={0.8}
            disabled={openingEventId !== null}
        >
            <View style={styles.coverFrame}>
                {item.song.cover_url ? (
                    <Image source={{ uri: item.song.cover_url }} style={styles.coverImage} />
                ) : null}
            </View>
            <View style={styles.eventText}>
                <Text style={styles.actor} numberOfLines={1}>@{item.actor_profile.username}</Text>
                <Text style={styles.timestamp} numberOfLines={1}>{formatRelativeTime(item.created_at)}</Text>
                <Text style={styles.title} numberOfLines={1}>{item.song.title}</Text>
                <Text style={styles.artist} numberOfLines={1}>{item.song.artist}</Text>
                <View style={styles.metaRow}>
                    <BucketBadge bucket={item.new_bucket} />
                    <Text style={styles.meta}>{item.new_score.toFixed(2)}</Text>
                    <Text style={styles.meta}>{_eventLabel(item.event_type)}</Text>
                </View>
            </View>
            {openingEventId === item.id && <ActivityIndicator color="#fff" />}
        </TouchableOpacity>
    )

    const renderFooter = () => {
        if (!isLoadingMore) {
            return null
        }

        return <ActivityIndicator color="#fff" style={styles.footerSpinner} />
    }

    useFocusEffect(
        useCallback(() => {
            loadFeed(null, true)
        }, [loadFeed]),
    )

    if (isLoading && events.length === 0) {
        return (
            <View style={styles.centerState}>
                <ActivityIndicator color="#fff" />
            </View>
        )
    }

    if (error !== null && events.length === 0) {
        return (
            <View style={styles.centerState}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={styles.button} onPress={() => loadFeed(null, true)}>
                    <Text style={styles.buttonText}>Try again</Text>
                </TouchableOpacity>
            </View>
        )
    }

    if (events.length === 0) {
        return (
            <View style={styles.centerState}>
                <Text style={styles.emptyTitle}>Your feed is quiet</Text>
                <Text style={styles.emptyText}>Follow people to see what they're rating.</Text>
                <TouchableOpacity style={styles.button} onPress={handleFindUsers}>
                    <Text style={styles.buttonText}>Find users</Text>
                </TouchableOpacity>
            </View>
        )
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.heading}>Feed</Text>
                {error !== null && <Text style={styles.inlineError}>{error}</Text>}
            </View>
            <FlashList
                data={events}
                renderItem={renderFeedEvent}
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

function _eventLabel(eventType: FeedEvent["event_type"]): string {
    if (eventType === "rerated") {
        return "rerated"
    }
    if (eventType === "reordered") {
        return "moved"
    }
    return "rated"
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
    emptyTitle: {
        color: "#fff",
        fontSize: 20,
        fontWeight: "700",
        marginBottom: 8,
    },
    emptyText: {
        color: "#888",
        fontSize: 15,
        textAlign: "center",
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
    eventRow: {
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
    eventText: {
        flex: 1,
        minWidth: 0,
    },
    actor: {
        color: "#888",
        fontSize: 13,
        marginBottom: 2,
    },
    timestamp: {
        color: "#555",
        fontSize: 12,
        marginBottom: 3,
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
    metaRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    meta: {
        color: "#777",
        fontSize: 13,
    },
    footerSpinner: {
        marginVertical: 18,
    },
})
