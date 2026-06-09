import { useState } from "react"
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native"

import { ApiError } from "../../api/client"
import { useAudioPlayer } from "../../hooks/useAudioPlayer"
import { colors, fonts } from "../../theme"
import { bookmarkSong, removeBookmark } from "../bookmarks/apiRequests"
import { CoSignItem, FriendsNineItem } from "./types"

type SocialDiscoveryCardProps = {
    item: FriendsNineItem | CoSignItem;
    kind: "co-sign" | "friends-nine";
    token: string;
    onOpen: () => void;
    onRate: () => void;
}

export default function SocialDiscoveryCard({
    item,
    kind,
    token,
    onOpen,
    onRate,
}: SocialDiscoveryCardProps) {
    const [isBookmarked, setIsBookmarked] = useState(item.is_bookmarked)
    const [isBookmarking, setIsBookmarking] = useState(false)
    const [bookmarkError, setBookmarkError] = useState<string | null>(null)
    const { isPlaying, toggle: toggleAudio } = useAudioPlayer(item.song.preview_url)

    const count = kind === "co-sign"
        ? (item as CoSignItem).co_sign_count
        : (item as FriendsNineItem).visible_high_score_friend_count

    const handleBookmark = async () => {
        if (isBookmarking) {
            return
        }
        setIsBookmarking(true)
        setBookmarkError(null)
        try {
            if (isBookmarked) {
                await removeBookmark(item.song.id, token)
                setIsBookmarked(false)
            } else {
                await bookmarkSong(item.song, "discovery", token)
                setIsBookmarked(true)
            }
        } catch (err) {
            if (err instanceof ApiError) {
                setBookmarkError(err.detail)
            } else {
                setBookmarkError("Could not update Bookmarks.")
            }
        } finally {
            setIsBookmarking(false)
        }
    }

    const contributorCopy = kind === "co-sign"
        ? `Co-Signed by ${item.contributors.map((contributor) => contributor.display_name).join(" and ")}`
        : `${item.contributors[0]?.display_name ?? "A friend"} rated this ${item.contributors[0]?.score.toFixed(1) ?? "9+"}`

    return (
        <TouchableOpacity
            style={styles.card}
            onPress={onOpen}
            activeOpacity={0.8}
            accessibilityLabel={`Open ${item.song.title}`}
        >
            <View style={styles.mainRow}>
                <View style={styles.coverFrame}>
                    {item.song.cover_url ? <Image source={{ uri: item.song.cover_url }} style={styles.coverImage} /> : null}
                </View>
                <View style={styles.textColumn}>
                    <Text style={styles.title} numberOfLines={1}>{item.song.title}</Text>
                    <Text style={styles.artist} numberOfLines={1}>{item.song.artist}</Text>
                    <Text style={styles.signal} numberOfLines={2}>
                        {kind === "co-sign" ? `${count} friends rated this 9+` : contributorCopy}
                    </Text>
                    {kind === "co-sign" && <Text style={styles.contributors} numberOfLines={1}>{contributorCopy}</Text>}
                </View>
                <Text style={styles.score}>{item.average_visible_friend_score.toFixed(1)}</Text>
            </View>
            <View style={styles.actions}>
                {item.song.preview_url && (
                    <TouchableOpacity style={styles.actionButton} onPress={toggleAudio}>
                        <Text style={styles.actionText}>{isPlaying ? "Pause" : "Play preview"}</Text>
                    </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.actionButton} onPress={onRate}>
                    <Text style={styles.actionText}>Rate now</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton} onPress={handleBookmark} disabled={isBookmarking}>
                    {isBookmarking
                        ? <ActivityIndicator color={colors.clay} size="small" />
                        : <Text style={styles.actionText}>{isBookmarked ? "Bookmarked" : "Bookmark"}</Text>}
                </TouchableOpacity>
            </View>
            {bookmarkError && <Text style={styles.errorText}>{bookmarkError}</Text>}
        </TouchableOpacity>
    )
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.paper,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.line,
        padding: 12,
        marginBottom: 10,
    },
    mainRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    coverFrame: {
        width: 58,
        height: 58,
        borderRadius: 8,
        backgroundColor: colors.sand,
        overflow: "hidden",
    },
    coverImage: {
        width: "100%",
        height: "100%",
    },
    textColumn: {
        flex: 1,
        minWidth: 0,
    },
    title: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 16,
        lineHeight: 20,
    },
    artist: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 12,
        marginTop: 2,
    },
    signal: {
        color: colors.ink,
        fontSize: 12,
        marginTop: 5,
    },
    contributors: {
        color: colors.inkDim,
        fontSize: 11,
        marginTop: 2,
    },
    score: {
        fontFamily: fonts.mono,
        color: colors.clay,
        fontSize: 16,
    },
    actions: {
        flexDirection: "row",
        gap: 8,
        marginTop: 12,
    },
    actionButton: {
        minHeight: 34,
        justifyContent: "center",
        paddingHorizontal: 10,
        borderRadius: 8,
        backgroundColor: colors.sand,
    },
    actionText: {
        fontFamily: fonts.mono,
        color: colors.ink,
        fontSize: 11,
    },
    errorText: {
        color: colors.dislike,
        fontSize: 11,
        marginTop: 8,
    },
})
