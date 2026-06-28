import { useCallback, useEffect, useState } from "react"
import { ActivityIndicator, FlatList, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { NativeStackScreenProps } from "@react-navigation/native-stack"
import Svg, { Path } from "react-native-svg"

import { ApiError } from "../../api/client"
import BackToTopButton from "../../components/BackToTopButton"
import { useBackToTop } from "../../hooks/useBackToTop"
import { AppStackParamList } from "../../navigation/types"
import { bucketColor, colors, fonts } from "../../theme"
import { useAuth } from "../auth/AuthContext"
import { BucketName, RankingFacetsResponse, RankingResponse } from "../comparison/types"
import { getProfileRankingFacets, getProfileRankings } from "./apiRequests"

type Props = NativeStackScreenProps<AppStackParamList, "UserRankings">

const BUCKET_FILTERS: readonly { value: BucketName | "all"; label: string }[] = [
    { value: "all", label: "All" },
    { value: "like", label: "Like" },
    { value: "alright", label: "Okay" },
    { value: "dislike", label: "Dislike" },
]

export default function UserRankingsScreen({ navigation, route }: Props) {
    const { username } = route.params
    const { token } = useAuth()

    const [rankings, setRankings] = useState<RankingResponse[]>([])
    const [nextCursor, setNextCursor] = useState<string | undefined>(undefined)
    const [facets, setFacets] = useState<RankingFacetsResponse | null>(null)
    const [bucketFilter, setBucketFilter] = useState<BucketName | "all">("all")
    const [artistFilter, setArtistFilter] = useState<string | null>(null)
    const [albumFilterKey, setAlbumFilterKey] = useState<string | null>(null)
    const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const { listRef, showBackToTop, onScroll, scrollToTop } = useBackToTop()

    const selectedAlbum = facets?.albums.find((option) => option.key === albumFilterKey) ?? null
    const hasDetailFilters = artistFilter !== null || selectedAlbum !== null

    // The current filter selection, shaped for the API. Detail filters (artist/album) and the
    // bucket tab combine — the backend ANDs them, so pagination under any combination is correct.
    const buildFilters = useCallback(
        (cursor?: string) => ({
            cursor,
            bucket: bucketFilter !== "all" ? bucketFilter : undefined,
            artist: artistFilter ?? undefined,
            album: selectedAlbum?.album,
            albumArtist: selectedAlbum?.artist,
        }),
        [bucketFilter, artistFilter, selectedAlbum],
    )

    // Facets rarely change, so load them once per profile. They drive the tab counts and the
    // filter modal options — the screen never holds the full ranking list to derive them itself.
    useEffect(() => {
        if (!token) {
            return
        }
        let cancelled = false
        getProfileRankingFacets(username, token)
            .then((data) => {
                if (!cancelled) {
                    setFacets(data)
                }
            })
            .catch(() => {
                // Tabs fall back to no counts; the list itself still loads and surfaces errors.
            })
        return () => {
            cancelled = true
        }
    }, [token, username])

    // Reload the first page whenever the active filter changes.
    useEffect(() => {
        if (!token) {
            setIsLoading(false)
            return
        }
        let cancelled = false
        setIsLoading(true)
        setError(null)
        getProfileRankings(username, token, buildFilters())
            .then((data) => {
                if (cancelled) {
                    return
                }
                setRankings(data.rankings)
                setNextCursor(data.next_cursor ?? undefined)
            })
            .catch((err) => {
                if (cancelled) {
                    return
                }
                if (err instanceof ApiError) {
                    setError(err.detail)
                } else if (err instanceof Error) {
                    setError(err.message)
                } else {
                    setError("Failed to load rankings.")
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setIsLoading(false)
                }
            })
        return () => {
            cancelled = true
        }
    }, [token, username, buildFilters])

    const loadMore = async () => {
        if (!nextCursor || isLoadingMore || !token) {
            return
        }
        setIsLoadingMore(true)
        try {
            const data = await getProfileRankings(username, token, buildFilters(nextCursor))
            setRankings((prev) => [...prev, ...data.rankings])
            setNextCursor(data.next_cursor ?? undefined)
        } catch {
            // Keep what's already loaded; a pull/scroll can retry.
        } finally {
            setIsLoadingMore(false)
        }
    }

    const clearDetailFilters = () => {
        setArtistFilter(null)
        setAlbumFilterKey(null)
    }

    const openSongDetail = (ranking: RankingResponse) => {
        navigation.navigate("SongDetail", { ranking })
    }

    const bucketCount = (value: BucketName | "all") => {
        if (!facets) {
            return null
        }
        return value === "all" ? facets.bucket_counts.all : facets.bucket_counts[value]
    }

    // Exact total for the common single-dimension filters; combos fall back to the loaded count.
    const summaryTotal = (() => {
        if (!facets) {
            return null
        }
        if (selectedAlbum !== null && bucketFilter === "all" && artistFilter === null) {
            return selectedAlbum.count
        }
        if (artistFilter !== null && bucketFilter === "all" && selectedAlbum === null) {
            return facets.artists.find((option) => option.artist === artistFilter)?.count ?? null
        }
        if (artistFilter === null && selectedAlbum === null) {
            return bucketFilter === "all" ? facets.bucket_counts.all : facets.bucket_counts[bucketFilter]
        }
        return null
    })()
    const summaryText = summaryTotal !== null
        ? `${summaryTotal} ${summaryTotal === 1 ? "SONG" : "SONGS"}`
        : `${rankings.length}${nextCursor ? "+" : ""} SONGS`

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
                <Text style={styles.heading} numberOfLines={1}>@{username}</Text>
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
                    const count = bucketCount(filter.value)
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
                            {count !== null && (
                                <Text style={[styles.bucketTabCount, isActive && styles.bucketTabCountActive]}>
                                    {count}
                                </Text>
                            )}
                        </TouchableOpacity>
                    )
                })}
            </View>

            {isLoading ? (
                <ActivityIndicator color={colors.clay} style={styles.loader} />
            ) : error !== null && rankings.length === 0 ? (
                <Text style={styles.error}>{error}</Text>
            ) : (
                <>
                    <View style={styles.summary}>
                        <Text style={styles.summaryText}>{summaryText}</Text>
                        {hasDetailFilters && (
                            <TouchableOpacity accessibilityRole="button" onPress={clearDetailFilters}>
                                <Text style={styles.clear}>Clear</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                    <FlatList
                        ref={listRef as never}
                        data={rankings}
                        keyExtractor={(item) => String(item.id)}
                        contentContainerStyle={styles.listContent}
                        onScroll={onScroll}
                        scrollEventThrottle={16}
                        onEndReached={loadMore}
                        onEndReachedThreshold={0.3}
                        ListEmptyComponent={
                            <Text style={styles.empty}>
                                {hasDetailFilters || bucketFilter !== "all"
                                    ? "No songs match these filters."
                                    : "No visible rankings yet."}
                            </Text>
                        }
                        ListFooterComponent={
                            isLoadingMore ? (
                                <ActivityIndicator color={colors.clay} style={styles.footerLoader} />
                            ) : null
                        }
                        renderItem={({ item, index }) => (
                            <TouchableOpacity
                                accessibilityRole="button"
                                accessibilityLabel={`Open ${item.song.title} details`}
                                style={styles.row}
                                onPress={() => openSongDetail(item)}
                                testID={`user-ranking-row-${item.id}`}
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
                                <View style={styles.scoreGroup}>
                                    <View style={[styles.bucketDot, { backgroundColor: bucketColor(item.bucket) }]} />
                                    <Text style={[styles.score, { color: bucketColor(item.bucket) }]}>
                                        {item.score.toFixed(1)}
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        )}
                    />
                </>
            )}

            <BackToTopButton visible={showBackToTop} onPress={scrollToTop} />

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
                            {(facets?.artists ?? []).map((option) => (
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
                            {(facets?.albums ?? []).map((option) => (
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
    container: {
        flex: 1,
        backgroundColor: colors.bg,
    },
    header: {
        paddingTop: 58,
        paddingHorizontal: 16,
        paddingBottom: 14,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    headerLeft: { width: 80 },
    headerRight: { width: 80, alignItems: "flex-end" },
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
    clear: { fontFamily: fonts.mono, color: colors.clay, fontSize: 10 },
    loader: {
        marginTop: 48,
    },
    error: {
        color: colors.dislike,
        fontSize: 14,
        textAlign: "center",
        margin: 24,
    },
    listContent: {
        paddingBottom: 24,
    },
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
    empty: {
        color: colors.inkSoft,
        fontSize: 14,
        textAlign: "center",
        marginTop: 48,
    },
    footerLoader: {
        marginVertical: 16,
    },
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
