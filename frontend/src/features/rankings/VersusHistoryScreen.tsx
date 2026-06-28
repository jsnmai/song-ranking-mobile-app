import { useCallback, useEffect, useState } from "react"
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { FlashList } from "@shopify/flash-list"
import { NativeStackScreenProps } from "@react-navigation/native-stack"

import { ApiError } from "../../api/client"
import BackToTopButton from "../../components/BackToTopButton"
import BucketBadge from "../../components/BucketBadge"
import { useBackToTop } from "../../hooks/useBackToTop"
import { AppStackParamList } from "../../navigation/types"
import { colors, fonts } from "../../theme"
import { formatRelativeTime } from "../../utils/formatRelativeTime"
import { useAuth } from "../auth/AuthContext"
import { listMyVersusHistory } from "./apiRequests"
import { ComparisonHistoryReceipt } from "./types"

type VersusHistoryScreenProps = NativeStackScreenProps<AppStackParamList, "VersusHistory">

export default function VersusHistoryScreen({ navigation }: VersusHistoryScreenProps) {
    const { token } = useAuth()
    const [receipts, setReceipts] = useState<ComparisonHistoryReceipt[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const { listRef, showBackToTop, onScroll, scrollToTop } = useBackToTop()

    const loadHistory = useCallback(async () => {
        if (!token) {
            setIsLoading(false)
            return
        }

        setIsLoading(true)
        setError(null)
        try {
            const response = await listMyVersusHistory(token)
            setReceipts(response.receipts)
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.detail)
            } else if (err instanceof Error) {
                setError(err.message)
            } else {
                setError("Versus History is temporarily unavailable.")
            }
        } finally {
            setIsLoading(false)
        }
    }, [token])

    useEffect(() => {
        loadHistory()
    }, [loadHistory])

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Back to Rankings"
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}
                >
                    <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>
                <Text style={styles.kicker}>YOUR DECISIONS</Text>
                <Text style={styles.heading}>Versus History</Text>
                <Text style={styles.subheading}>Your recent head-to-head comparison receipts.</Text>
            </View>

            {isLoading ? (
                <ActivityIndicator
                    accessibilityLabel="Loading Versus History"
                    color={colors.clay}
                    style={styles.status}
                />
            ) : error !== null ? (
                <View style={styles.centerState}>
                    <Text style={styles.error}>{error}</Text>
                    <TouchableOpacity style={styles.retryButton} onPress={loadHistory}>
                        <Text style={styles.retryText}>Try again</Text>
                    </TouchableOpacity>
                </View>
            ) : receipts.length === 0 ? (
                <Text style={styles.empty}>No comparisons yet.</Text>
            ) : (
                <FlashList
                    ref={listRef as never}
                    data={receipts}
                    renderItem={({ item }) => <ReceiptRow receipt={item} />}
                    keyExtractor={(item) => item.id.toString()}
                    contentContainerStyle={styles.listContent}
                    onScroll={onScroll}
                    scrollEventThrottle={16}
                />
            )}

            <BackToTopButton visible={showBackToTop} onPress={scrollToTop} />
        </View>
    )
}

function ReceiptRow({ receipt }: { receipt: ComparisonHistoryReceipt }) {
    return (
        <View style={styles.receipt}>
            <Text style={styles.result}>
                {receipt.winner_title} beat {receipt.loser_title}
            </Text>
            <View style={styles.songPair}>
                <View style={styles.song}>
                    <Text style={styles.songLabel}>WINNER</Text>
                    <Text style={styles.songTitle} numberOfLines={1}>{receipt.winner_title}</Text>
                    <Text style={styles.artist} numberOfLines={1}>{receipt.winner_artist}</Text>
                </View>
                <Text style={styles.versus}>VS</Text>
                <View style={styles.song}>
                    <Text style={styles.songLabel}>LOSER</Text>
                    <Text style={styles.songTitle} numberOfLines={1}>{receipt.loser_title}</Text>
                    <Text style={styles.artist} numberOfLines={1}>{receipt.loser_artist}</Text>
                </View>
            </View>
            <View style={styles.meta}>
                {receipt.bucket !== null ? <BucketBadge bucket={receipt.bucket} /> : null}
                {receipt.decision_duration_ms !== null ? (
                    <Text style={styles.metaText}>{formatDecisionDuration(receipt.decision_duration_ms)}</Text>
                ) : null}
                <Text style={styles.metaText}>{formatRelativeTime(receipt.finalized_at)}</Text>
            </View>
        </View>
    )
}

export function formatDecisionDuration(durationMs: number): string {
    if (durationMs < 1000) {
        return `${durationMs} ms`
    }
    return `${(durationMs / 1000).toFixed(1)} sec`
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.bg,
    },
    header: {
        paddingTop: 60,
        paddingHorizontal: 18,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
    },
    backButton: {
        alignSelf: "flex-start",
        paddingVertical: 8,
        marginBottom: 8,
    },
    backText: {
        fontFamily: fonts.mono,
        color: colors.ink,
        fontSize: 14,
        letterSpacing: 0.4,
    },
    kicker: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 10,
        letterSpacing: 1.8,
        marginBottom: 4,
    },
    heading: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 30,
        lineHeight: 34,
    },
    subheading: {
        color: colors.inkSoft,
        fontSize: 13,
        lineHeight: 18,
        marginTop: 4,
    },
    status: {
        marginTop: 42,
    },
    centerState: {
        alignItems: "center",
        paddingHorizontal: 24,
        paddingTop: 42,
    },
    error: {
        color: colors.dislike,
        fontSize: 15,
        textAlign: "center",
        marginBottom: 18,
    },
    retryButton: {
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderWidth: 1,
        borderColor: colors.ink,
        borderRadius: 8,
    },
    retryText: {
        color: colors.ink,
        fontFamily: fonts.mono,
        fontSize: 13,
    },
    empty: {
        color: colors.inkDim,
        fontSize: 15,
        marginTop: 42,
        textAlign: "center",
        paddingHorizontal: 24,
    },
    listContent: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 28,
    },
    receipt: {
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
    },
    result: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 17,
        lineHeight: 22,
        marginBottom: 12,
    },
    songPair: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    song: {
        flex: 1,
        minWidth: 0,
    },
    songLabel: {
        fontFamily: fonts.mono,
        color: colors.clay,
        fontSize: 8,
        letterSpacing: 1.2,
        marginBottom: 4,
    },
    songTitle: {
        color: colors.ink,
        fontSize: 14,
        fontWeight: "600",
    },
    artist: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 10,
        marginTop: 3,
    },
    versus: {
        fontFamily: fonts.mono,
        color: colors.inkDim,
        fontSize: 9,
    },
    meta: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginTop: 14,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: colors.line,
    },
    metaText: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 10,
    },
})
