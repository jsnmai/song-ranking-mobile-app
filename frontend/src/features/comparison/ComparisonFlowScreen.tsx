// Comparison Flow screen — head-to-head binary insertion for one song.
import { useState } from "react"
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { NativeStackScreenProps } from "@react-navigation/native-stack"

import { AppStackParamList } from "../../navigation/types"
import { useAuth } from "../auth/AuthContext"
import { cancelComparisonSession, chooseComparisonWinner, finalizeComparisonSession } from "./apiRequests"
import { ComparisonSessionResponse } from "./types"

type ComparisonFlowProps = NativeStackScreenProps<AppStackParamList, "ComparisonFlow">

export default function ComparisonFlowScreen({ navigation, route }: ComparisonFlowProps) {
    const { token } = useAuth()
    const [session, setSession] = useState<ComparisonSessionResponse>(route.params.session)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleCancel = async () => {
        if (!token || isSubmitting) {
            return
        }

        setIsSubmitting(true)
        try {
            await cancelComparisonSession(session.session_uuid, token)
            navigation.navigate("MainTabs", { screen: "Discover" })
        } catch {
            navigation.navigate("MainTabs", { screen: "Discover" })
        }
    }

    const finalizeReadySession = async (nextSession: ComparisonSessionResponse) => {
        if (!token) {
            return
        }

        const response = await finalizeComparisonSession(nextSession.session_uuid, token)
        navigation.replace("ScoreReveal", { result: response.result })
    }

    const handleChoice = async (winner: "target" | "candidate") => {
        if (!token || isSubmitting || session.candidate === null) {
            return
        }

        setIsSubmitting(true)
        setError(null)

        try {
            const nextSession = await chooseComparisonWinner(session.session_uuid, winner, token)
            if (nextSession.status === "ready_to_finalize") {
                await finalizeReadySession(nextSession)
                return
            }
            setSession(nextSession)
        } catch (err) {
            if (err instanceof Error) {
                setError(err.message)
            } else {
                setError("Could not save comparison.")
            }
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.closeButton} onPress={handleCancel} disabled={isSubmitting}>
                    <Text style={styles.closeText}>x</Text>
                </TouchableOpacity>
                <Text style={styles.counter}>#{session.comparison_count + 1}</Text>
            </View>
            <Text style={styles.prompt}>Pick the one you like more</Text>
            <View style={styles.cards}>
                {session.candidate !== null && (
                    <TouchableOpacity
                        style={styles.songCard}
                        onPress={() => handleChoice("candidate")}
                        disabled={isSubmitting}
                        activeOpacity={0.85}
                    >
                        <SongImage coverUrl={session.candidate.song.cover_url} />
                        <Text style={styles.songTitle} numberOfLines={2}>{session.candidate.song.title}</Text>
                        <Text style={styles.songArtist} numberOfLines={1}>{session.candidate.song.artist}</Text>
                        <Text style={styles.scoreText}>Current {session.candidate.score.toFixed(2)}</Text>
                    </TouchableOpacity>
                )}
                <TouchableOpacity
                    style={[styles.songCard, styles.targetCard]}
                    onPress={() => handleChoice("target")}
                    disabled={isSubmitting}
                    activeOpacity={0.85}
                >
                    <SongImage coverUrl={session.target_song.cover_url} />
                    <Text style={styles.songTitle} numberOfLines={2}>{session.target_song.title}</Text>
                    <Text style={styles.songArtist} numberOfLines={1}>{session.target_song.artist}</Text>
                    <Text style={styles.newText}>New rating</Text>
                </TouchableOpacity>
            </View>
            {isSubmitting && <ActivityIndicator color="#fff" style={styles.loading} />}
            {error !== null && <Text style={styles.errorText}>{error}</Text>}
        </View>
    )
}

function SongImage({ coverUrl }: { coverUrl: string }) {
    if (coverUrl.length === 0) {
        return <View style={styles.coverPlaceholder} />
    }

    return <Image source={{ uri: coverUrl }} style={styles.cover} />
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#000",
        paddingHorizontal: 20,
    },
    header: {
        paddingTop: 54,
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
        backgroundColor: "#1a1a1a",
    },
    closeText: {
        color: "#fff",
        fontSize: 18,
    },
    counter: {
        color: "#777",
        fontSize: 14,
        fontWeight: "700",
    },
    prompt: {
        color: "#fff",
        fontSize: 22,
        fontWeight: "700",
        textAlign: "center",
        marginTop: 24,
        marginBottom: 20,
    },
    cards: {
        flex: 1,
        gap: 14,
    },
    songCard: {
        flex: 1,
        minHeight: 220,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#2a2a2a",
        backgroundColor: "#111",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
    },
    targetCard: {
        borderColor: "#444",
    },
    cover: {
        width: 124,
        height: 124,
        borderRadius: 8,
        marginBottom: 14,
    },
    coverPlaceholder: {
        width: 124,
        height: 124,
        borderRadius: 8,
        marginBottom: 14,
        backgroundColor: "#1d1d1d",
    },
    songTitle: {
        color: "#fff",
        fontSize: 19,
        fontWeight: "700",
        textAlign: "center",
        marginBottom: 5,
    },
    songArtist: {
        color: "#aaa",
        fontSize: 15,
        textAlign: "center",
        marginBottom: 8,
    },
    scoreText: {
        color: "#777",
        fontSize: 13,
    },
    newText: {
        color: "#888",
        fontSize: 13,
        fontWeight: "700",
    },
    loading: {
        marginVertical: 12,
    },
    errorText: {
        color: "#ff6b6b",
        fontSize: 14,
        marginVertical: 12,
        textAlign: "center",
    },
})
