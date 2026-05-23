// Comparison Flow screen — head-to-head binary insertion for one song.
import { useEffect, useRef, useState } from "react"
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native"
// ActivityIndicator is kept for the comparison submission spinner (isSubmitting).
import { NativeStackScreenProps } from "@react-navigation/native-stack"

import { ApiError } from "../../api/client"
import { useAudioPlayer } from "../../hooks/useAudioPlayer"
import { AppStackParamList } from "../../navigation/types"
import { colors, fonts } from "../../theme"
import { useAuth } from "../auth/AuthContext"
import { fetchPreviewUrl } from "../songs/apiRequests"
import { cancelComparisonSession, chooseComparisonWinner, finalizeComparisonSession } from "./apiRequests"
import { ComparisonSessionResponse } from "./types"

type ComparisonFlowProps = NativeStackScreenProps<AppStackParamList, "ComparisonFlow">

export default function ComparisonFlowScreen({ navigation, route }: ComparisonFlowProps) {
    const { token } = useAuth()
    const [session, setSession] = useState<ComparisonSessionResponse>(route.params.session)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [candidatePreviewUrl, setCandidatePreviewUrl] = useState<string | null>(null)
    const candidateShownAtRef = useRef<number | null>(null)
    const candidatePlayer = useAudioPlayer(candidatePreviewUrl)
    const targetPlayer = useAudioPlayer(session.target_song.preview_url)

    useEffect(() => {
        return navigation.addListener("blur", () => {
            candidatePlayer.stop()
            targetPlayer.stop()
        })
    }, [navigation, candidatePlayer, targetPlayer])

    const handleCancel = async () => {
        if (!token || isSubmitting) {
            return
        }

        candidatePlayer.stop()
        targetPlayer.stop()
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

        // Stop both previews before advancing — the candidate changes each round.
        candidatePlayer.stop()
        targetPlayer.stop()
        setIsSubmitting(true)
        setError(null)

        try {
            const decisionDurationMs = candidateShownAtRef.current === null
                ? null
                : Math.max(0, Date.now() - candidateShownAtRef.current)
            const nextSession = await chooseComparisonWinner(
                session.session_uuid,
                winner,
                token,
                decisionDurationMs,
            )
            if (nextSession.status === "ready_to_finalize") {
                await finalizeReadySession(nextSession)
                return
            }
            setSession(nextSession)
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.detail)
            } else if (err instanceof Error) {
                setError(err.message)
            } else {
                setError("Could not save comparison.")
            }
        } finally {
            setIsSubmitting(false)
        }
    }

    useEffect(() => {
        const candidate = session.candidate
        if (candidate === null) {
            setCandidatePreviewUrl(null)
            return
        }

        if (!token) {
            setCandidatePreviewUrl(candidate.song.preview_url)
            return
        }

        let isActive = true
        const authToken = token
        const candidateSong = candidate.song
        setCandidatePreviewUrl(null)

        async function loadCandidatePreviewUrl() {
            try {
                const url = await fetchPreviewUrl(candidateSong.deezer_id, authToken)
                if (isActive) {
                    setCandidatePreviewUrl(url)
                }
            } catch {
                if (isActive) {
                    setCandidatePreviewUrl(candidateSong.preview_url)
                }
            }
        }

        loadCandidatePreviewUrl()

        return () => {
            isActive = false
        }
    }, [session.candidate, token])

    useEffect(() => {
        if (session.candidate === null) {
            candidateShownAtRef.current = null
            return
        }

        candidateShownAtRef.current = Date.now()
    }, [session.candidate])

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.closeButton} onPress={handleCancel} disabled={isSubmitting}>
                    <Text style={styles.closeText}>×</Text>
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
                        {candidatePreviewUrl !== null && (
                            <PreviewButton
                                isPlaying={candidatePlayer.isPlaying}
                                onPress={() => {
                                    targetPlayer.stop()
                                    candidatePlayer.toggle()
                                }}
                            />
                        )}
                    </TouchableOpacity>
                )}
                <TouchableOpacity
                    style={styles.songCard}
                    onPress={() => handleChoice("target")}
                    disabled={isSubmitting}
                    activeOpacity={0.85}
                >
                    <SongImage coverUrl={session.target_song.cover_url} />
                    <Text style={styles.songTitle} numberOfLines={2}>{session.target_song.title}</Text>
                    <Text style={styles.songArtist} numberOfLines={1}>{session.target_song.artist}</Text>
                    <Text style={styles.newText}>New rating</Text>
                    {session.target_song.preview_url !== null && (
                        <PreviewButton
                            isPlaying={targetPlayer.isPlaying}
                            onPress={() => {
                                candidatePlayer.stop()
                                targetPlayer.toggle()
                            }}
                        />
                    )}
                </TouchableOpacity>
            </View>
            {isSubmitting && <ActivityIndicator color={colors.clay} style={styles.loading} />}
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

// Tapping the preview button must not bubble up and trigger the card's handleChoice.
function PreviewButton({ isPlaying, onPress }: { isPlaying: boolean; onPress: () => void }) {
    return (
        <TouchableOpacity
            style={styles.previewButton}
            onPress={(e) => {
                // stopPropagation prevents the tap from also firing the parent card's onPress.
                e.stopPropagation()
                onPress()
            }}
            activeOpacity={0.7}
        >
            <Text style={styles.previewButtonText}>{isPlaying ? "Pause" : "Preview"}</Text>
        </TouchableOpacity>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.bg,
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
        backgroundColor: colors.sand,
    },
    closeText: {
        color: colors.ink,
        fontSize: 22,
        lineHeight: 26,
    },
    counter: {
        fontFamily: fonts.mono,
        color: colors.inkDim,
        fontSize: 12,
        letterSpacing: 0.8,
    },
    prompt: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 22,
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
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.paper,
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
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
        backgroundColor: colors.sand,
    },
    songTitle: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 19,
        textAlign: "center",
        marginBottom: 5,
    },
    songArtist: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 11,
        letterSpacing: 1.2,
        textAlign: "center",
        marginBottom: 8,
    },
    scoreText: {
        fontFamily: fonts.mono,
        color: colors.inkDim,
        fontSize: 12,
    },
    newText: {
        fontFamily: fonts.mono,
        color: colors.inkDim,
        fontSize: 12,
    },
    previewButton: {
        marginTop: 10,
        height: 32,
        paddingHorizontal: 16,
        borderRadius: 16,
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
        letterSpacing: 0.4,
    },
    loading: {
        marginVertical: 12,
    },
    errorText: {
        color: colors.dislike,
        fontSize: 14,
        marginVertical: 12,
        textAlign: "center",
    },
})
