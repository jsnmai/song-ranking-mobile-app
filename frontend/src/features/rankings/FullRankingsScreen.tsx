import { useCallback, useMemo, useState } from "react"
import { ActivityIndicator, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { FlashList } from "@shopify/flash-list"
import { CompositeNavigationProp, useFocusEffect } from "@react-navigation/native"
import { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack"

import { ApiError } from "../../api/client"
import DiamondScore from "../../components/DiamondScore"
import ScoreArc from "../../components/ScoreArc"
import { AppStackParamList, RankingsStackParamList } from "../../navigation/types"
import { bucketColor, colors, fonts } from "../../theme"
import { useAuth } from "../auth/AuthContext"
import { BucketName, RankingResponse } from "../comparison/types"
import { listMyRankings } from "./apiRequests"

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
    const [rankings, setRankings] = useState<RankingResponse[]>([])
    const [bucketFilter, setBucketFilter] = useState<BucketName | "all">("all")
    const [artistFilter, setArtistFilter] = useState<string | null>(null)
    const [albumFilterKey, setAlbumFilterKey] = useState<string | null>(null)
    const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

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
    const hasAnyFilters = bucketFilter !== "all" || hasDetailFilters

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

    const clearAllFilters = () => {
        setBucketFilter("all")
        clearDetailFilters()
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
                <TouchableOpacity accessibilityRole="button" onPress={() => navigation.goBack()}>
                    <Text style={styles.back}>Back</Text>
                </TouchableOpacity>
                <View style={styles.headerText}>
                    <Text style={styles.kicker}>YOUR RANKINGS</Text>
                    <Text style={styles.heading}>View All / Filter</Text>
                </View>
                <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Open rankings filters"
                    style={[styles.filterButton, hasDetailFilters && styles.filterButtonActive]}
                    onPress={() => setIsFilterModalOpen(true)}
                >
                    <Text style={[styles.filterButtonText, hasDetailFilters && styles.filterButtonTextActive]}>
                        Filter{hasDetailFilters ? " · Active" : ""}
                    </Text>
                </TouchableOpacity>
            </View>

            <View style={styles.bucketTabs}>
                {BUCKET_FILTERS.map((filter) => (
                    <TouchableOpacity
                        key={filter.value}
                        accessibilityRole="button"
                        accessibilityLabel={`Filter bucket ${filter.label}`}
                        style={[styles.bucketTab, bucketFilter === filter.value && styles.bucketTabActive]}
                        onPress={() => setBucketFilter(filter.value)}
                    >
                        <Text style={[
                            styles.bucketTabText,
                            bucketFilter === filter.value && styles.bucketTabTextActive,
                        ]}>
                            {filter.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <View style={styles.summary}>
                <Text style={styles.summaryText}>
                    {filteredRankings.length} {filteredRankings.length === 1 ? "song" : "songs"}
                </Text>
                {hasAnyFilters && (
                    <TouchableOpacity accessibilityRole="button" onPress={clearAllFilters}>
                        <Text style={styles.clear}>Clear filters</Text>
                    </TouchableOpacity>
                )}
            </View>

            {filteredRankings.length === 0 ? (
                <Text style={styles.empty}>No songs match these filters.</Text>
            ) : (
                <FlashList
                    data={filteredRankings}
                    keyExtractor={(item) => item.id.toString()}
                    contentContainerStyle={styles.listContent}
                    maintainVisibleContentPosition={{ disabled: true }}
                    renderItem={({ item, index }) => (
                        <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel={`Open ${item.song.title} details`}
                            testID={`full-ranking-row-${item.id}`}
                            style={styles.row}
                            onPress={() => navigation.navigate("SongDetail", { ranking: item })}
                        >
                            <Text style={styles.position}>{index + 1}</Text>
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
                            <DiamondScore score={item.score} total={5} size={7} color={bucketColor(item.bucket)} />
                            <ScoreArc
                                score={item.score}
                                max={10}
                                size={42}
                                strokeWidth={4}
                                color={bucketColor(item.bucket)}
                                trackColor={colors.sand}
                            >
                                <Text style={[styles.score, { color: bucketColor(item.bucket) }]}>
                                    {item.score.toFixed(1)}
                                </Text>
                            </ScoreArc>
                        </TouchableOpacity>
                    )}
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
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
    },
    back: { fontFamily: fonts.mono, color: colors.ink, fontSize: 12 },
    headerText: { flex: 1, alignItems: "center", paddingHorizontal: 8 },
    kicker: { fontFamily: fonts.mono, color: colors.inkSoft, fontSize: 8, letterSpacing: 1.4 },
    heading: { fontFamily: fonts.serif, color: colors.ink, fontSize: 22, lineHeight: 26 },
    filterButton: {
        borderWidth: 1,
        borderColor: colors.ink,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 7,
    },
    filterButtonActive: { borderColor: colors.clay, backgroundColor: colors.clay },
    filterButtonText: { fontFamily: fonts.mono, color: colors.ink, fontSize: 9 },
    filterButtonTextActive: { color: colors.paper },
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
        alignItems: "center",
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 999,
        paddingVertical: 8,
        backgroundColor: colors.paper,
    },
    bucketTabActive: { borderColor: colors.clay, backgroundColor: colors.clay },
    bucketTabText: { fontFamily: fonts.mono, color: colors.inkSoft, fontSize: 9 },
    bucketTabTextActive: { color: colors.paper },
    summary: {
        flexDirection: "row",
        justifyContent: "space-between",
        paddingHorizontal: 18,
        paddingVertical: 10,
    },
    summaryText: { fontFamily: fonts.mono, color: colors.inkSoft, fontSize: 10 },
    clear: { fontFamily: fonts.mono, color: colors.clay, fontSize: 10 },
    listContent: { paddingBottom: 24 },
    row: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
        backgroundColor: colors.paper,
    },
    position: { minWidth: 26, fontFamily: fonts.mono, color: colors.inkDim, fontSize: 11 },
    coverFrame: {
        width: 40,
        height: 40,
        borderRadius: 20,
        overflow: "hidden",
        backgroundColor: colors.sand,
        marginRight: 10,
    },
    cover: { width: "100%", height: "100%" },
    songText: { flex: 1, minWidth: 0, marginRight: 8 },
    title: { color: colors.ink, fontSize: 14, fontWeight: "600" },
    artist: { fontFamily: fonts.mono, color: colors.inkSoft, fontSize: 9, marginTop: 3 },
    score: { fontFamily: fonts.serif, fontSize: 13 },
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
