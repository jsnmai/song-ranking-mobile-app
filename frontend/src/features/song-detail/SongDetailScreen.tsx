// Song Detail shows the current rating state for one ranked song.
import { useEffect, useState } from "react"
import { ActivityIndicator, Alert, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { NativeStackScreenProps } from "@react-navigation/native-stack"

import { ApiError } from "../../api/client"
import BucketBadge from "../../components/BucketBadge"
import { useAudioPlayer } from "../../hooks/useAudioPlayer"
import { AppStackParamList } from "../../navigation/types"
import { useAuth } from "../auth/AuthContext"
import { removeRating } from "../rankings/apiRequests"
import { fetchPreviewUrl } from "../songs/apiRequests"

type SongDetailProps = NativeStackScreenProps<AppStackParamList, "SongDetail">

export default function SongDetailScreen({ navigation, route }: SongDetailProps) {
    const { token } = useAuth()
    const isRated = "ranking" in route.params
    const ranking = isRated ? route.params.ranking : null
    const song = isRated ? route.params.ranking.song : route.params.song
    const [isRemoving, setIsRemoving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [isPreviewLoading, setIsPreviewLoading] = useState(true)
    const { isPlaying, toggle: toggleAudio, stop: stopAudio } = useAudioPlayer(previewUrl)

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

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.closeButton}
                    onPress={() => {
                        stopAudio()
                        navigation.goBack()
                    }}
                >
                    <Text style={styles.closeText}>x</Text>
                </TouchableOpacity>
            </View>
            <View style={styles.content}>
                <View style={styles.coverFrame}>
                    {song.cover_url ? (
                        <Image source={{ uri: song.cover_url }} style={styles.cover} />
                    ) : null}
                </View>
                <Text style={styles.title} numberOfLines={2}>{song.title}</Text>
                <Text style={styles.artist} numberOfLines={1}>{song.artist}</Text>
                <Text style={styles.album} numberOfLines={1}>{song.album}</Text>
                {isPreviewLoading && (
                    <ActivityIndicator style={styles.previewSpinner} color="#fff" />
                )}
                {!isPreviewLoading && previewUrl !== null && (
                    <TouchableOpacity style={styles.previewButton} onPress={toggleAudio}>
                        <Text style={styles.previewButtonText}>{isPlaying ? "Pause Preview" : "Play Preview"}</Text>
                    </TouchableOpacity>
                )}
                {ranking !== null && (
                    <View style={styles.stats}>
                        <View style={styles.statBlock}>
                            <Text style={styles.statLabel}>Score</Text>
                            <Text style={styles.statValue}>{ranking.score.toFixed(2)}</Text>
                        </View>
                        <View style={styles.statBlock}>
                            <Text style={styles.statLabel}>Bucket</Text>
                            <BucketBadge bucket={ranking.bucket} />
                        </View>
                        <View style={styles.statBlock}>
                            <Text style={styles.statLabel}>Position</Text>
                            <Text style={styles.statValue}>#{ranking.position}</Text>
                        </View>
                    </View>
                )}
                {error !== null && <Text style={styles.errorText}>{error}</Text>}
            </View>
            <View style={styles.actions}>
                <TouchableOpacity style={styles.primaryButton} onPress={handleRateAgain}>
                    <Text style={styles.primaryButtonText}>{ranking === null ? "Rate Song" : "Rate Again"}</Text>
                </TouchableOpacity>
                {ranking !== null && (
                    <>
                        <TouchableOpacity style={styles.secondaryButton} onPress={handleReorder}>
                            <Text style={styles.secondaryButtonText}>Reorder</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.secondaryButton}
                            onPress={handleRemovePress}
                            disabled={isRemoving}
                        >
                            <Text style={styles.secondaryButtonText}>
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
        backgroundColor: "#000",
        paddingHorizontal: 20,
        paddingBottom: 42,
    },
    header: {
        paddingTop: 54,
        alignItems: "flex-start",
    },
    closeButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#1a1a1a",
    },
    closeText: {
        color: "#fff",
        fontSize: 18,
    },
    content: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    coverFrame: {
        width: 184,
        height: 184,
        borderRadius: 8,
        backgroundColor: "#1a1a1a",
        overflow: "hidden",
        marginBottom: 24,
    },
    cover: {
        width: "100%",
        height: "100%",
    },
    title: {
        color: "#fff",
        fontSize: 26,
        fontWeight: "800",
        textAlign: "center",
        marginBottom: 8,
    },
    artist: {
        color: "#b8b8b8",
        fontSize: 17,
        marginBottom: 4,
    },
    album: {
        color: "#777",
        fontSize: 14,
        marginBottom: 16,
    },
    previewSpinner: {
        marginBottom: 20,
    },
    previewButton: {
        height: 38,
        paddingHorizontal: 20,
        borderRadius: 20,
        backgroundColor: "#fff",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 20,
    },
    previewButtonText: {
        color: "#000",
        fontSize: 14,
        fontWeight: "700",
    },
    stats: {
        width: "100%",
        flexDirection: "row",
        gap: 10,
    },
    statBlock: {
        flex: 1,
        borderWidth: 1,
        borderColor: "#222",
        borderRadius: 8,
        paddingVertical: 14,
        alignItems: "center",
        backgroundColor: "#0d0d0d",
    },
    statLabel: {
        color: "#777",
        fontSize: 12,
        marginBottom: 6,
    },
    statValue: {
        color: "#fff",
        fontSize: 18,
        fontWeight: "800",
    },
    errorText: {
        color: "#ff6b6b",
        fontSize: 14,
        marginTop: 18,
        textAlign: "center",
    },
    actions: {
        gap: 12,
    },
    primaryButton: {
        height: 52,
        borderRadius: 8,
        backgroundColor: "#fff",
        alignItems: "center",
        justifyContent: "center",
    },
    primaryButtonText: {
        color: "#000",
        fontSize: 16,
        fontWeight: "800",
    },
    secondaryButton: {
        height: 52,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#444",
        alignItems: "center",
        justifyContent: "center",
    },
    secondaryButtonText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "700",
    },
})
