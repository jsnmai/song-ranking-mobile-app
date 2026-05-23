// Feed tab — shows rating activity from users the current user follows.
import { useCallback, useState } from "react"
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { FlashList } from "@shopify/flash-list"
import { CompositeNavigationProp, useFocusEffect, useNavigation } from "@react-navigation/native"
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"

import { ApiError } from "../../api/client"
import DiamondScore from "../../components/DiamondScore"
import ScoreArc from "../../components/ScoreArc"
import StarAvatar from "../../components/StarAvatar"
import { AppStackParamList, TabParamList } from "../../navigation/types"
import { colors, fonts, bucketColor } from "../../theme"
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

const DAY_ABBRS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]
const FEED_ORBIT_COUNT = 6
const FEED_DIAL_SIZE = 300
const FEED_DIAL_RADIUS = 108
const FEED_STAR_SIZE = 52
const CENTER_TEXT_W = 100

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

    const renderListHeader = () => {
        const today = new Date()
        const todayStr = today.toDateString()
        const dayAbbr = DAY_ABBRS[today.getDay()]
        const todayCount = events.filter(e => new Date(e.created_at).toDateString() === todayStr).length

        // Deduplicate by user_id — first occurrence = most recent event = most recent bucket color.
        const uniqueActors: Array<{ user_id: number; username: string; display_name: string; bucket: string }> = []
        for (const e of events) {
            if (!uniqueActors.find(a => a.user_id === e.actor_profile.user_id)) {
                uniqueActors.push({
                    user_id: e.actor_profile.user_id,
                    username: e.actor_profile.username,
                    display_name: e.actor_profile.display_name,
                    bucket: e.new_bucket,
                })
            }
        }
        const orbitActors = uniqueActors.slice(0, FEED_ORBIT_COUNT)
        const n = orbitActors.length

        return (
            <View>
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        <Text style={styles.kicker}>TODAY · {dayAbbr}</Text>
                        <Text style={styles.heading}>In your circle</Text>
                    </View>
                </View>

                {n > 0 && (
                    <View style={styles.orbitWrapper}>
                        {orbitActors.map((actor, i) => {
                            const angleDeg = n === 1 ? -90 : -90 + i * (360 / n)
                            const angleRad = (angleDeg * Math.PI) / 180
                            const orbitX = FEED_DIAL_SIZE / 2 + FEED_DIAL_RADIUS * Math.cos(angleRad)
                            const orbitY = FEED_DIAL_SIZE / 2 + FEED_DIAL_RADIUS * Math.sin(angleRad)
                            const nameSrc = actor.display_name || actor.username
                            const initial = nameSrc[0].toUpperCase()
                            const accent = bucketColor(actor.bucket)

                            return (
                                <View
                                    key={actor.user_id}
                                    style={[
                                        styles.orbitStar,
                                        {
                                            left: orbitX,
                                            top: orbitY,
                                            transform: [
                                                { translateX: -FEED_STAR_SIZE / 2 },
                                                { translateY: -FEED_STAR_SIZE / 2 },
                                            ],
                                        },
                                    ]}
                                >
                                    <StarAvatar initial={initial} outerColor={accent} size={FEED_STAR_SIZE} />
                                </View>
                            )
                        })}

                        <View style={styles.orbitCenter}>
                            <Text style={styles.centerLabel}>RATINGS</Text>
                            <Text style={styles.centerCount}>{todayCount}</Text>
                            <Text style={styles.centerLabel}>TODAY</Text>
                        </View>
                    </View>
                )}

                {events.length > 0 && (
                    <View style={styles.separator}>
                        <Text style={styles.separatorText}>ACTIVITY</Text>
                    </View>
                )}
            </View>
        )
    }

    const renderFeedEvent = ({ item }: { item: FeedEvent }) => {
        const accent = bucketColor(item.new_bucket)
        const nameSrc = item.actor_profile.display_name || item.actor_profile.username
        const initial = nameSrc[0].toUpperCase()
        const displayName = item.actor_profile.display_name || `@${item.actor_profile.username}`
        const actionLabel = _eventLabel(item.event_type)

        return (
            <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.song.title} details`}
                testID={`feed-row-${item.id}`}
                style={styles.card}
                onPress={() => handleFeedPress(item)}
                activeOpacity={0.9}
                disabled={openingEventId !== null}
            >
                <View style={styles.actorRow}>
                    <StarAvatar initial={initial} outerColor={accent} size={36} />
                    <View style={styles.actorText}>
                        <Text style={styles.actorName}>{displayName}</Text>
                        <View style={styles.actorMetaRow}>
                            <Text style={styles.actorAction}>{actionLabel} · </Text>
                            <Text style={styles.actorTimestamp}>{formatRelativeTime(item.created_at)}</Text>
                        </View>
                    </View>
                    <Text style={styles.dots}>···</Text>
                </View>

                <View style={styles.songRow}>
                    <View style={styles.coverFrame}>
                        {item.song.cover_url ? (
                            <Image source={{ uri: item.song.cover_url }} style={styles.coverImage} />
                        ) : null}
                    </View>
                    <View style={styles.songText}>
                        <Text style={styles.songTitle} numberOfLines={2}>{item.song.title}</Text>
                        <Text style={styles.songArtist} numberOfLines={1}>{item.song.artist}</Text>
                    </View>
                    <View style={styles.scoreCol}>
                        <DiamondScore score={item.new_score} total={5} size={7} color={accent} />
                        <ScoreArc
                            score={item.new_score}
                            max={10}
                            size={64}
                            strokeWidth={5}
                            color={accent}
                            trackColor={colors.sand}
                        >
                            <Text style={[styles.arcScore, { color: accent }]}>
                                {item.new_score.toFixed(1)}
                            </Text>
                        </ScoreArc>
                    </View>
                </View>

                {openingEventId === item.id && (
                    <ActivityIndicator color={colors.clay} style={styles.cardSpinner} />
                )}
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
            loadFeed(null, true)
        }, [loadFeed]),
    )

    if (isLoading && events.length === 0) {
        return (
            <View style={styles.centerState}>
                <ActivityIndicator color={colors.clay} />
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
            {error !== null && <Text style={styles.inlineError}>{error}</Text>}
            <FlashList
                data={events}
                renderItem={renderFeedEvent}
                keyExtractor={(item) => item.id.toString()}
                onEndReached={handleLoadMore}
                onEndReachedThreshold={0.6}
                ListHeaderComponent={renderListHeader()}
                ListFooterComponent={renderFooter}
                maintainVisibleContentPosition={{ disabled: true }}
                contentContainerStyle={styles.listContent}
            />
        </View>
    )
}

function _eventLabel(eventType: FeedEvent["event_type"]): string {
    if (eventType === "rerated") return "RERATED"
    if (eventType === "reordered") return "RERANKED"
    return "RATED"
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
    inlineError: {
        color: colors.dislike,
        fontSize: 14,
        paddingHorizontal: 18,
        paddingTop: 8,
    },
    header: {
        paddingTop: 60,
        paddingHorizontal: 18,
        paddingBottom: 8,
        backgroundColor: colors.bg,
    },
    headerLeft: {
        flex: 1,
    },
    kicker: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 10,
        letterSpacing: 1.8,
        marginBottom: 4,
    },
    heading: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 38,
        lineHeight: 42,
    },
    orbitWrapper: {
        width: FEED_DIAL_SIZE,
        height: FEED_DIAL_SIZE,
        alignSelf: "center",
        position: "relative",
    },
    orbitStar: {
        position: "absolute",
    },
    orbitCenter: {
        position: "absolute",
        left: FEED_DIAL_SIZE / 2,
        top: FEED_DIAL_SIZE / 2,
        width: CENTER_TEXT_W,
        alignItems: "center",
        transform: [
            { translateX: -CENTER_TEXT_W / 2 },
            { translateY: -42 },
        ],
    },
    centerLabel: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 9,
        letterSpacing: 2,
        marginTop: 2,
    },
    centerCount: {
        fontFamily: fonts.serif,
        color: colors.like,
        fontSize: 52,
        lineHeight: 56,
    },
    separator: {
        paddingHorizontal: 22,
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: colors.line,
        marginTop: 4,
    },
    separatorText: {
        fontFamily: fonts.mono,
        fontSize: 10,
        color: colors.inkSoft,
        letterSpacing: 1.8,
    },
    card: {
        backgroundColor: colors.paper,
        borderRadius: 14,
        marginHorizontal: 16,
        marginVertical: 5,
        padding: 14,
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    actorRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginBottom: 12,
    },
    actorText: {
        flex: 1,
        minWidth: 0,
    },
    actorName: {
        color: colors.ink,
        fontWeight: "600",
        fontSize: 14,
        lineHeight: 18,
    },
    actorMetaRow: {
        flexDirection: "row",
        alignItems: "center",
    },
    actorAction: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 10,
        letterSpacing: 0.4,
    },
    actorTimestamp: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 10,
    },
    dots: {
        color: colors.inkDim,
        fontSize: 20,
        letterSpacing: -2,
        paddingHorizontal: 2,
    },
    songRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    coverFrame: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: colors.sand,
        overflow: "hidden",
        flexShrink: 0,
    },
    coverImage: {
        width: "100%",
        height: "100%",
    },
    songText: {
        flex: 1,
        minWidth: 0,
    },
    songTitle: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 20,
        lineHeight: 24,
        marginBottom: 3,
    },
    songArtist: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 12,
    },
    scoreCol: {
        alignItems: "center",
        gap: 6,
        flexShrink: 0,
    },
    arcScore: {
        fontFamily: fonts.serif,
        fontSize: 18,
        lineHeight: 20,
    },
    cardSpinner: {
        marginTop: 10,
        alignSelf: "center",
    },
    listContent: {
        paddingBottom: 24,
    },
    emptyTitle: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 20,
        marginBottom: 8,
    },
    emptyText: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 13,
        textAlign: "center",
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
    footerSpinner: {
        marginVertical: 18,
    },
})
