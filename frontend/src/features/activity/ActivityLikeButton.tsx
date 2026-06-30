import { useEffect, useState } from "react"
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import Svg, { Path } from "react-native-svg"

import { colors, fonts } from "../../theme"
import { useAuth } from "../auth/AuthContext"
import { likeActivity, unlikeActivity } from "./apiRequests"

type Props = {
    ratingEventId: number;
    initialLikedByViewer: boolean;
    initialLikeCount: number | null;
    onStateChange?: (state: { likedByViewer: boolean; likeCount: number | null }) => void;
    onOpenLikers?: (ratingEventId: number) => void;
    disabled?: boolean;
    compact?: boolean;
}

export default function ActivityLikeButton({
    ratingEventId,
    initialLikedByViewer,
    initialLikeCount,
    onStateChange,
    onOpenLikers,
    disabled = false,
    compact = false,
}: Props) {
    const { token } = useAuth()
    const [likedByViewer, setLikedByViewer] = useState(initialLikedByViewer)
    const [likeCount, setLikeCount] = useState<number | null>(initialLikeCount)
    const [isSaving, setIsSaving] = useState(false)

    useEffect(() => {
        setLikedByViewer(initialLikedByViewer)
        setLikeCount(initialLikeCount)
    }, [initialLikedByViewer, initialLikeCount, ratingEventId])

    const toggleLike = async () => {
        if (!token || disabled || isSaving) {
            return
        }

        const previousLiked = likedByViewer
        const previousCount = likeCount
        const nextLiked = !previousLiked
        const nextCount = previousCount === null
            ? null
            : Math.max(0, previousCount + (nextLiked ? 1 : -1))

        setLikedByViewer(nextLiked)
        setLikeCount(nextCount)
        onStateChange?.({ likedByViewer: nextLiked, likeCount: nextCount })
        setIsSaving(true)

        try {
            const response = nextLiked
                ? await likeActivity(ratingEventId, token)
                : await unlikeActivity(ratingEventId, token)
            setLikedByViewer(response.liked_by_viewer)
            setLikeCount(response.like_count)
            onStateChange?.({
                likedByViewer: response.liked_by_viewer,
                likeCount: response.like_count,
            })
        } catch {
            setLikedByViewer(previousLiked)
            setLikeCount(previousCount)
            onStateChange?.({ likedByViewer: previousLiked, likeCount: previousCount })
        } finally {
            setIsSaving(false)
        }
    }

    const openLikers = () => {
        if (likeCount === null || disabled || onOpenLikers === undefined) {
            return
        }
        onOpenLikers(ratingEventId)
    }

    const countVisible = likeCount !== null
    const label = likedByViewer ? "Unlike activity" : "Like activity"

    return (
        <View style={[styles.wrap, compact && styles.wrapCompact]}>
            <TouchableOpacity
                style={[
                    styles.heartButton,
                    likedByViewer && styles.heartButtonActive,
                    disabled && styles.disabled,
                    compact && styles.heartButtonCompact,
                ]}
                onPress={toggleLike}
                disabled={disabled || isSaving}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected: likedByViewer, disabled: disabled || isSaving }}
                testID={`activity-like-button-${ratingEventId}`}
                activeOpacity={0.75}
            >
                {isSaving ? (
                    <ActivityIndicator size="small" color={likedByViewer ? colors.paper : colors.red} />
                ) : (
                    <Svg width={compact ? 14 : 16} height={compact ? 14 : 16} viewBox="0 0 24 24">
                        <Path
                            d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"
                            fill={likedByViewer ? colors.red : "none"}
                            stroke={likedByViewer ? colors.red : colors.inkSoft}
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </Svg>
                )}
            </TouchableOpacity>
            {countVisible && (
                <TouchableOpacity
                    style={styles.countButton}
                    onPress={openLikers}
                    disabled={disabled || onOpenLikers === undefined}
                    accessibilityRole="button"
                    accessibilityLabel={`${likeCount} likes`}
                    testID={`activity-like-count-${ratingEventId}`}
                    activeOpacity={0.7}
                >
                    <Text style={[styles.countText, compact && styles.countTextCompact]}>
                        {likeCount}
                    </Text>
                </TouchableOpacity>
            )}
        </View>
    )
}

const styles = StyleSheet.create({
    wrap: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
    },
    wrapCompact: {
        gap: 4,
    },
    heartButton: {
        width: 34,
        height: 28,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.paper,
        alignItems: "center",
        justifyContent: "center",
    },
    heartButtonCompact: {
        width: 28,
        height: 24,
        borderRadius: 8,
    },
    heartButtonActive: {
        borderColor: "rgba(224,49,46,0.28)",
        backgroundColor: "rgba(224,49,46,0.10)",
    },
    disabled: {
        opacity: 0.5,
    },
    countButton: {
        minWidth: 24,
        minHeight: 24,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 2,
    },
    countText: {
        fontFamily: fonts.mono,
        fontSize: 10,
        color: colors.inkSoft,
        fontWeight: "700",
    },
    countTextCompact: {
        fontSize: 9,
    },
})
