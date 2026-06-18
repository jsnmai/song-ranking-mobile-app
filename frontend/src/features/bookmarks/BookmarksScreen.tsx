import { useCallback, useEffect, useState } from "react"
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { FlashList } from "@shopify/flash-list"
import { NativeStackScreenProps } from "@react-navigation/native-stack"
import Svg, { Path } from "react-native-svg"

import { ApiError } from "../../api/client"
import BucketBadge from "../../components/BucketBadge"
import { AppStackParamList } from "../../navigation/types"
import { colors, fonts } from "../../theme"
import { formatRelativeTime } from "../../utils/formatRelativeTime"
import { useAuth } from "../auth/AuthContext"
import { listMyBookmarks } from "./apiRequests"
import { Bookmark } from "./types"

type BookmarksScreenProps = NativeStackScreenProps<AppStackParamList, "Bookmarks">

export default function BookmarksScreen({ navigation }: BookmarksScreenProps) {
    const { token } = useAuth()
    const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const loadBookmarks = useCallback(async () => {
        if (!token) {
            setIsLoading(false)
            return
        }
        setIsLoading(true)
        setError(null)
        try {
            const response = await listMyBookmarks(token)
            setBookmarks(response.bookmarks)
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.detail)
            } else if (err instanceof Error) {
                setError(err.message)
            } else {
                setError("Bookmarks is temporarily unavailable.")
            }
        } finally {
            setIsLoading(false)
        }
    }, [token])

    const openSong = (bm: Bookmark) => {
        if (bm.ranking !== null) {
            navigation.navigate("SongDetail", { ranking: bm.ranking })
            return
        }
        navigation.navigate("SongDetail", { song: bm.song })
    }

    useEffect(() => {
        loadBookmarks()
    }, [loadBookmarks])

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>
                <Text style={styles.heading}>Bookmarks</Text>
            </View>

            {isLoading ? (
                <ActivityIndicator accessibilityLabel="Loading Bookmarks" color={colors.clay} style={styles.status} />
            ) : error !== null ? (
                <View style={styles.centerState}>
                    <Text style={styles.error}>{error}</Text>
                    <TouchableOpacity style={styles.retryButton} onPress={loadBookmarks}>
                        <Text style={styles.retryText}>Try again</Text>
                    </TouchableOpacity>
                </View>
            ) : bookmarks.length === 0 ? (
                <View style={styles.noSavesState}>
                    <View style={styles.noSavesIcon}>
                        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                            <Path
                                d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"
                                stroke={colors.butter}
                                strokeWidth={2}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </Svg>
                    </View>
                    <Text style={styles.noSavesKicker}>NOTHING SAVED YET</Text>
                    <Text style={styles.noSavesTitle}>Park songs for later</Text>
                    <Text style={styles.noSavesBody}>
                        Bookmark any song from its page.
                    </Text>
                    <TouchableOpacity
                        style={styles.noSavesBtn}
                        onPress={() => navigation.navigate("MainTabs", { screen: "Discover" })}
                    >
                        <Text style={styles.noSavesBtnText}>Discover songs</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlashList
                    data={bookmarks}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel={`Open ${item.song.title}`}
                            style={styles.row}
                            onPress={() => openSong(item)}
                            activeOpacity={0.8}
                        >
                            <View style={styles.coverFrame}>
                                {item.song.cover_url ? (
                                    <Image source={{ uri: item.song.cover_url }} style={styles.cover} />
                                ) : null}
                            </View>
                            <View style={styles.songText}>
                                <Text style={styles.title} numberOfLines={1}>{item.song.title}</Text>
                                <Text style={styles.artist} numberOfLines={1}>{item.song.artist}</Text>
                                <Text style={styles.bookmarkedAt}>{formatRelativeTime(item.bookmarked_at)}</Text>
                            </View>
                            {item.ranking !== null ? <BucketBadge bucket={item.ranking.bucket} /> : null}
                        </TouchableOpacity>
                    )}
                    keyExtractor={(item) => item.id.toString()}
                    contentContainerStyle={styles.listContent}
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
        alignSelf: "flex-start",
        paddingVertical: 8,
        marginBottom: 8,
    },
    backText: {
        fontFamily: fonts.mono,
        color: colors.ink,
        fontSize: 14,
    },
    heading: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 30,
        lineHeight: 34,
    },
    status: {
        marginTop: 42,
    },
    centerState: {
        alignItems: "center",
        paddingHorizontal: 24,
        paddingTop: 42,
    },
    error: {
        color: colors.dislike,
        fontSize: 15,
        textAlign: "center",
        marginBottom: 18,
    },
    retryButton: {
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderWidth: 1,
        borderColor: colors.ink,
        borderRadius: 8,
    },
    retryText: {
        fontFamily: fonts.mono,
        color: colors.ink,
        fontSize: 13,
    },
    // ── NoSaves empty state ───────────────────────────────────────────────
    noSavesState: {
        alignItems: "center",
        paddingHorizontal: 32,
        paddingTop: 64,
    },
    noSavesIcon: {
        width: 44,
        height: 44,
        borderRadius: 999,
        backgroundColor: "rgba(245,195,67,0.12)",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 16,
    },
    noSavesKicker: {
        fontFamily: fonts.mono,
        fontSize: 9,
        letterSpacing: 2,
        color: colors.inkDim,
        fontWeight: "700",
        marginBottom: 8,
    },
    noSavesTitle: {
        fontFamily: fonts.display,
        fontSize: 20,
        color: colors.ink,
        letterSpacing: -0.3,
        marginBottom: 8,
        textAlign: "center",
    },
    noSavesBody: {
        fontFamily: fonts.mono,
        fontSize: 13,
        color: colors.inkSoft,
        lineHeight: 19,
        textAlign: "center",
        marginBottom: 24,
    },
    noSavesBtn: {
        backgroundColor: colors.ink,
        borderRadius: 10,
        paddingVertical: 12,
        paddingHorizontal: 24,
        alignItems: "center",
    },
    noSavesBtnText: {
        fontFamily: fonts.display,
        fontSize: 15,
        color: "#fff",
        letterSpacing: -0.2,
    },
    listContent: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 28,
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 12,
        padding: 12,
        marginBottom: 9,
        gap: 12,
    },
    coverFrame: {
        width: 48,
        height: 48,
        borderRadius: 8,
        backgroundColor: colors.sand,
        overflow: "hidden",
    },
    cover: {
        width: "100%",
        height: "100%",
    },
    songText: {
        flex: 1,
        minWidth: 0,
    },
    title: {
        color: colors.ink,
        fontSize: 14,
        fontWeight: "600",
    },
    artist: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 10,
        marginTop: 3,
    },
    bookmarkedAt: {
        fontFamily: fonts.mono,
        color: colors.inkDim,
        fontSize: 9,
        marginTop: 5,
    },
})
