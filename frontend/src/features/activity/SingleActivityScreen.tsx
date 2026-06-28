// A single activity card, opened from the body of a "liked your rating" notification.
// Reuses the shared feed-style RatingActivityCard so it matches the card the like was on.
import { useCallback, useEffect, useState } from "react"
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { CompositeScreenProps } from "@react-navigation/native"
import { NativeStackScreenProps } from "@react-navigation/native-stack"

import { ApiError } from "../../api/client"
import { AppStackParamList, FeedStackParamList } from "../../navigation/types"
import { avatarColorToken, colors, fonts } from "../../theme"
import { useAuth } from "../auth/AuthContext"
import { useScoresLocked } from "../../hooks/useScoresLocked"
import { formatRelativeTime } from "../../utils/formatRelativeTime"
import { getMyRankingByDeezerId } from "../rankings/apiRequests"
import { RecentRatingItem } from "../profile/types"
import ActivityLikeButton from "./ActivityLikeButton"
import RatingActivityCard from "./RatingActivityCard"
import { getActivityCard } from "./apiRequests"

// Lives in the Feed stack but also pushes SongDetail, which is on the root stack.
type Props = CompositeScreenProps<
    NativeStackScreenProps<FeedStackParamList, "SingleActivity">,
    NativeStackScreenProps<AppStackParamList>
>

export default function SingleActivityScreen({ navigation, route }: Props) {
    const { ratingEventId } = route.params
    const { token, profile } = useAuth()
    // These cards are the viewer's own activity, so own-score locking applies.
    const hideScore = useScoresLocked()
    const [item, setItem] = useState<RecentRatingItem | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async () => {
        if (!token) return
        try {
            setItem(await getActivityCard(ratingEventId, token))
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.status === 404 ? "This activity is no longer available." : err.detail)
            } else {
                setError("Failed to load activity.")
            }
        }
    }, [token, ratingEventId])

    useEffect(() => {
        setIsLoading(true)
        load().finally(() => setIsLoading(false))
    }, [load])

    // Open the song with the viewer's ranking so Song Detail offers Re-rate; fall back to the
    // unrated view if the lookup fails. Mirrors the feed's song-press behavior.
    const handleSongPress = async (song: RecentRatingItem["song"]) => {
        if (!token) return
        try {
            const ranking = await getMyRankingByDeezerId(song.deezer_id, token)
            navigation.navigate("SongDetail", { ranking })
        } catch {
            navigation.navigate("SongDetail", { song: song as never })
        }
    }

    const profileInitial = profile
        ? (profile.display_name || profile.username).charAt(0).toUpperCase()
        : "?"

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>
                <Text style={styles.heading}>Activity</Text>
            </View>

            {isLoading ? (
                <ActivityIndicator color={colors.accent} style={styles.loader} />
            ) : error !== null || item === null ? (
                <Text style={styles.error}>{error ?? "This activity is no longer available."}</Text>
            ) : (
                <View style={styles.cardWrap}>
                    <RatingActivityCard
                        initial={profileInitial}
                        avatarColor={avatarColorToken(profile?.avatar_color, colors.ink)}
                        who="You"
                        actionLabel="rated"
                        timeAgo={formatRelativeTime(item.created_at)}
                        song={item.song}
                        bucket={item.bucket}
                        score={item.score}
                        hideScore={hideScore}
                        note={item.note}
                        onPress={() => handleSongPress(item.song)}
                        testID={`activity-card-${item.rating_event_id}`}
                    >
                        <ActivityLikeButton
                            ratingEventId={item.rating_event_id}
                            initialLikedByViewer={item.liked_by_viewer}
                            initialLikeCount={item.like_count}
                            onOpenLikers={(id) => navigation.navigate("ActivityLikers", { ratingEventId: id })}
                        />
                    </RatingActivityCard>
                </View>
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
    error: { color: colors.inkSoft, fontSize: 14, textAlign: "center", margin: 24 },
    cardWrap: { paddingHorizontal: 14, paddingTop: 14 },
})
