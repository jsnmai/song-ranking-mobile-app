import { useEffect, useState } from "react"
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { FlashList } from "@shopify/flash-list"
import { NativeStackScreenProps } from "@react-navigation/native-stack"

import { ApiError } from "../../api/client"
import BucketBadge from "../../components/BucketBadge"
import { AppStackParamList } from "../../navigation/types"
import { colors, fonts } from "../../theme"
import { formatRelativeTime } from "../../utils/formatRelativeTime"
import { useAuth } from "../auth/AuthContext"
import { Bookmark } from "../bookmarks/types"
import { getProfileBookmarks } from "./apiRequests"

type UserBookmarksProps = NativeStackScreenProps<AppStackParamList, "UserBookmarks">

export default function UserBookmarksScreen({ navigation, route }: UserBookmarksProps) {
    const { token } = useAuth()
    const { username } = route.params
    const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        async function fetchBookmarks() {
            if (!token) {
                setIsLoading(false)
                return
            }
            setIsLoading(true)
            setError(null)
            try {
                const response = await getProfileBookmarks(username, token)
                setBookmarks(response.bookmarks)
            } catch (err) {
                if (err instanceof ApiError) {
                    setError(err.detail)
                } else if (err instanceof Error) {
                    setError(err.message)
                } else {
                    setError("Could not load bookmarks.")
                }
            } finally {
                setIsLoading(false)
            }
        }
        fetchBookmarks()
    }, [token, username])

    const openSong = (bm: Bookmark) => {
        if (bm.ranking !== null) {
            navigation.navigate("SongDetail", { ranking: bm.ranking })
            return
        }
        navigation.navigate("SongDetail", { song: bm.song })
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>
                <Text style={styles.kicker}>@{username}</Text>
                <Text style={styles.heading}>Bookmarks</Text>
            </View>

            {isLoading ? (
                <ActivityIndicator color={colors.clay} style={styles.status} />
            ) : error !== null ? (
                <Text style={styles.error}>{error}</Text>
            ) : bookmarks.length === 0 ? (
                <Text style={styles.empty}>No Bookmarks yet.</Text>
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
                            testID={`bookmark-item-${item.id}`}
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
        fontSize: 30,
        lineHeight: 34,
    },
    status: {
        marginTop: 42,
    },
    error: {
        color: colors.dislike,
        fontSize: 14,
        marginTop: 42,
        textAlign: "center",
        paddingHorizontal: 24,
    },
    empty: {
        color: colors.inkDim,
        fontSize: 15,
        marginTop: 42,
        textAlign: "center",
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
