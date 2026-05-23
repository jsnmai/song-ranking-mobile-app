// Song Detail shows the current rating state for one ranked song.
import { useEffect, useState } from "react"
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { NativeStackScreenProps } from "@react-navigation/native-stack"

import { ApiError } from "../../api/client"
import DiamondScore from "../../components/DiamondScore"
import ScoreArc from "../../components/ScoreArc"
import { useAudioPlayer } from "../../hooks/useAudioPlayer"
import { AppStackParamList } from "../../navigation/types"
import { colors, fonts, bucketColor } from "../../theme"
import { useAuth } from "../auth/AuthContext"
import { removeRating } from "../rankings/apiRequests"
import { fetchPreviewUrl } from "../songs/apiRequests"

type SongDetailProps = NativeStackScreenProps<AppStackParamList, "SongDetail">

const COVER_SIZE = 200
const RING_GAP = 8
const ARC_STROKE_WIDTH = 4
const RING_SIZE = COVER_SIZE + (RING_GAP + ARC_STROKE_WIDTH) * 2

export default function SongDetailScreen({ navigation, route }: SongDetailProps) {
    const { token } = useAuth()
    const isRated = "ranking" in route.params
    const ranking = isRated ? route.params.ranking : null
    const song = isRated ? route.params.ranking.song : route.params.song
    const globalRatingCount = song.global_rating_count ?? 0
    const globalAvgScore = song.global_avg_score ?? null
    const [isRemoving, setIsRemoving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [isPreviewLoading, setIsPreviewLoading] = useState(true)
    const { isPlaying, toggle: toggleAudio, stop: stopAudio } = useAudioPlayer(previewUrl)

    const accent = ranking ? bucketColor(ranking.bucket) : colors.clay

    const handleRateAgain = () => {
        stopAudio()
        navigation.navigate("BucketSelection", { song })
    }

    const handleReorder = () => {
        stopAudio()
        navigation.navigate("Reorder")
    }

    const handleRemovePress = () => {
        if (ranking === null) {
            return
        }

        Alert.alert(
            "Remove this song from your rankings? This cannot be undone.",
            undefined,
            [
                {
                    text: "Cancel",
                    style: "cancel",
                },
                {
                    text: "Remove",
                    style: "destructive",
                    onPress: handleConfirmRemove,
                },
            ],
        )
    }

    const handleConfirmRemove = async () => {
        if (!token || isRemoving || ranking === null) {
            return
        }

        setIsRemoving(true)
        setError(null)

        try {
            await removeRating(ranking.song_id, token)
            stopAudio()
            navigation.navigate("MainTabs", { screen: "Rankings" })
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.detail)
            } else if (err instanceof Error) {
                setError(err.message)
            } else {
                setError("Could not remove this rating.")
            }
        } finally {
            setIsRemoving(false)
        }
    }

    useEffect(() => {
        return navigation.addListener("blur", () => {
            stopAudio()
        })
    }, [navigation, stopAudio])

    useEffect(() => {
        let isActive = true
        setIsPreviewLoading(true)

        if (!isRated) {
            setPreviewUrl(song.preview_url)
            setIsPreviewLoading(false)
            return () => {
                isActive = false
            }
        }

        async function loadPreviewUrl() {
            try {
                const url = await fetchPreviewUrl(song.deezer_id, token ?? "")
                if (isActive) {
                    setPreviewUrl(url)
                }
            } catch {
                // Preview is non-critical — a failed fetch simply hides the button.
                if (isActive) {
                    setPreviewUrl(null)
                }
            } finally {
                if (isActive) {
                    setIsPreviewLoading(false)
                }
            }
        }

        loadPreviewUrl()

        return () => {
            isActive = false
        }
    }, [isRated, song.deezer_id, song.preview_url, token])

    const coverImage = (
        <View style={styles.coverFrame}>
            {song.cover_url ? (
                <Image source={{ uri: song.cover_url }} style={styles.cover} />
            ) : null}
        </View>
    )

    return (
        <View style={styles.container}>
            {/* Header row: back · kicker · spacer */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => {
                        stopAudio()
                        navigation.goBack()
                    }}
                >
                    <Text style={styles.backText}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.headerKicker}>
                    {isRated ? "SONG DETAILS" : ""}
                </Text>
                {/* Spacer mirrors back button width so kicker stays centered. */}
                <View style={styles.headerSpacer} />
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.heroContainer}>
                    {isRated && ranking !== null ? (
                        <ScoreArc
                            score={ranking.score}
                            max={10}
                            size={RING_SIZE}
                            strokeWidth={ARC_STROKE_WIDTH}
                            color={accent}
                            testID="song-detail-score-arc"
                        >
                            {coverImage}
                        </ScoreArc>
                    ) : (
                        coverImage
                    )}
                </View>

                {/* Audio preview */}
                {isPreviewLoading && (
                    <ActivityIndicator style={styles.previewSpinner} color={colors.clay} />
                )}
                {!isPreviewLoading && previewUrl !== null && (
                    <TouchableOpacity style={styles.previewButton} onPress={toggleAudio}>
                        <Text style={styles.previewButtonText}>
                            {isPlaying ? "Pause Preview" : "Play Preview"}
                        </Text>
                    </TouchableOpacity>
                )}

                {/* Title and artist/album */}
                <Text style={styles.title} numberOfLines={2}>{song.title}</Text>
                <Text style={styles.artistAlbum} numberOfLines={1}>
                    {song.artist.toUpperCase()} · {song.album.toUpperCase()}
                </Text>

                {/* Score section — rated songs only */}
                {ranking !== null && (
                    <View style={styles.scoreSection}>
                        <Text style={styles.positionLabel}>
                            POSITION #{ranking.position}
                        </Text>
                        <DiamondScore
                            score={ranking.score}
                            total={10}
                            size={11}
                            color={accent}
                        />
                        <Text style={[styles.scoreNumber, { color: accent }]}>
                            {ranking.score.toFixed(1)}
                        </Text>
                    </View>
                )}

                {/* Global context — shown when at least one community rating exists */}
                {globalRatingCount > 0 && globalAvgScore !== null && (
                    <>
                        <View style={styles.rule}>
                            <View style={styles.ruleLine} />
                            <Text style={styles.ruleText}>IN CONTEXT</Text>
                            <View style={styles.ruleLine} />
                        </View>
                        <View style={styles.globalSection}>
                            <Text style={styles.globalLabel}>GLOBAL AVG</Text>
                            <DiamondScore
                                score={globalAvgScore}
                                total={10}
                                size={8}
                                color={colors.inkDim}
                            />
                            <Text style={styles.aggregates}>
                                {globalRatingCount}{" "}
                                {globalRatingCount === 1 ? "rating" : "ratings"}{" "}
                                · avg {globalAvgScore.toFixed(2)}
                            </Text>
                        </View>
                    </>
                )}

                {error !== null && <Text style={styles.errorText}>{error}</Text>}
            </ScrollView>

            {/* Actions pinned to the bottom */}
            <View style={styles.actions}>
                <TouchableOpacity style={styles.primaryButton} onPress={handleRateAgain}>
                    <Text style={styles.primaryButtonText}>
                        {ranking === null ? "Rate Song" : "Rate Again"}
                    </Text>
                </TouchableOpacity>
                {ranking !== null && (
                    <>
                        <TouchableOpacity style={styles.secondaryButton} onPress={handleReorder}>
                            <Text style={styles.secondaryButtonText}>Reorder</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.removeButton}
                            onPress={handleRemovePress}
                            disabled={isRemoving}
                        >
                            <Text style={styles.removeButtonText}>
                                {isRemoving ? "Removing..." : "Remove Rating"}
                            </Text>
                        </TouchableOpacity>
                    </>
                )}
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.bg,
        paddingBottom: 42,
    },
    header: {
        paddingTop: 54,
        paddingHorizontal: 20,
        paddingBottom: 8,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    backButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.sand,
    },
    backText: {
        color: colors.ink,
        fontSize: 22,
        lineHeight: 26,
    },
    headerKicker: {
        fontFamily: fonts.mono,
        fontSize: 10,
        letterSpacing: 1.8,
        color: colors.inkSoft,
    },
    headerSpacer: {
        width: 36,
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingBottom: 16,
        alignItems: "center",
    },
    heroContainer: {
        paddingTop: 8,
        paddingBottom: 20,
        alignItems: "center",
    },
    coverFrame: {
        width: COVER_SIZE,
        height: COVER_SIZE,
        borderRadius: 10,
        backgroundColor: colors.sand,
        overflow: "hidden",
    },
    cover: {
        width: "100%",
        height: "100%",
    },
    previewSpinner: {
        marginBottom: 18,
    },
    previewButton: {
        height: 36,
        paddingHorizontal: 22,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.paper,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 20,
    },
    previewButtonText: {
        fontFamily: fonts.mono,
        color: colors.ink,
        fontSize: 12,
        letterSpacing: 0.6,
    },
    title: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 24,
        textAlign: "center",
        marginBottom: 8,
        lineHeight: 30,
    },
    artistAlbum: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 10,
        letterSpacing: 1.6,
        textAlign: "center",
        marginBottom: 20,
    },
    scoreSection: {
        alignItems: "center",
        gap: 10,
        marginBottom: 8,
        width: "100%",
    },
    positionLabel: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 9,
        letterSpacing: 2,
    },
    scoreNumber: {
        fontFamily: fonts.mono,
        fontSize: 32,
        lineHeight: 36,
    },
    rule: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        width: "100%",
        marginTop: 20,
        marginBottom: 16,
    },
    ruleLine: {
        flex: 1,
        height: 1,
        backgroundColor: colors.line,
    },
    ruleText: {
        fontFamily: fonts.mono,
        fontSize: 9,
        letterSpacing: 2,
        color: colors.inkSoft,
    },
    globalSection: {
        alignItems: "center",
        gap: 8,
        marginBottom: 8,
    },
    globalLabel: {
        fontFamily: fonts.mono,
        fontSize: 9,
        letterSpacing: 2,
        color: colors.inkSoft,
    },
    aggregates: {
        fontFamily: fonts.mono,
        color: colors.inkDim,
        fontSize: 11,
        letterSpacing: 0.4,
    },
    errorText: {
        color: colors.dislike,
        fontSize: 14,
        marginTop: 18,
        textAlign: "center",
    },
    actions: {
        paddingHorizontal: 20,
        gap: 10,
    },
    primaryButton: {
        height: 52,
        borderRadius: 999,
        backgroundColor: colors.clay,
        alignItems: "center",
        justifyContent: "center",
    },
    primaryButtonText: {
        color: "#fff",
        fontSize: 15,
        fontWeight: "700",
        letterSpacing: 0.4,
    },
    secondaryButton: {
        height: 48,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.paper,
        alignItems: "center",
        justifyContent: "center",
    },
    secondaryButtonText: {
        color: colors.ink,
        fontSize: 14,
        fontWeight: "600",
    },
    removeButton: {
        height: 48,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.line,
        alignItems: "center",
        justifyContent: "center",
    },
    removeButtonText: {
        color: colors.dislike,
        fontSize: 14,
        fontWeight: "600",
    },
})
