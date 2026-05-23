// Full-list reorder screen for Phase 7.
// Uses PanResponder and React Native Animated — Reanimated worklets crash Expo Go with SIGABRT.
import { useCallback, useEffect, useRef, useState } from "react"
import {
    ActivityIndicator,
    Animated,
    Image,
    PanResponder,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native"
import { NativeStackScreenProps } from "@react-navigation/native-stack"

import { ApiError } from "../../api/client"
import BucketBadge from "../../components/BucketBadge"
import { AppStackParamList } from "../../navigation/types"
import { colors, fonts } from "../../theme"
import { useAuth } from "../auth/AuthContext"
import { BucketName, RankingResponse } from "../comparison/types"
import { listMyRankings, reorderRankings } from "./apiRequests"

type ReorderScreenProps = NativeStackScreenProps<AppStackParamList, "Reorder">
type DraftRanking = RankingResponse & {
    draftBucket: BucketName;
}
type DragPreview = {
    songId: number;
    startIndex: number;
    targetIndex: number;
    draftBucket: BucketName;
}

const ROW_HEIGHT = 82

export default function ReorderScreen({ navigation }: ReorderScreenProps) {
    const { token } = useAuth()
    const [rankings, setRankings] = useState<DraftRanking[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [dragPreview, setDragPreview] = useState<DragPreview | null>(null)

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
            setError(extractErrorMessage(err, "Could not load rankings."))
        } finally {
            setIsLoading(false)
        }
    }, [token])

    const handleDragPreview = useCallback((
        songId: number,
        startIndex: number,
        targetIndex: number,
    ) => {
        setDragPreview((currentPreview) => {
            const preview = previewDragMove(
                rankings,
                songId,
                startIndex,
                targetIndex,
            )
            if (preview === null) {
                return currentPreview
            }
            if (
                currentPreview
                && currentPreview.songId === preview.songId
                && currentPreview.startIndex === preview.startIndex
                && currentPreview.targetIndex === preview.targetIndex
                && currentPreview.draftBucket === preview.draftBucket
            ) {
                return currentPreview
            }
            return preview
        })
    }, [rankings])

    const handleDragEnd = useCallback((
        songId: number,
        targetIndex: number,
    ) => {
        setDragPreview(null)
        setRankings((currentRankings) => applyDragMove(currentRankings, songId, targetIndex))
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
            setError(extractErrorMessage(err, "Could not save reorder."))
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
                <ActivityIndicator color={colors.clay} />
            </View>
        )
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={handleCancel} disabled={isSaving}>
                    <Text style={styles.headerActionCancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.heading}>Reorder</Text>
                <TouchableOpacity onPress={handleSave} disabled={isSaving || rankings.length === 0}>
                    <Text
                        style={[
                            styles.headerActionSave,
                            (isSaving || rankings.length === 0) && styles.headerActionSaveDisabled,
                        ]}
                    >
                        {isSaving ? "Saving..." : "Save"}
                    </Text>
                </TouchableOpacity>
            </View>
            {error !== null && <Text style={styles.errorText}>{error}</Text>}
            <ScrollView contentContainerStyle={styles.listContent} scrollEnabled={dragPreview === null}>
                {rankings.map((ranking, index) => (
                    <ReorderRow
                        key={ranking.id}
                        ranking={ranking}
                        index={index}
                        totalRows={rankings.length}
                        dragPreview={dragPreview}
                        previewBucket={dragPreview?.songId === ranking.song_id ? dragPreview.draftBucket : null}
                        onDragPreview={handleDragPreview}
                        onDragEnd={handleDragEnd}
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
    dragPreview,
    previewBucket,
    onDragPreview,
    onDragEnd,
}: {
    ranking: DraftRanking;
    index: number;
    totalRows: number;
    dragPreview: DragPreview | null;
    previewBucket: BucketName | null;
    onDragPreview: (songId: number, startIndex: number, targetIndex: number) => void;
    onDragEnd: (songId: number, targetIndex: number) => void;
}) {
    const dragStartIndex = useRef(index)
    const latestTargetIndex = useRef(index)

    // translateY tracks this row's live finger offset while it is being dragged
    const translateY = useRef(new Animated.Value(0)).current
    // shiftOffset slides neighboring rows to show where the dragged item will land
    const shiftOffset = useRef(new Animated.Value(0)).current
    // Track the previous dragPreview to detect the transition from active drag to released
    const prevDragPreviewRef = useRef<DragPreview | null>(null)

    // Keep latest prop values in refs so the PanResponder closure never reads stale values
    const indexRef = useRef(index)
    indexRef.current = index
    const totalRowsRef = useRef(totalRows)
    totalRowsRef.current = totalRows
    const onDragPreviewRef = useRef(onDragPreview)
    onDragPreviewRef.current = onDragPreview
    const onDragEndRef = useRef(onDragEnd)
    onDragEndRef.current = onDragEnd

    // PanResponder is created once per component instance via useRef
    const panResponder = useRef(
        PanResponder.create({
            // Always claim the responder — panHandlers are placed on the handle area only
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: () => {
                dragStartIndex.current = indexRef.current
                latestTargetIndex.current = indexRef.current
            },
            onPanResponderMove: (_, gestureState) => {
                translateY.setValue(gestureState.dy)
                const targetIndex = clamp(
                    dragStartIndex.current + Math.round(gestureState.dy / ROW_HEIGHT),
                    0,
                    totalRowsRef.current - 1,
                )
                latestTargetIndex.current = targetIndex
                onDragPreviewRef.current(
                    ranking.song_id,
                    dragStartIndex.current,
                    targetIndex,
                )
            },
            onPanResponderRelease: () => {
                // Reset to 0 before the re-render so the row snaps cleanly to its new list position
                translateY.setValue(0)
                onDragEndRef.current(ranking.song_id, latestTargetIndex.current)
            },
            onPanResponderTerminate: () => {
                translateY.setValue(0)
                onDragEndRef.current(ranking.song_id, latestTargetIndex.current)
            },
        })
    ).current

    const isBeingDragged = dragPreview?.songId === ranking.song_id

    // Slide neighboring rows into position as the drag preview changes.
    // On drag-end (dragPreview goes null) snap immediately instead of springing —
    // the list has already been reordered so a spring from the shifted offset looks wrong.
    useEffect(() => {
        if (isBeingDragged) {
            prevDragPreviewRef.current = dragPreview
            return
        }
        const isDragEnd = prevDragPreviewRef.current !== null && dragPreview === null
        prevDragPreviewRef.current = dragPreview

        if (isDragEnd) {
            shiftOffset.setValue(0)
            return
        }
        const targetOffset = dragPreview === null
            ? 0
            : previewOffsetForRow(dragPreview, ranking.song_id, index)
        Animated.spring(shiftOffset, {
            toValue: targetOffset,
            useNativeDriver: false,
            speed: 20,
            bounciness: 0,
        }).start()
    }, [dragPreview, index, isBeingDragged, ranking.song_id, shiftOffset])

    return (
        <Animated.View
            style={[
                styles.row,
                {
                    zIndex: isBeingDragged ? 2 : 0,
                    transform: [{ translateY: isBeingDragged ? translateY : shiftOffset }],
                },
            ]}
            testID={`reorder-row-${ranking.id}`}
        >
            <View style={styles.coverFrame}>
                {ranking.song.cover_url ? (
                    <Image source={{ uri: ranking.song.cover_url }} style={styles.coverImage} />
                ) : null}
            </View>
            <View style={styles.songText}>
                <Text style={styles.title} numberOfLines={1}>{ranking.song.title}</Text>
                <Text style={styles.artist} numberOfLines={1}>{ranking.song.artist}</Text>
                <BucketBadge bucket={previewBucket ?? ranking.draftBucket} />
            </View>
            {/* panHandlers on the handle area only — touching art or text does not start a drag */}
            <View {...panResponder.panHandlers}>
                <Text style={styles.dragHandle}>≡</Text>
            </View>
        </Animated.View>
    )
}

function previewDragMove(
    rankings: DraftRanking[],
    songId: number,
    startIndex: number,
    targetIndex: number,
): DragPreview | null {
    const fromIndex = rankings.findIndex((ranking) => ranking.song_id === songId)
    if (fromIndex === -1) {
        return null
    }

    const movedRanking = rankings[fromIndex]
    const remainingRankings = rankings.filter((ranking) => ranking.song_id !== songId)
    const insertIndex = clamp(targetIndex, 0, remainingRankings.length)
    return {
        songId,
        startIndex,
        targetIndex,
        draftBucket: determineBucketFromNeighbor(
            remainingRankings,
            insertIndex,
            movedRanking.draftBucket,
        ),
    }
}

function previewOffsetForRow(
    dragPreview: DragPreview,
    songId: number,
    rowIndex: number,
): number {
    if (songId === dragPreview.songId || dragPreview.startIndex === dragPreview.targetIndex) {
        return 0
    }
    if (dragPreview.startIndex < dragPreview.targetIndex) {
        if (rowIndex > dragPreview.startIndex && rowIndex <= dragPreview.targetIndex) {
            return -ROW_HEIGHT
        }
        return 0
    }
    if (rowIndex >= dragPreview.targetIndex && rowIndex < dragPreview.startIndex) {
        return ROW_HEIGHT
    }
    return 0
}

function applyDragMove(
    rankings: DraftRanking[],
    songId: number,
    targetIndex: number,
): DraftRanking[] {
    const fromIndex = rankings.findIndex((ranking) => ranking.song_id === songId)
    if (fromIndex === -1 || fromIndex === targetIndex) {
        return rankings
    }

    const movedRanking = rankings[fromIndex]
    const remainingRankings = rankings.filter((ranking) => ranking.song_id !== songId)
    const insertIndex = clamp(targetIndex, 0, remainingRankings.length)
    const draftBucket = determineBucketFromNeighbor(
        remainingRankings,
        insertIndex,
        movedRanking.draftBucket,
    )
    return [
        ...remainingRankings.slice(0, insertIndex),
        {
            ...movedRanking,
            draftBucket,
        },
        ...remainingRankings.slice(insertIndex),
    ]
}

const BUCKET_RANK: Record<BucketName, number> = { like: 0, alright: 1, dislike: 2 }

function determineBucketFromNeighbor(
    rankings: DraftRanking[],
    insertIndex: number,
    fallbackBucket: BucketName,
): BucketName {
    const above = insertIndex > 0 ? rankings[insertIndex - 1].draftBucket : null
    const below = insertIndex < rankings.length ? rankings[insertIndex].draftBucket : null

    if (above === null && below === null) {
        return fallbackBucket
    }
    if (above === null) {
        return below!
    }
    if (below === null) {
        return above
    }
    if (above === below) {
        return above
    }
    // At a bucket boundary, prefer whichever neighbor matches the dragged song's current bucket.
    if (above === fallbackBucket) {
        return above
    }
    if (below === fallbackBucket) {
        return below
    }
    // Neither neighbor matches. If the dragged song's bucket sits between the two neighbors
    // in ranking order, the song is being returned to a gap it used to fill — preserve it.
    if (BUCKET_RANK[above] < BUCKET_RANK[fallbackBucket] && BUCKET_RANK[fallbackBucket] < BUCKET_RANK[below]) {
        return fallbackBucket
    }
    // The song is crossing into a genuinely foreign section; take the bucket of the song
    // directly above, consistent with how the list reads top-to-bottom.
    return above
}

function clamp(
    value: number,
    min: number,
    max: number,
): number {
    return Math.min(Math.max(value, min), max)
}

function extractErrorMessage(
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
        backgroundColor: colors.bg,
    },
    centerState: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.bg,
    },
    header: {
        paddingTop: 56,
        paddingHorizontal: 16,
        paddingBottom: 14,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: colors.bg,
    },
    heading: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 22,
        lineHeight: 26,
    },
    headerActionCancel: {
        fontFamily: fonts.mono,
        color: colors.ink,
        fontSize: 15,
    },
    headerActionSave: {
        fontFamily: fonts.mono,
        color: colors.clay,
        fontSize: 15,
    },
    headerActionSaveDisabled: {
        color: colors.inkDim,
    },
    errorText: {
        fontFamily: fonts.mono,
        color: colors.dislike,
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
        borderBottomColor: colors.line,
        backgroundColor: colors.paper,
    },
    coverFrame: {
        width: 56,
        height: 56,
        borderRadius: 28,
        marginRight: 12,
        backgroundColor: colors.sand,
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
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 16,
        lineHeight: 20,
        marginBottom: 3,
    },
    artist: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 14,
        marginBottom: 5,
    },
    dragHandle: {
        fontFamily: fonts.mono,
        color: colors.inkDim,
        fontSize: 28,
        paddingHorizontal: 10,
    },
})
