// Full-list reorder screen for Phase 7.
import { useCallback, useEffect, useMemo, useState } from "react"
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { Gesture, GestureDetector } from "react-native-gesture-handler"
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated"
import { NativeStackScreenProps } from "@react-navigation/native-stack"

import { ApiError } from "../../api/client"
import BucketBadge from "../../components/BucketBadge"
import { AppStackParamList } from "../../navigation/types"
import { useAuth } from "../auth/AuthContext"
import { BucketName, RankingResponse } from "../comparison/types"
import { listMyRankings, reorderRankings } from "./apiRequests"

type ReorderScreenProps = NativeStackScreenProps<AppStackParamList, "Reorder">
type DragRanking = RankingResponse & {
    draftBucket: BucketName;
}

const ROW_HEIGHT = 82

export default function ReorderScreen({ navigation }: ReorderScreenProps) {
    const { token } = useAuth()
    const [rankings, setRankings] = useState<DragRanking[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const loadAllRankings = useCallback(async () => {
        if (!token) {
            return
        }

        setIsLoading(true)
        setError(null)
        try {
            const allRankings: RankingResponse[] = []
            let cursor: string | null = null
            do {
                const response = await listMyRankings(token, cursor ?? undefined)
                allRankings.push(...response.rankings)
                cursor = response.next_cursor
            } while (cursor !== null)

            setRankings(
                allRankings.map((ranking) => ({
                    ...ranking,
                    draftBucket: ranking.bucket,
                })),
            )
        } catch (err) {
            setError(errorMessage(err, "Could not load rankings."))
        } finally {
            setIsLoading(false)
        }
    }, [token])

    const handleMove = useCallback((
        songId: number,
        targetIndex: number,
    ) => {
        setRankings((currentRankings) => moveRanking(currentRankings, songId, targetIndex))
    }, [])

    const handleSave = async () => {
        if (!token || isSaving) {
            return
        }

        setIsSaving(true)
        setError(null)
        try {
            await reorderRankings(
                rankings.map((ranking) => ({
                    song_id: ranking.song_id,
                    bucket: ranking.draftBucket,
                })),
                token,
            )
            navigation.goBack()
        } catch (err) {
            setError(errorMessage(err, "Could not save reorder."))
        } finally {
            setIsSaving(false)
        }
    }

    const handleCancel = () => {
        navigation.goBack()
    }

    useEffect(() => {
        loadAllRankings()
    }, [loadAllRankings])

    if (isLoading) {
        return (
            <View style={styles.centerState}>
                <ActivityIndicator color="#fff" />
            </View>
        )
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={handleCancel} disabled={isSaving}>
                    <Text style={styles.headerAction}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.heading}>Reorder</Text>
                <TouchableOpacity onPress={handleSave} disabled={isSaving || rankings.length === 0}>
                    <Text style={styles.headerAction}>{isSaving ? "Saving..." : "Save"}</Text>
                </TouchableOpacity>
            </View>
            {error !== null && <Text style={styles.errorText}>{error}</Text>}
            <ScrollView contentContainerStyle={styles.listContent}>
                {rankings.map((ranking, index) => (
                    <ReorderRow
                        key={ranking.id}
                        ranking={ranking}
                        index={index}
                        totalRows={rankings.length}
                        onMove={handleMove}
                    />
                ))}
            </ScrollView>
        </View>
    )
}

function ReorderRow({
    ranking,
    index,
    totalRows,
    onMove,
}: {
    ranking: DragRanking;
    index: number;
    totalRows: number;
    onMove: (songId: number, targetIndex: number) => void;
}) {
    const translateY = useSharedValue(0)
    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
        zIndex: translateY.value === 0 ? 0 : 2,
    }))

    const gesture = useMemo(() => (
        Gesture.Pan()
            .runOnJS(true)
            .minDistance(4)
            .onUpdate((event) => {
                translateY.value = event.translationY
                const targetIndex = clamp(
                    index + Math.round(event.translationY / ROW_HEIGHT),
                    0,
                    totalRows - 1,
                )
                if (targetIndex !== index) {
                    onMove(ranking.song_id, targetIndex)
                }
            })
            .onFinalize(() => {
                translateY.value = withSpring(0)
            })
    ), [index, onMove, ranking.song_id, totalRows, translateY])

    return (
        <GestureDetector gesture={gesture}>
            <Animated.View style={[styles.row, animatedStyle]} testID={`reorder-row-${ranking.id}`}>
                <View style={styles.coverFrame}>
                    {ranking.song.cover_url ? (
                        <Image source={{ uri: ranking.song.cover_url }} style={styles.coverImage} />
                    ) : null}
                </View>
                <View style={styles.songText}>
                    <Text style={styles.title} numberOfLines={1}>{ranking.song.title}</Text>
                    <Text style={styles.artist} numberOfLines={1}>{ranking.song.artist}</Text>
                    <BucketBadge bucket={ranking.draftBucket} />
                </View>
                <Text style={styles.dragHandle}>≡</Text>
            </Animated.View>
        </GestureDetector>
    )
}

function moveRanking(
    rankings: DragRanking[],
    songId: number,
    targetIndex: number,
): DragRanking[] {
    const fromIndex = rankings.findIndex((ranking) => ranking.song_id === songId)
    if (fromIndex === -1 || fromIndex === targetIndex) {
        return rankings
    }

    const movedRanking = rankings[fromIndex]
    const remainingRankings = rankings.filter((ranking) => ranking.song_id !== songId)
    const insertIndex = clamp(targetIndex, 0, remainingRankings.length)
    const draftBucket = bucketForInsert(remainingRankings, insertIndex, movedRanking.draftBucket)
    return [
        ...remainingRankings.slice(0, insertIndex),
        {
            ...movedRanking,
            draftBucket,
        },
        ...remainingRankings.slice(insertIndex),
    ]
}

function bucketForInsert(
    rankings: DragRanking[],
    insertIndex: number,
    fallbackBucket: BucketName,
): BucketName {
    if (insertIndex > 0) {
        return rankings[insertIndex - 1].draftBucket
    }
    if (rankings.length > 0) {
        return rankings[0].draftBucket
    }
    return fallbackBucket
}

function clamp(
    value: number,
    min: number,
    max: number,
): number {
    return Math.min(Math.max(value, min), max)
}

function errorMessage(
    err: unknown,
    fallback: string,
): string {
    if (err instanceof ApiError) {
        return err.detail
    }
    if (err instanceof Error) {
        return err.message
    }
    return fallback
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#000",
    },
    centerState: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#000",
    },
    header: {
        paddingTop: 56,
        paddingHorizontal: 16,
        paddingBottom: 14,
        borderBottomWidth: 1,
        borderBottomColor: "#1f1f1f",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    heading: {
        color: "#fff",
        fontSize: 22,
        fontWeight: "800",
    },
    headerAction: {
        color: "#fff",
        fontSize: 15,
        fontWeight: "700",
    },
    errorText: {
        color: "#ff6b6b",
        fontSize: 14,
        paddingHorizontal: 16,
        paddingTop: 12,
    },
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 32,
    },
    row: {
        minHeight: ROW_HEIGHT,
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#1f1f1f",
        backgroundColor: "#000",
    },
    coverFrame: {
        width: 56,
        height: 56,
        borderRadius: 6,
        marginRight: 12,
        backgroundColor: "#1a1a1a",
        overflow: "hidden",
    },
    coverImage: {
        width: "100%",
        height: "100%",
    },
    songText: {
        flex: 1,
        minWidth: 0,
    },
    title: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "700",
        marginBottom: 3,
    },
    artist: {
        color: "#b8b8b8",
        fontSize: 14,
        marginBottom: 5,
    },
    dragHandle: {
        color: "#fff",
        fontSize: 28,
        paddingHorizontal: 10,
    },
})
