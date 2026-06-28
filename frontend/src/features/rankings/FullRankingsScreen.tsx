import { useCallback, useMemo, useState } from "react"
import { ActivityIndicator, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { FlashList } from "@shopify/flash-list"
import { CompositeNavigationProp, useFocusEffect } from "@react-navigation/native"
import { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack"
import Svg, { Path } from "react-native-svg"

import { ApiError } from "../../api/client"
import { LockIcon } from "../../components/LockIcon"
import { AppStackParamList, RankingsStackParamList } from "../../navigation/types"
import { bucketColor, colors, fonts, goldMeterShade, meterSegment } from "../../theme"
import { useAuth } from "../auth/AuthContext"
import { BucketName, RankingResponse } from "../comparison/types"
import { listMyRankings } from "./apiRequests"
import { SCORE_UNLOCK_THRESHOLD, useScoresLocked } from "../../hooks/useScoresLocked"

type FullRankingsNavigation = CompositeNavigationProp<
    NativeStackNavigationProp<RankingsStackParamList, "FullRankings">,
    NativeStackNavigationProp<AppStackParamList>
>
type FullRankingsScreenProps = Omit<
    NativeStackScreenProps<RankingsStackParamList, "FullRankings">,
    "navigation"
> & {
    navigation: FullRankingsNavigation;
}
type AlbumOption = {
    key: string;
    album: string;
    artist: string;
    count: number;
}

const BUCKET_FILTERS: readonly { value: BucketName | "all"; label: string }[] = [
    { value: "all", label: "All" },
    { value: "like", label: "Like" },
    { value: "alright", label: "Okay" },
    { value: "dislike", label: "Dislike" },
]

export default function FullRankingsScreen({ navigation }: FullRankingsScreenProps) {
    const { token } = useAuth()
    // Hide the viewer's own scores + positions until they've rated 10 songs.
    const scoresLocked = useScoresLocked()
    const [rankings, setRankings] = useState<RankingResponse[]>([])
    const [bucketFilter, setBucketFilter] = useState<BucketName | "all">("all")
    const [artistFilter, setArtistFilter] = useState<string | null>(null)
    const [albumFilterKey, setAlbumFilterKey] = useState<string | null>(null)
    const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const ratingsToUnlock = Math.max(0, SCORE_UNLOCK_THRESHOLD - rankings.length)

    const artistOptions = useMemo(() => {
        const counts = new Map<string, number>()
        rankings.forEach((ranking) => {
            counts.set(ranking.song.artist, (counts.get(ranking.song.artist) ?? 0) + 1)
        })
        return [...counts.entries()]
            .map(([artist, count]) => ({ artist, count }))
            .sort((left, right) => left.artist.localeCompare(right.artist))
    }, [rankings])

    const albumOptions = useMemo(() => {
        const options = new Map<string, AlbumOption>()
        rankings.forEach((ranking) => {
            const album = ranking.song.album.trim()
            if (!album) {
                return
            }
            const key = `${ranking.song.artist}\u0000${album}`
            const existing = options.get(key)
            options.set(key, {
                key,
                album,
                artist: ranking.song.artist,
                count: (existing?.count ?? 0) + 1,
            })
        })
        return [...options.values()].sort((left, right) => {
            const albumOrder = left.album.localeCompare(right.album)
            return albumOrder !== 0 ? albumOrder : left.artist.localeCompare(right.artist)
        })
    }, [rankings])

    const selectedAlbum = albumOptions.find((option) => option.key === albumFilterKey) ?? null
    const filteredRankings = useMemo(() => rankings.filter((ranking) => {
        if (bucketFilter !== "all" && ranking.bucket !== bucketFilter) {
            return false
        }
        if (artistFilter !== null && ranking.song.artist !== artistFilter) {
            return false
        }
        if (
            selectedAlbum !== null
            && (
                ranking.song.album !== selectedAlbum.album
                || ranking.song.artist !== selectedAlbum.artist
            )
        ) {
            return false
        }
        return true
    }), [artistFilter, bucketFilter, rankings, selectedAlbum])
    const hasDetailFilters = artistFilter !== null || selectedAlbum !== null

    const bucketCounts = useMemo(() => ({
        all: rankings.length,
        like: rankings.filter((r) => r.bucket === "like").length,
        alright: rankings.filter((r) => r.bucket === "alright").length,
        dislike: rankings.filter((r) => r.bucket === "dislike").length,
    }), [rankings])

    const loadRankings = useCallback(async () => {
        if (!token) {
            setIsLoading(false)
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
            setRankings(allRankings)
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.detail)
            } else if (err instanceof Error) {
                setError(err.message)
            } else {
                setError("Rankings are temporarily unavailable.")
            }
        } finally {
            setIsLoading(false)
        }
    }, [token])

    const clearDetailFilters = () => {
        setArtistFilter(null)
        setAlbumFilterKey(null)
    }

    useFocusEffect(
        useCallback(() => {
            loadRankings()
        }, [loadRankings]),
    )

    if (isLoading) {
        return <View style={styles.centerState}><ActivityIndicator color={colors.clay} /></View>
    }

    if (error !== null && rankings.length === 0) {
        return (
            <View style={styles.centerState}>
                <Text style={styles.error}>{error}</Text>
                <TouchableOpacity style={styles.retryButton} onPress={loadRankings}>
                    <Text style={styles.retryText}>Try again</Text>
                </TouchableOpacity>
            </View>
        )
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel="Go back"
                        style={styles.navBtn}
                        onPress={() => navigation.goBack()}
                    >
                        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"
                            stroke={colors.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                            <Path d="M15 18l-6-6 6-6" />
                        </Svg>
                    </TouchableOpacity>
                </View>
                <Text style={styles.heading}>All Rankings</Text>
                <View style={styles.headerRight}>
                    <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel="Open rankings filters"
                        style={[styles.filterBtn, hasDetailFilters && styles.filterBtnActive]}
                        onPress={() => setIsFilterModalOpen(true)}
                    >
                        <Text style={[styles.filterBtnText, hasDetailFilters && styles.filterBtnTextActive]}>
                            Filter
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.bucketTabs}>
                {BUCKET_FILTERS.map((filter) => {
                    const isActive = bucketFilter === filter.value
                    const count = filter.value === "all" ? bucketCounts.all : bucketCounts[filter.value as BucketName]
                    const dotColor = filter.value !== "all" ? bucketColor(filter.value as BucketName) : null
                    return (
                        <TouchableOpacity
                            key={filter.value}
                            accessibilityRole="button"
                            accessibilityLabel={`Filter bucket ${filter.label}`}
                            style={[styles.bucketTab, isActive && styles.bucketTabActive]}
                            onPress={() => setBucketFilter(filter.value)}
                        >
                            {dotColor !== null && !isActive && (
                                <View style={[styles.bucketTabDot, { backgroundColor: dotColor }]} />
                            )}
                            <Text style={[styles.bucketTabLabel, isActive && styles.bucketTabLabelActive]}>
                                {filter.label}
                            </Text>
                            <Text style={[styles.bucketTabCount, isActive && styles.bucketTabCountActive]}>
                                {count}
                            </Text>
                        </TouchableOpacity>
                    )
                })}
            </View>

            {scoresLocked && (
                <View style={styles.lockBanner}>
                    <View style={styles.lockBannerRow}>
                        <View style={styles.lockDot}>
                            <LockIcon color="#fff" size={16} />
                        </View>
                        <View style={styles.lockBannerText}>
                            <Text style={styles.lockBannerTitle}>Order & scores are locked</Text>
                            <Text style={styles.lockBannerSub}>
                                Rate {ratingsToUnlock} more {ratingsToUnlock === 1 ? "song" : "songs"} to reveal where each one lands.
                            </Text>
                        </View>
                        <Text style={styles.lockBannerCount}>{rankings.length}/{SCORE_UNLOCK_THRESHOLD}</Text>
                    </View>
                    <View style={styles.meter}>
                        {Array.from({ length: SCORE_UNLOCK_THRESHOLD }).map((_, i) => (
                            <View
                                key={i}
                                style={[
                                    styles.meterSeg,
                                    // Filled segments climb the shared gold ramp (muted → bright) like the Feed meter.
                                    i < rankings.length && { backgroundColor: goldMeterShade(i, SCORE_UNLOCK_THRESHOLD) },
                                ]}
                            />
                        ))}
                    </View>
                </View>
            )}

            <View style={styles.summary}>
                <Text style={styles.summaryText}>
                    {scoresLocked
                        ? `${filteredRankings.length} RATED · ORDER HIDDEN`
                        : `${filteredRankings.length} ${filteredRankings.length === 1 ? "SONG" : "SONGS"}`}
                </Text>
                <View style={styles.summaryRight}>
                    {/* Reordering is unavailable while order is hidden — show a LOCKED tag
                        instead of the Reorder pill, matching the calibrating design. */}
                    {scoresLocked ? (
                        <View style={styles.lockedTag}>
                            <LockIcon color={colors.inkDim} size={11} />
                            <Text style={styles.lockedTagText}>LOCKED</Text>
                        </View>
                    ) : (
                        <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel="Reorder rankings"
                            style={styles.reorderPill}
                            onPress={() => navigation.navigate("Reorder")}
                        >
                            <Text style={styles.reorderPillText}>REORDER</Text>
                            <Svg width={11} height={11} viewBox="0 0 24 24" fill="none"
                                stroke={colors.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                                <Path d="M3 9l4-4 4 4M7 5v14M21 15l-4 4-4-4M17 19V5" />
                            </Svg>
                        </TouchableOpacity>
                    )}
                    {/* Clear is for the artist/album filters only — the bucket tabs have their
                        own "All" tab, so selecting Like/Okay/Dislike never surfaces Clear. */}
                    {hasDetailFilters && (
                        <TouchableOpacity accessibilityRole="button" onPress={clearDetailFilters}>
                            <Text style={styles.clear}>Clear</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {filteredRankings.length === 0 ? (
                <Text style={styles.empty}>No songs match these filters.</Text>
            ) : (
                <FlashList
                    data={filteredRankings}
                    keyExtractor={(item) => item.id.toString()}
                    contentContainerStyle={styles.listContent}
                    maintainVisibleContentPosition={{ disabled: true }}
                    ListFooterComponent={scoresLocked ? (
                        <Text style={styles.lockFooter}>Your sorted order and scores reveal at 10.</Text>
                    ) : null}
                    renderItem={({ item, index }) => {
                        return (
                            <TouchableOpacity
                                accessibilityRole="button"
                                accessibilityLabel={`Open ${item.song.title} details`}
                                testID={`full-ranking-row-${item.id}`}
                                style={styles.row}
                                onPress={() => navigation.navigate("SongDetail", { ranking: item, origin: "FullRankings" })}
                            >
                                <Text style={[styles.position, scoresLocked && { color: colors.inkDim }]}>
                                    {scoresLocked ? "?" : index + 1}
                                </Text>
                                <View style={styles.coverFrame}>
                                    {item.song.cover_url ? (
                                        <Image source={{ uri: item.song.cover_url }} style={styles.cover} />
                                    ) : null}
                                </View>
                                <View style={styles.songText}>
                                    <Text style={styles.title} numberOfLines={1}>{item.song.title}</Text>
                                    <Text style={styles.artist} numberOfLines={1}>
                                        {item.song.artist} · {item.song.album}
                                    </Text>
                                </View>
                                <View style={styles.scoreGroup}>
                                    {scoresLocked ? (
                                        <>
                                            <View style={styles.scoreLockIcon}>
                                                <LockIcon color={colors.inkDim} size={12} />
                                            </View>
                                            <Text style={[styles.score, { color: colors.inkDim }]}>?</Text>
                                        </>
                                    ) : (
                                        <>
                                            <View style={[styles.bucketDot, { backgroundColor: bucketColor(item.bucket) }]} />
                                            <Text style={[styles.score, { color: bucketColor(item.bucket) }]}>
                                                {item.score.toFixed(1)}
                                            </Text>
                                        </>
                                    )}
                                </View>
                            </TouchableOpacity>
                        )
                    }}
                />
            )}

            <Modal
                visible={isFilterModalOpen}
                transparent
                animationType="fade"
                onRequestClose={() => setIsFilterModalOpen(false)}
            >
                <View style={styles.modalBackdrop}>
                    <View style={styles.modalCard}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Filter Rankings</Text>
                            <TouchableOpacity onPress={() => setIsFilterModalOpen(false)}>
                                <Text style={styles.done}>Done</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView>
                            <Text style={styles.sectionLabel}>ARTIST</Text>
                            <FilterOption
                                label="All artists"
                                isSelected={artistFilter === null}
                                onPress={() => setArtistFilter(null)}
                            />
                            {artistOptions.map((option) => (
                                <FilterOption
                                    key={option.artist}
                                    label={option.artist}
                                    detail={songCountLabel(option.count)}
                                    isSelected={artistFilter === option.artist}
                                    onPress={() => setArtistFilter(option.artist)}
                                />
                            ))}
                            <Text style={styles.sectionLabel}>ALBUM</Text>
                            <FilterOption
                                label="All albums"
                                isSelected={selectedAlbum === null}
                                onPress={() => setAlbumFilterKey(null)}
                            />
                            {albumOptions.map((option) => (
                                <FilterOption
                                    key={option.key}
                                    label={option.album}
                                    detail={`${option.artist} · ${songCountLabel(option.count)}`}
                                    isSelected={selectedAlbum?.key === option.key}
                                    onPress={() => setAlbumFilterKey(option.key)}
                                />
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    )
}

type FilterOptionProps = {
    label: string;
    detail?: string;
    isSelected: boolean;
    onPress: () => void;
}

function FilterOption({ label, detail, isSelected, onPress }: FilterOptionProps) {
    return (
        <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Select filter ${label}`}
            style={[styles.option, isSelected && styles.optionActive]}
            onPress={onPress}
        >
            <View>
                <Text style={styles.optionLabel}>{label}</Text>
                {detail ? <Text style={styles.optionDetail}>{detail}</Text> : null}
            </View>
            {isSelected ? <Text style={styles.check}>✓</Text> : null}
        </TouchableOpacity>
    )
}

function songCountLabel(count: number): string {
    return count === 1 ? "1 song" : `${count} songs`
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    centerState: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.bg,
        paddingHorizontal: 24,
    },
    header: {
        paddingTop: 58,
        paddingHorizontal: 16,
        paddingBottom: 14,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    navBtn: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        alignItems: "center",
        justifyContent: "center",
    },
    navBtnActive: { borderColor: colors.clay },
    headerLeft: { width: 80 },
    headerRight: { width: 80, alignItems: "flex-end" },
    heading: {
        flex: 1,
        textAlign: "center",
        fontFamily: fonts.display,
        color: colors.ink,
        fontSize: 18,
        letterSpacing: -0.3,
    },
    filterBtn: {
        height: 36,
        borderRadius: 10,
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 14,
    },
    filterBtnActive: { borderColor: colors.clay },
    filterBtnText: {
        fontFamily: fonts.mono,
        fontSize: 11,
        color: colors.ink,
        fontWeight: "700",
        letterSpacing: 0.5,
    },
    filterBtnTextActive: { color: colors.clay },
    bucketTabs: {
        flexDirection: "row",
        paddingHorizontal: 14,
        paddingVertical: 10,
        gap: 7,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
    },
    bucketTab: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 999,
        paddingVertical: 8,
        paddingHorizontal: 4,
        backgroundColor: colors.paper,
    },
    bucketTabActive: { borderColor: colors.ink, backgroundColor: colors.ink },
    bucketTabDot: { width: 6, height: 6, borderRadius: 3 },
    bucketTabLabel: { fontFamily: fonts.display, color: colors.inkSoft, fontSize: 10.5 },
    bucketTabLabelActive: { color: "#fff" },
    bucketTabCount: { fontFamily: fonts.mono, color: colors.inkDim, fontSize: 8 },
    bucketTabCountActive: { color: "rgba(255,255,255,0.6)" },
    summary: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 18,
        paddingVertical: 8,
    },
    summaryText: { fontFamily: fonts.mono, color: colors.inkSoft, fontSize: 10 },
    summaryRight: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    reorderPill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 5,
        backgroundColor: colors.paper,
    },
    reorderPillText: {
        fontFamily: fonts.mono,
        fontSize: 9,
        color: colors.ink,
        fontWeight: "700",
        letterSpacing: 0.8,
    },
    clear: { fontFamily: fonts.mono, color: colors.clay, fontSize: 10 },
    lockedTag: { flexDirection: "row", alignItems: "center", gap: 5 },
    lockedTagText: {
        fontFamily: fonts.mono,
        fontSize: 9,
        color: colors.inkDim,
        fontWeight: "700",
        letterSpacing: 0.8,
    },
    listContent: { paddingBottom: 24 },
    row: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 9,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
        backgroundColor: colors.paper,
        gap: 12,
    },
    position: {
        minWidth: 18,
        fontStyle: "italic",
        fontWeight: "700",
        color: "#b8923f",
        fontSize: 17,
        textAlign: "center",
    },
    coverFrame: {
        width: 38,
        height: 38,
        borderRadius: 7,
        overflow: "hidden",
        backgroundColor: colors.paper2,
    },
    cover: { width: "100%", height: "100%" },
    songText: { flex: 1, minWidth: 0 },
    title: { color: colors.ink, fontWeight: "700", fontSize: 13, lineHeight: 16 },
    artist: { fontFamily: fonts.mono, color: colors.inkSoft, fontSize: 7.5, letterSpacing: 1, marginTop: 3 },
    scoreGroup: { flexDirection: "row", alignItems: "center", gap: 5 },
    bucketDot: { width: 6, height: 6, borderRadius: 3 },
    score: { fontFamily: fonts.display, fontSize: 17, letterSpacing: -0.4 },
    scoreLockIcon: { alignItems: "center", justifyContent: "center" },
    lockBanner: {
        marginHorizontal: 14,
        marginTop: 12,
        borderRadius: 16,
        backgroundColor: colors.navy,
        padding: 14,
        overflow: "hidden",
    },
    lockBannerRow: { flexDirection: "row", alignItems: "center", gap: 11 },
    lockDot: {
        width: 33,
        height: 33,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.18)",
        alignItems: "center",
        justifyContent: "center",
    },
    lockBannerText: { flex: 1, minWidth: 0 },
    lockBannerTitle: { fontFamily: fonts.display, fontSize: 14, color: colors.cream },
    lockBannerSub: {
        fontFamily: fonts.sans,
        fontSize: 10.5,
        color: colors.cdim,
        marginTop: 2,
        lineHeight: 14,
    },
    lockBannerCount: {
        fontFamily: fonts.mono,
        fontSize: 10,
        color: colors.gold,
        fontWeight: "700",
        letterSpacing: 1,
    },
    meter: { flexDirection: "row", gap: 4, marginTop: 11 },
    meterSeg: meterSegment,
    lockFooter: {
        fontFamily: fonts.sans,
        fontSize: 11,
        color: colors.inkDim,
        textAlign: "center",
        marginTop: 14,
        paddingHorizontal: 24,
    },
    empty: { color: colors.inkSoft, textAlign: "center", marginTop: 42, fontSize: 14 },
    error: { color: colors.dislike, textAlign: "center", marginBottom: 16 },
    retryButton: { borderWidth: 1, borderColor: colors.ink, borderRadius: 8, padding: 10 },
    retryText: { fontFamily: fonts.mono, color: colors.ink, fontSize: 11 },
    modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(22,20,19,0.35)" },
    modalCard: {
        maxHeight: "78%",
        backgroundColor: colors.bg,
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
        paddingBottom: 28,
    },
    modalHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        padding: 18,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
    },
    modalTitle: { fontFamily: fonts.serif, color: colors.ink, fontSize: 24 },
    done: { fontFamily: fonts.mono, color: colors.clay, fontSize: 11 },
    sectionLabel: {
        fontFamily: fonts.mono,
        color: colors.inkDim,
        fontSize: 9,
        letterSpacing: 1.4,
        paddingHorizontal: 18,
        paddingTop: 18,
        paddingBottom: 7,
    },
    option: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 18,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
    },
    optionActive: { backgroundColor: colors.sand },
    optionLabel: { color: colors.ink, fontSize: 14 },
    optionDetail: { fontFamily: fonts.mono, color: colors.inkSoft, fontSize: 9, marginTop: 3 },
    check: { color: colors.clay, fontSize: 16 },
})
