// Song Detail shows the current rating state for one ranked song.
import { useState } from "react"
import { Alert, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { NativeStackScreenProps } from "@react-navigation/native-stack"

import { ApiError } from "../../api/client"
import { AppStackParamList } from "../../navigation/types"
import { useAuth } from "../auth/AuthContext"
import { BucketName } from "../comparison/types"
import { removeRating } from "../rankings/apiRequests"

type SongDetailProps = NativeStackScreenProps<AppStackParamList, "SongDetail">

const BUCKET_LABELS: Record<BucketName, string> = {
    like: "Like",
    alright: "Alright",
    dislike: "Dislike",
}

export default function SongDetailScreen({ navigation, route }: SongDetailProps) {
    const { token } = useAuth()
    const { ranking } = route.params
    const [isRemoving, setIsRemoving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleRateAgain = () => {
        navigation.navigate("BucketSelection", { song: ranking.song })
    }

    const handleRemovePress = () => {
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
        if (!token || isRemoving) {
            return
        }

        setIsRemoving(true)
        setError(null)

        try {
            await removeRating(ranking.song_id, token)
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

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.closeText}>x</Text>
                </TouchableOpacity>
            </View>
            <View style={styles.content}>
                <View style={styles.coverFrame}>
                    {ranking.song.cover_url ? (
                        <Image source={{ uri: ranking.song.cover_url }} style={styles.cover} />
                    ) : null}
                </View>
                <Text style={styles.title} numberOfLines={2}>{ranking.song.title}</Text>
                <Text style={styles.artist} numberOfLines={1}>{ranking.song.artist}</Text>
                <Text style={styles.album} numberOfLines={1}>{ranking.song.album}</Text>
                <View style={styles.stats}>
                    <View style={styles.statBlock}>
                        <Text style={styles.statLabel}>Score</Text>
                        <Text style={styles.statValue}>{ranking.score.toFixed(2)}</Text>
                    </View>
                    <View style={styles.statBlock}>
                        <Text style={styles.statLabel}>Bucket</Text>
                        <Text style={styles.statValue}>{BUCKET_LABELS[ranking.bucket]}</Text>
                    </View>
                    <View style={styles.statBlock}>
                        <Text style={styles.statLabel}>Position</Text>
                        <Text style={styles.statValue}>#{ranking.position}</Text>
                    </View>
                </View>
                {error !== null && <Text style={styles.errorText}>{error}</Text>}
            </View>
            <View style={styles.actions}>
                <TouchableOpacity style={styles.primaryButton} onPress={handleRateAgain}>
                    <Text style={styles.primaryButtonText}>Rate Again</Text>
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
        marginBottom: 30,
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
