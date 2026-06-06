// Bucket Selection screen — user chooses Like / Okay / Dislike before comparison.
import { useEffect, useState } from "react"
import {
    ActivityIndicator,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native"
import { NativeStackScreenProps } from "@react-navigation/native-stack"

import { ApiError } from "../../api/client"
import { useAudioPlayer } from "../../hooks/useAudioPlayer"
import { AppStackParamList } from "../../navigation/types"
import { colors, fonts, bucketColor } from "../../theme"
import { useAuth } from "../auth/AuthContext"
import { listMyRankings } from "../rankings/apiRequests"
import { finalizeRating, startComparisonSession } from "./apiRequests"
import { BucketName } from "./types"

type BucketSelectionProps = NativeStackScreenProps<AppStackParamList, "BucketSelection">

const BUCKETS: { name: BucketName; label: string; range: string; description: string }[] = [
    { name: "like", label: "Like", range: "7.5–10.0", description: "This belongs near the top." },
    { name: "alright", label: "Okay", range: "5.0–7.4", description: "Good, but not a favorite." },
    { name: "dislike", label: "Dislike", range: "0.0–4.0", description: "Not for you right now." },
]

export default function BucketSelectionScreen({ navigation, route }: BucketSelectionProps) {
    const { token } = useAuth()
    const { song } = route.params
    const [selectedBucket, setSelectedBucket] = useState<BucketName | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [note, setNote] = useState("")
    const [error, setError] = useState<string | null>(null)
    const { isPlaying, toggle: toggleAudio, stop: stopAudio } = useAudioPlayer(song.preview_url)

    useEffect(() => {
        return navigation.addListener("blur", () => {
            stopAudio()
        })
    }, [navigation, stopAudio])

    const handleClose = () => {
        stopAudio()
        navigation.goBack()
    }

    const handleBucketPress = (bucket: BucketName) => {
        if (isSubmitting) {
            return
        }

        setSelectedBucket(bucket)
        setError(null)
    }

    const handleContinue = async () => {
        if (!token || selectedBucket === null || isSubmitting) {
            return
        }

        setIsSubmitting(true)
        setError(null)
        try {
            const requiresComparison = await bucketRequiresComparison(selectedBucket, token)
            const ratingNote = note.trim().length > 0 ? note : undefined
            const ratingRequest = ratingNote === undefined
                ? { song, bucket: selectedBucket }
                : { song, bucket: selectedBucket, note: ratingNote }
            stopAudio()
            if (requiresComparison) {
                const session = await startComparisonSession(
                    ratingRequest,
                    token,
                )
                navigation.replace("ComparisonFlow", { session })
                return
            }

            const result = await finalizeRating(
                ratingRequest,
                token,
            )
            navigation.replace("ScoreReveal", { result })
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.detail)
            } else if (err instanceof Error) {
                setError(err.message)
            } else {
                setError("Could not rate this song.")
            }
        } finally {
            setIsSubmitting(false)
        }
    }

    const bucketRequiresComparison = async (bucket: BucketName, token: string): Promise<boolean> => {
        let cursor: string | undefined

        while (true) {
            const response = await listMyRankings(token, cursor)
            const hasOtherSongInBucket = response.rankings.some((ranking) => {
                return ranking.bucket === bucket && ranking.song.deezer_id !== song.deezer_id
            })
            if (hasOtherSongInBucket) {
                return true
            }

            if (response.next_cursor === null) {
                return false
            }
            cursor = response.next_cursor
        }
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.closeButton}
                    onPress={handleClose}
                    testID="bucket-selection-close"
                >
                    <Text style={styles.closeText}>×</Text>
                </TouchableOpacity>
                <Text style={styles.headerKicker}>YOUR VERDICT</Text>
                <View style={styles.headerSpacer} />
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.previewCard}>
                    <View style={styles.coverFrame}>
                        {song.cover_url ? (
                            <Image source={{ uri: song.cover_url }} style={styles.cover} />
                        ) : null}
                    </View>
                    <Text style={styles.title} numberOfLines={2}>{song.title}</Text>
                    <Text style={styles.artistAlbum} numberOfLines={1}>
                        {song.artist.toUpperCase()} · {song.album.toUpperCase()}
                    </Text>
                    {song.preview_url !== null && (
                        <TouchableOpacity style={styles.previewButton} onPress={toggleAudio}>
                            <Text style={styles.previewButtonText}>
                                {isPlaying ? "Pause Preview" : "Play Preview"}
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>

                <View style={styles.noteBlock}>
                    <View style={styles.noteLabelRow}>
                        <Text style={styles.noteKicker}>ADD A NOTE</Text>
                        <Text style={styles.noteOptional}>Optional</Text>
                    </View>
                    <TextInput
                        value={note}
                        onChangeText={setNote}
                        multiline
                        maxLength={280}
                        editable={!isSubmitting}
                        placeholder="What made this score?"
                        placeholderTextColor={colors.inkSoft}
                        style={styles.noteInput}
                    />
                    <Text style={styles.noteCounter}>{note.length}/280</Text>
                </View>

                <Text style={styles.sectionKicker}>CHOOSE A BUCKET</Text>

                <View style={styles.stampRow}>
                    {BUCKETS.map((bucket) => {
                        const accent = bucketColor(bucket.name)
                        const isSelected = selectedBucket === bucket.name
                        const isDisabled = isSubmitting

                        return (
                            <TouchableOpacity
                                key={bucket.name}
                                style={[
                                    styles.stampCard,
                                    { borderTopColor: accent },
                                    isSelected ? { borderColor: accent } : null,
                                    isDisabled && !isSelected ? styles.stampCardDisabled : null,
                                ]}
                                onPress={() => handleBucketPress(bucket.name)}
                                disabled={isDisabled}
                                testID={`bucket-${bucket.name}`}
                            >
                                <Text style={[styles.stampLabel, { color: accent }]}>{bucket.label}</Text>
                                <Text style={styles.stampRange}>{bucket.range}</Text>
                                <Text style={styles.stampDescription}>{bucket.description}</Text>
                                {isSelected && isSubmitting && (
                                    <ActivityIndicator
                                        style={styles.stampSpinner}
                                        color={accent}
                                    />
                                )}
                            </TouchableOpacity>
                        )
                    })}
                </View>

                {error !== null && <Text style={styles.errorText}>{error}</Text>}

                <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityState={{ disabled: selectedBucket === null || isSubmitting }}
                    style={[
                        styles.continueButton,
                        (selectedBucket === null || isSubmitting) && styles.continueButtonDisabled,
                    ]}
                    onPress={handleContinue}
                    disabled={selectedBucket === null || isSubmitting}
                >
                    <Text style={styles.continueButtonText}>
                        {isSubmitting ? "Working..." : "Continue"}
                    </Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.bg,
    },
    header: {
        paddingTop: 54,
        paddingHorizontal: 20,
        paddingBottom: 8,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    closeButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.sand,
    },
    closeText: {
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
        paddingBottom: 24,
    },
    previewCard: {
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 12,
        paddingHorizontal: 20,
        paddingTop: 24,
        paddingBottom: 20,
        alignItems: "center",
        marginBottom: 24,
    },
    coverFrame: {
        width: 104,
        height: 104,
        borderRadius: 10,
        backgroundColor: colors.sand,
        overflow: "hidden",
        marginBottom: 16,
    },
    cover: {
        width: "100%",
        height: "100%",
    },
    title: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 22,
        textAlign: "center",
        marginBottom: 8,
        lineHeight: 28,
    },
    artistAlbum: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 10,
        letterSpacing: 1.4,
        textAlign: "center",
        marginBottom: 16,
    },
    previewButton: {
        height: 36,
        paddingHorizontal: 22,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.bg,
        alignItems: "center",
        justifyContent: "center",
    },
    previewButtonText: {
        fontFamily: fonts.mono,
        color: colors.ink,
        fontSize: 12,
        letterSpacing: 0.6,
    },
    noteBlock: {
        marginBottom: 22,
    },
    noteLabelRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    noteKicker: {
        fontFamily: fonts.mono,
        fontSize: 9,
        letterSpacing: 2,
        color: colors.inkSoft,
        marginBottom: 10,
    },
    noteOptional: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 10,
        letterSpacing: 0.8,
        marginBottom: 10,
    },
    noteInput: {
        minHeight: 86,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 8,
        backgroundColor: colors.paper,
        color: colors.ink,
        fontSize: 15,
        lineHeight: 20,
        paddingHorizontal: 14,
        paddingVertical: 12,
        textAlignVertical: "top",
    },
    noteCounter: {
        alignSelf: "flex-end",
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 10,
        marginTop: 6,
    },
    sectionKicker: {
        fontFamily: fonts.mono,
        fontSize: 9,
        letterSpacing: 2,
        color: colors.inkSoft,
        textAlign: "center",
        marginBottom: 14,
    },
    stampRow: {
        flexDirection: "row",
        gap: 10,
    },
    stampCard: {
        flex: 1,
        minHeight: 132,
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderTopWidth: 4,
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingTop: 12,
        paddingBottom: 10,
        alignItems: "center",
    },
    stampCardDisabled: {
        opacity: 0.55,
    },
    stampLabel: {
        fontFamily: fonts.serif,
        fontSize: 17,
        lineHeight: 22,
        marginBottom: 4,
        textAlign: "center",
    },
    stampRange: {
        fontFamily: fonts.mono,
        fontSize: 8,
        letterSpacing: 0.8,
        color: colors.inkDim,
        marginBottom: 8,
        textAlign: "center",
    },
    stampDescription: {
        fontFamily: fonts.mono,
        fontSize: 9,
        lineHeight: 12,
        color: colors.inkSoft,
        textAlign: "center",
    },
    stampSpinner: {
        marginTop: 8,
    },
    continueButton: {
        height: 52,
        borderRadius: 999,
        backgroundColor: colors.clay,
        alignItems: "center",
        justifyContent: "center",
        marginTop: 20,
    },
    continueButtonDisabled: {
        backgroundColor: colors.sand,
    },
    continueButtonText: {
        color: "#fff",
        fontSize: 15,
        fontWeight: "700",
        letterSpacing: 0.4,
    },
    errorText: {
        color: colors.dislike,
        fontSize: 14,
        marginTop: 18,
        textAlign: "center",
    },
})
