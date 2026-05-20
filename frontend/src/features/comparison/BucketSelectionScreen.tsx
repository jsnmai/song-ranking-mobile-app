// Bucket Selection screen — user chooses Like / Alright / Dislike before comparison.
import { useState } from "react"
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { NativeStackScreenProps } from "@react-navigation/native-stack"

import { AppStackParamList } from "../../navigation/types"
import { useAuth } from "../auth/AuthContext"
import { listMyRankings } from "../rankings/apiRequests"
import { finalizeRating, startComparisonSession } from "./apiRequests"
import { BucketName } from "./types"

type BucketSelectionProps = NativeStackScreenProps<AppStackParamList, "BucketSelection">

const BUCKETS: { name: BucketName; label: string; description: string }[] = [
    { name: "like", label: "Like", description: "This belongs near the top." },
    { name: "alright", label: "Alright", description: "Good, but not a favorite." },
    { name: "dislike", label: "Dislike", description: "Not for you right now." },
]

export default function BucketSelectionScreen({ navigation, route }: BucketSelectionProps) {
    const { token } = useAuth()
    const { song } = route.params
    const [selectedBucket, setSelectedBucket] = useState<BucketName | null>(null)
    const [error, setError] = useState<string | null>(null)

    const handleClose = () => {
        navigation.goBack()
    }

    const handleBucketPress = async (bucket: BucketName) => {
        if (!token || selectedBucket !== null) {
            return
        }

        setSelectedBucket(bucket)
        setError(null)

        try {
            const requiresComparison = await bucketRequiresComparison(bucket, token)
            if (requiresComparison) {
                const session = await startComparisonSession(
                    {
                        song,
                        bucket,
                    },
                    token,
                )
                navigation.replace("ComparisonFlow", { session })
                return
            }

            const result = await finalizeRating(
                {
                    song,
                    bucket,
                },
                token,
            )
            navigation.replace("ScoreReveal", { result })
        } catch (err) {
            if (err instanceof Error) {
                setError(err.message)
            } else {
                setError("Could not rate this song.")
            }
            setSelectedBucket(null)
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
                <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
                    <Text style={styles.closeText}>x</Text>
                </TouchableOpacity>
            </View>
            <View style={styles.songHeader}>
                {song.cover_url ? (
                    <Image source={{ uri: song.cover_url }} style={styles.cover} />
                ) : (
                    <View style={styles.coverPlaceholder} />
                )}
                <Text style={styles.title} numberOfLines={2}>{song.title}</Text>
                <Text style={styles.artist} numberOfLines={1}>{song.artist}</Text>
            </View>
            <View style={styles.bucketList}>
                {BUCKETS.map((bucket) => (
                    <TouchableOpacity
                        key={bucket.name}
                        style={[
                            styles.bucketButton,
                            selectedBucket === bucket.name ? styles.bucketButtonSelected : null,
                        ]}
                        onPress={() => handleBucketPress(bucket.name)}
                        disabled={selectedBucket !== null}
                    >
                        <View>
                            <Text style={styles.bucketLabel}>{bucket.label}</Text>
                            <Text style={styles.bucketDescription}>{bucket.description}</Text>
                        </View>
                        {selectedBucket === bucket.name && <ActivityIndicator color="#fff" />}
                    </TouchableOpacity>
                ))}
            </View>
            {error !== null && <Text style={styles.errorText}>{error}</Text>}
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#000",
        paddingHorizontal: 20,
    },
    header: {
        paddingTop: 54,
        alignItems: "flex-end",
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
    songHeader: {
        alignItems: "center",
        paddingTop: 24,
        paddingBottom: 32,
    },
    cover: {
        width: 144,
        height: 144,
        borderRadius: 8,
        marginBottom: 18,
    },
    coverPlaceholder: {
        width: 144,
        height: 144,
        borderRadius: 8,
        marginBottom: 18,
        backgroundColor: "#1a1a1a",
    },
    title: {
        color: "#fff",
        fontSize: 24,
        fontWeight: "700",
        textAlign: "center",
        marginBottom: 6,
    },
    artist: {
        color: "#aaa",
        fontSize: 16,
    },
    bucketList: {
        gap: 12,
    },
    bucketButton: {
        minHeight: 76,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#2a2a2a",
        backgroundColor: "#111",
        paddingHorizontal: 16,
        paddingVertical: 14,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    bucketButtonSelected: {
        borderColor: "#fff",
    },
    bucketLabel: {
        color: "#fff",
        fontSize: 18,
        fontWeight: "700",
        marginBottom: 4,
    },
    bucketDescription: {
        color: "#888",
        fontSize: 14,
    },
    errorText: {
        color: "#ff6b6b",
        fontSize: 14,
        marginTop: 18,
        textAlign: "center",
    },
})
