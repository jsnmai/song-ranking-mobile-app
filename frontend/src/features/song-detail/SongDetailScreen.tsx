// Song Detail — Bento Orbit layout.
// Hero: full-width cover with gradient overlay, bucket tag + title/artist, score numeral.
// Below: audio preview row, action buttons, context cards (Your Score + Global).
import { useEffect, useRef, useState } from "react"
import {
    ActivityIndicator,
    Alert,
    Animated,
    Image,
    Modal,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native"
import { NativeStackScreenProps } from "@react-navigation/native-stack"
import Svg, { Circle, Path } from "react-native-svg"

import { ApiError } from "../../api/client"
import { ArrowLabel } from "../../components/Arrow"
import { useAudioPlayer } from "../../hooks/useAudioPlayer"
import { AppStackParamList } from "../../navigation/types"
import { colors, fonts, bucketColor } from "../../theme"
import { useAuth } from "../auth/AuthContext"
import { listMyVersusHistory, removeRating } from "../rankings/apiRequests"
import { ComparisonHistoryReceipt } from "../rankings/types"
import { fetchPreviewUrl } from "../songs/apiRequests"
import { bookmarkSong, getBookmarkStatus, removeBookmark } from "../bookmarks/apiRequests"
import { Bookmark } from "../bookmarks/types"

type SongDetailProps = NativeStackScreenProps<AppStackParamList, "SongDetail">

function BackIcon() {
    return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"
            stroke={colors.ink} strokeWidth={1.9} strokeLinecap="round">
            <Path d="M15 19 8 12l7-7" />
        </Svg>
    )
}

function ShareIcon() {
    return (
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none"
            stroke={colors.ink} strokeWidth={1.9} strokeLinecap="round">
            <Path d="M12 16V4M8 8l4-4 4 4M5 14v5h14v-5" />
        </Svg>
    )
}

function PlayIcon({ color }: { color: string }) {
    return (
        <Svg width={14} height={14} viewBox="0 0 24 24" fill={color}>
            <Path d="M8 5v14l11-7z" />
        </Svg>
    )
}

function PauseIcon({ color }: { color: string }) {
    return (
        <Svg width={14} height={14} viewBox="0 0 24 24" fill={color}>
            <Path d="M6 5h4v14H6zM14 5h4v14h-4z" />
        </Svg>
    )
}

function BookmarkIcon({ filled }: { filled: boolean }) {
    return (
        <Svg width={18} height={18} viewBox="0 0 24 24"
            fill={filled ? colors.ink : "none"}
            stroke={colors.ink} strokeWidth={1.9} strokeLinejoin="round">
            <Path d="M6 4h12v17l-6-4-6 4z" />
        </Svg>
    )
}

function ReorderIcon() {
    return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"
            stroke={colors.ink} strokeWidth={1.9} strokeLinecap="round">
            <Path d="M4 6h16M4 12h16M4 18h16" />
        </Svg>
    )
}

function RefreshIcon() {
    return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"
            stroke={colors.ink} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M1 4v6h6M23 20v-6h-6M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 0 1 3.51 15" />
        </Svg>
    )
}

function TrashIcon({ danger }: { danger?: boolean }) {
    const c = danger ? colors.danger : colors.ink
    return (
        <Svg width={19} height={19} viewBox="0 0 24 24" fill="none"
            stroke={c} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6.5 7l.9 12.1a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9L18.5 7" />
        </Svg>
    )
}

function ChevronRightIcon() {
    return (
        <Svg width={15} height={15} viewBox="0 0 24 24" fill="none"
            stroke={colors.inkDim} strokeWidth={2} strokeLinecap="round">
            <Path d="M9 18l6-6-6-6" />
        </Svg>
    )
}

type SheetItemProps = {
    icon: React.ReactNode
    label: string
    sub?: string | null
    danger?: boolean
    isFirst?: boolean
    onPress: () => void
}

function SheetItem({ icon, label, sub, danger, isFirst, onPress }: SheetItemProps) {
    return (
        <TouchableOpacity
            accessibilityRole="button"
            style={[styles.sheetItem, isFirst && styles.sheetItemFirst]}
            onPress={onPress}
        >
            <View style={[styles.sheetItemIcon, danger === true && styles.sheetItemIconDanger]}>
                {icon}
            </View>
            <View style={styles.sheetItemText}>
                <Text style={[styles.sheetItemLabel, danger === true && styles.sheetItemLabelDanger]}>
                    {label}
                </Text>
                {sub != null && <Text style={styles.sheetItemSub}>{sub}</Text>}
            </View>
            <ChevronRightIcon />
        </TouchableOpacity>
    )
}

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, "0")}`
}

function _bucketLabel(bucket: string): string {
    if (bucket === "like") return "Like"
    if (bucket === "alright" || bucket === "okay") return "Okay"
    return "Dislike"
}

export default function SongDetailScreen({ navigation, route }: SongDetailProps) {
    const { token } = useAuth()
    const isRated = "ranking" in route.params
    const ranking = isRated ? route.params.ranking : null
    const song = isRated ? route.params.ranking.song : route.params.song
    const globalRatingCount = song.global_rating_count ?? 0
    const globalAvgScore = song.global_avg_score ?? null
    const [menuOpen, setMenuOpen] = useState(false)
    const [isRemoving, setIsRemoving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [versusReceipts, setVersusReceipts] = useState<ComparisonHistoryReceipt[]>([])
    const [isPreviewLoading, setIsPreviewLoading] = useState(true)
    const [bookmark, setBookmark] = useState<Bookmark | null>(null)
    const [isBookmarkStatusLoading, setIsBookmarkStatusLoading] = useState(true)
    const [isBookmarkUpdating, setIsBookmarkUpdating] = useState(false)
    const { isPlaying, currentTime, duration, toggle: toggleAudio, stop: stopAudio } = useAudioPlayer(previewUrl)
    const progressAnim = useRef(new Animated.Value(0)).current
    const animRef = useRef<Animated.CompositeAnimation | null>(null)
    // Refs so the animation effect can read latest values without them being deps.
    const currentTimeRef = useRef(currentTime)
    const durationRef = useRef(duration)
    useEffect(() => { currentTimeRef.current = currentTime }, [currentTime])
    useEffect(() => { durationRef.current = duration }, [duration])
    // One long animation per play session — restarts only on play/pause or when duration first arrives.
    useEffect(() => {
        animRef.current?.stop()
        animRef.current = null
        const ct = currentTimeRef.current
        const dur = durationRef.current
        if (isPlaying && dur != null && dur > 0) {
            // Don't setValue — animate from wherever the bar currently is so play/pause
            // transitions don't jump. Use ct only to calculate the remaining duration so
            // the animation ends when the audio does.
            const anim = Animated.timing(progressAnim, {
                toValue: 1,
                duration: Math.max((dur - ct) * 1000, 0),
                useNativeDriver: false,
            })
            animRef.current = anim
            anim.start(({ finished }) => { if (finished) progressAnim.setValue(0) })
        } else if (dur == null || dur <= 0 || ct === 0) {
            // Reset to 0 only when there's no duration or the song just finished.
            progressAnim.setValue(0)
        }
        return () => { animRef.current?.stop() }
    }, [isPlaying, duration])

    const accent = ranking ? bucketColor(ranking.bucket) : colors.inkDim

    const handleRateAgain = () => {
        setMenuOpen(false)
        stopAudio()
        navigation.navigate("BucketSelection", { song })
    }

    const handleReorder = () => {
        setMenuOpen(false)
        stopAudio()
        navigation.navigate("Reorder")
    }

    const handleShare = async () => {
        setMenuOpen(false)
        try {
            await Share.share({
                message: `${song.title} by ${song.artist}${ranking ? ` — ${ranking.score.toFixed(1)}/10 on LISTn` : " — on LISTn"}`,
            })
        } catch { /* ignore */ }
    }

    const handleRemovePress = () => {
        setMenuOpen(false)
        if (ranking === null) return
        Alert.alert(
            "Remove this song from your rankings? This cannot be undone.",
            undefined,
            [
                { text: "Cancel", style: "cancel" },
                { text: "Remove", style: "destructive", onPress: handleConfirmRemove },
            ],
        )
    }

    const handleConfirmRemove = async () => {
        if (!token || isRemoving || ranking === null) return
        setIsRemoving(true)
        setError(null)
        try {
            await removeRating(ranking.song_id, token)
            stopAudio()
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

    const handleBookmarkToggle = async () => {
        if (!token || isBookmarkUpdating) return
        setIsBookmarkUpdating(true)
        setError(null)
        try {
            if (bookmark === null) {
                const bm = await bookmarkSong(song, "song_detail", token)
                setBookmark(bm)
            } else {
                await removeBookmark(bookmark.song.id, token)
                setBookmark(null)
            }
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.detail)
            } else if (err instanceof Error) {
                setError(err.message)
            } else {
                setError("Could not update bookmark state.")
            }
        } finally {
            setIsBookmarkUpdating(false)
        }
    }

    useEffect(() => {
        if (!token || ranking === null) return
        let isActive = true
        const songDbId = ranking.song.id
        listMyVersusHistory(token).then((res) => {
            if (!isActive) return
            setVersusReceipts(
                res.receipts.filter(
                    (r) => r.winner_song_id === songDbId || r.loser_song_id === songDbId,
                ),
            )
        }).catch(() => { /* non-critical, silence */ })
        return () => { isActive = false }
    }, [token, ranking])

    useEffect(() => {
        return navigation.addListener("blur", () => { stopAudio() })
    }, [navigation, stopAudio])

    useEffect(() => {
        let isActive = true
        setIsPreviewLoading(true)
        if (!isRated) {
            setPreviewUrl(song.preview_url)
            setIsPreviewLoading(false)
            return () => { isActive = false }
        }
        async function loadPreviewUrl() {
            try {
                const url = await fetchPreviewUrl(song.deezer_id, token ?? "")
                if (isActive) setPreviewUrl(url)
            } catch {
                if (isActive) setPreviewUrl(null)
            } finally {
                if (isActive) setIsPreviewLoading(false)
            }
        }
        loadPreviewUrl()
        return () => { isActive = false }
    }, [isRated, song.deezer_id, song.preview_url, token])

    useEffect(() => {
        let isActive = true
        async function loadBookmarkState() {
            if (!token) {
                setIsBookmarkStatusLoading(false)
                return
            }
            setIsBookmarkStatusLoading(true)
            try {
                const response = await getBookmarkStatus(song.deezer_id, token)
                if (isActive) setBookmark(response.bookmark)
            } catch (err) {
                if (isActive) {
                    setError(err instanceof ApiError ? err.detail : "Could not load bookmark state.")
                }
            } finally {
                if (isActive) setIsBookmarkStatusLoading(false)
            }
        }
        loadBookmarkState()
        return () => { isActive = false }
    }, [song.deezer_id, token])

    return (
        <View style={styles.container}>
            {/* Nav bar */}
            <View style={styles.navBar}>
                <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => { stopAudio(); navigation.goBack() }}
                >
                    <BackIcon />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={handleShare}>
                    <ShareIcon />
                </TouchableOpacity>
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Hero cover — square */}
                <View style={styles.hero}>
                    {song.cover_url ? (
                        <Image source={{ uri: song.cover_url }} style={styles.heroCover} />
                    ) : (
                        <View style={[styles.heroCover, { backgroundColor: colors.paper2 }]} />
                    )}
                    {/* Gradient overlay */}
                    <View style={styles.heroGradient} />
                    {/* Bottom content */}
                    <View style={styles.heroBottom}>
                        <View style={styles.heroLeft}>
                            {ranking !== null && (
                                <View style={[styles.bucketTag, { backgroundColor: accent }]}>
                                    <View style={styles.bucketTagDot} />
                                    <Text style={styles.bucketTagText}>
                                        {_bucketLabel(ranking.bucket)}
                                    </Text>
                                </View>
                            )}
                            <Text style={styles.heroTitle} numberOfLines={2}>
                                {song.title}
                            </Text>
                            <Text style={styles.heroMeta} numberOfLines={1}>
                                {song.artist.toUpperCase()} · {song.album.toUpperCase()}
                            </Text>
                        </View>
                        <View style={styles.heroRight}>
                            {ranking !== null ? (
                                <>
                                    <Text style={styles.heroScore}>{ranking.score.toFixed(1)}</Text>
                                    <Text style={styles.heroScoreLabel}>YOUR SCORE</Text>
                                </>
                            ) : (
                                <Text style={styles.heroUnrated}>UNRATED</Text>
                            )}
                        </View>
                    </View>
                </View>

                {/* Audio preview + bookmark row */}
                <View style={styles.previewRow}>
                    <View style={styles.previewPlayer}>
                        {isPreviewLoading ? (
                            <View style={[styles.playBtn, { backgroundColor: colors.paper2 }]}>
                                <ActivityIndicator color={colors.ink} size="small" />
                            </View>
                        ) : previewUrl !== null ? (
                            <TouchableOpacity
                                style={[styles.playBtn, { backgroundColor: colors.accent }]}
                                onPress={toggleAudio}
                                accessibilityLabel={isPlaying ? "Pause Preview" : "Play Preview"}
                            >
                                {isPlaying
                                    ? <PauseIcon color="#fff" />
                                    : <PlayIcon color="#fff" />
                                }
                            </TouchableOpacity>
                        ) : (
                            <View style={[styles.playBtn, { backgroundColor: colors.paper2 }]}>
                                <PlayIcon color={colors.inkDim} />
                            </View>
                        )}
                        <View style={styles.progressTrack}>
                            <Animated.View style={[styles.progressFill, {
                                backgroundColor: colors.accent,
                                width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
                            }]} />
                        </View>
                        <Text style={styles.previewDur}>{formatTime(currentTime)}</Text>
                    </View>
                    <TouchableOpacity
                        style={styles.bookmarkBtn}
                        onPress={handleBookmarkToggle}
                        disabled={isBookmarkStatusLoading || isBookmarkUpdating}
                        accessibilityLabel={bookmark !== null ? "Remove Bookmark" : "Bookmark"}
                    >
                        <BookmarkIcon filled={bookmark !== null} />
                    </TouchableOpacity>
                </View>

                {/* Action buttons */}
                <View style={styles.actionRow}>
                    <TouchableOpacity style={styles.accentBtn} onPress={handleRateAgain}>
                        <Text style={styles.accentBtnText}>
                            {ranking === null ? "Rate Song" : "Re-rate"}
                        </Text>
                    </TouchableOpacity>
                    {ranking !== null && (
                        <TouchableOpacity
                            accessibilityLabel="More actions"
                            style={styles.dotsBtn}
                            onPress={() => setMenuOpen(true)}
                        >
                            {[0, 1, 2].map((i) => (
                                <View key={i} style={styles.dot} />
                            ))}
                        </TouchableOpacity>
                    )}
                </View>

                {/* Context cards */}
                <View style={styles.contextRow}>
                    {/* Your score card (paper) */}
                    <View style={styles.paperCard}>
                        <Text style={styles.cardKicker}>YOUR SCORE</Text>
                        {ranking !== null ? (
                            <>
                                <Text style={[styles.bigScore, { color: accent }]}>
                                    {ranking.score.toFixed(1)}
                                </Text>
                                <Text style={styles.cardMeta}>#{ranking.position} · {_bucketLabel(ranking.bucket).toUpperCase()}</Text>
                            </>
                        ) : (
                            <Text style={styles.cardEmpty}>Not rated yet</Text>
                        )}
                    </View>

                    {/* Global card (orbit / dark navy) */}
                    <View style={styles.orbitCard}>
                        <View style={styles.orbitPill}>
                            <Text style={styles.orbitPillText}>Global</Text>
                        </View>
                        {globalAvgScore !== null ? (
                            <>
                                <View style={styles.globalScoreRow}>
                                    <Text style={styles.globalScore}>{globalAvgScore.toFixed(1)}</Text>
                                    <Text style={styles.globalSlash}>/10</Text>
                                </View>
                                {globalRatingCount > 0 && (
                                    <Text style={styles.globalCount}>
                                        {globalRatingCount} {globalRatingCount === 1 ? "rating" : "ratings"}
                                    </Text>
                                )}
                            </>
                        ) : (
                            <Text style={styles.globalEmpty}>No ratings yet</Text>
                        )}
                    </View>
                </View>

                {/* Versus History */}
                {isRated && (
                    <>
                        <View style={styles.sdSectionRow}>
                            <Text style={styles.sdSectionLabel}>VERSUS HISTORY</Text>
                            <TouchableOpacity onPress={() => navigation.navigate("VersusHistory")}>
                                <ArrowLabel text="ALL" direction="up-right" color={colors.accent} textStyle={styles.sdSectionRight} />
                            </TouchableOpacity>
                        </View>
                        {versusReceipts.length === 0 ? (
                            <View style={[styles.sdVersusCard, styles.sdVersusEmpty]}>
                                <View style={styles.sdVersusGhostRow}>
                                    <View style={styles.sdVersusGhostCover} />
                                    <Text style={styles.sdVersusVSText}>VS</Text>
                                    <View style={styles.sdVersusGhostCover} />
                                </View>
                                <Text style={styles.sdVersusEmptyTitle}>No match-ups yet</Text>
                                <Text style={styles.sdVersusEmptyBody}>
                                    This song's head-to-heads from the ranking process will appear here.
                                </Text>
                            </View>
                        ) : (
                            <TouchableOpacity
                                style={styles.sdVersusCard}
                                onPress={() => navigation.navigate("VersusHistory")}
                                activeOpacity={0.8}
                                accessibilityLabel="Open Versus History"
                            >
                                {versusReceipts.slice(0, 3).map((r, i) => (
                                    <View
                                        key={r.id}
                                        style={[styles.sdVersusRow, i > 0 && styles.sdVersusRowBorder]}
                                    >
                                        <View style={styles.versusCovers}>
                                            <View style={styles.versusWinnerCover}>
                                                {r.winner_cover_url ? (
                                                    <Image
                                                        source={{ uri: r.winner_cover_url }}
                                                        style={styles.versusCoverImg}
                                                    />
                                                ) : (
                                                    <View style={[styles.versusCoverImg, { backgroundColor: colors.paper2 }]} />
                                                )}
                                            </View>
                                            <Text style={styles.versusVSLabel}>VS</Text>
                                            <View style={styles.versusLoserCover}>
                                                {r.loser_cover_url ? (
                                                    <Image
                                                        source={{ uri: r.loser_cover_url }}
                                                        style={styles.versusCoverImg}
                                                    />
                                                ) : (
                                                    <View style={[styles.versusCoverImg, { backgroundColor: colors.paper2 }]} />
                                                )}
                                            </View>
                                        </View>
                                        <View style={styles.versusWinnerInfo}>
                                            <Text style={styles.versusWinnerTitle} numberOfLines={1}>
                                                {r.winner_title}
                                            </Text>
                                            <Text style={styles.versusOverLabel} numberOfLines={1}>
                                                over {r.loser_title}
                                            </Text>
                                        </View>
                                    </View>
                                ))}
                            </TouchableOpacity>
                        )}
                    </>
                )}

                {error !== null && <Text style={styles.errorText}>{error}</Text>}
            </ScrollView>

            {/* Actions bottom sheet */}
            <Modal
                visible={menuOpen}
                transparent
                animationType="slide"
                statusBarTranslucent
                onRequestClose={() => setMenuOpen(false)}
            >
                <View style={styles.sheetBackdrop}>
                    <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setMenuOpen(false)} />
                    <View style={styles.sheet}>
                        <View style={styles.sheetHandle} />
                        <View style={styles.sheetSongRow}>
                            <View style={styles.sheetCover}>
                                {song.cover_url
                                    ? <Image source={{ uri: song.cover_url }} style={styles.sheetCoverImg} />
                                    : null}
                            </View>
                            <View style={styles.sheetSongText}>
                                <Text style={styles.sheetSongTitle} numberOfLines={1}>{song.title}</Text>
                                <Text style={styles.sheetSongArtist}>{song.artist.toUpperCase()}</Text>
                            </View>
                        </View>
                        <SheetItem isFirst icon={<ReorderIcon />} label="Move in ranking" sub="Reorder by hand" onPress={handleReorder} />
                        <SheetItem icon={<RefreshIcon />} label="Re-rate" sub="Run the compare again" onPress={handleRateAgain} />
                        <SheetItem icon={<ShareIcon />} label="Share" onPress={handleShare} />
                        <SheetItem icon={<TrashIcon danger />} label="Remove rating" sub="Takes it out of your Rankings" danger onPress={handleRemovePress} />
                    </View>
                </View>
            </Modal>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.bg,
    },
    // ── Nav bar ────────────────────────────────────────────────────────
    navBar: {
        paddingTop: 54,
        paddingHorizontal: 14,
        paddingBottom: 8,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    iconBtn: {
        width: 32,
        height: 32,
        borderRadius: 9,
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        alignItems: "center",
        justifyContent: "center",
    },
    // ── Scroll ─────────────────────────────────────────────────────────
    scroll: { flex: 1 },
    scrollContent: {
        paddingHorizontal: 14,
        paddingBottom: 24,
    },
    // ── Hero ───────────────────────────────────────────────────────────
    hero: {
        aspectRatio: 1,
        borderRadius: 18,
        overflow: "hidden",
        position: "relative",
        marginBottom: 11,
    },
    heroCover: {
        width: "100%",
        height: "100%",
    },
    heroGradient: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: "80%",
        backgroundColor: "rgba(10,12,20,0.0)",
        // Simulated gradient: transparent top → dark bottom
        // We use a series of overlapping Views since LinearGradient isn't installed
    },
    heroBottom: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        padding: 14,
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent: "space-between",
        // Dark scrim
        backgroundColor: "rgba(10,12,20,0.72)",
    },
    heroLeft: {
        flex: 1,
        minWidth: 0,
        paddingRight: 8,
    },
    heroRight: {
        alignItems: "flex-end",
        flexShrink: 0,
    },
    bucketTag: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 4,
        alignSelf: "flex-start",
        marginBottom: 8,
    },
    bucketTagDot: {
        width: 5,
        height: 5,
        borderRadius: 3,
        backgroundColor: "rgba(255,255,255,0.7)",
    },
    bucketTagText: {
        fontWeight: "700",
        fontSize: 10,
        color: "#fff",
        letterSpacing: 0.2,
    },
    heroTitle: {
        fontFamily: fonts.display,
        fontSize: 24,
        lineHeight: 26,
        color: "#fff",
        letterSpacing: -0.4,
        marginBottom: 3,
    },
    heroMeta: {
        fontFamily: fonts.mono,
        fontSize: 9,
        letterSpacing: 1,
        color: "rgba(255,255,255,0.8)",
    },
    heroScore: {
        fontFamily: fonts.display,
        fontSize: 46,
        lineHeight: 46,
        color: "#fff",
        letterSpacing: -1,
    },
    heroScoreLabel: {
        fontFamily: fonts.mono,
        fontSize: 7,
        letterSpacing: 1.4,
        color: "rgba(255,255,255,0.7)",
        marginTop: 2,
        textAlign: "right",
    },
    heroUnrated: {
        fontFamily: fonts.mono,
        fontSize: 9,
        letterSpacing: 1.2,
        color: "rgba(255,255,255,0.6)",
    },
    // ── Preview row ─────────────────────────────────────────────────────
    previewRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 9,
        marginBottom: 9,
    },
    previewPlayer: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 13,
        paddingVertical: 9,
        paddingHorizontal: 12,
    },
    playBtn: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    progressTrack: {
        flex: 1,
        height: 3,
        backgroundColor: colors.line,
        borderRadius: 2,
    },
    progressFill: {
        width: "34%",
        height: "100%",
        borderRadius: 2,
    },
    previewDur: {
        fontFamily: fonts.mono,
        fontSize: 9,
        color: colors.inkDim,
        flexShrink: 0,
    },
    bookmarkBtn: {
        width: 46,
        height: 46,
        borderRadius: 13,
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        alignItems: "center",
        justifyContent: "center",
    },
    // ── Action buttons ─────────────────────────────────────────────────
    actionRow: {
        flexDirection: "row",
        gap: 9,
        marginBottom: 11,
    },
    accentBtn: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.accent,
        borderRadius: 13,
        paddingVertical: 13,
    },
    accentBtnText: {
        fontWeight: "700",
        fontSize: 13,
        color: "#fff",
        letterSpacing: 0.2,
    },
    dotsBtn: {
        width: 54,
        alignSelf: "stretch",
        borderRadius: 13,
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
    },
    dot: {
        width: 4.5,
        height: 4.5,
        borderRadius: 2.25,
        backgroundColor: colors.ink,
    },
    // ── Context cards ──────────────────────────────────────────────────
    contextRow: {
        flexDirection: "row",
        gap: 10,
        marginBottom: 11,
    },
    paperCard: {
        flex: 1,
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 16,
        padding: 12,
        shadowColor: colors.ink,
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
    },
    cardKicker: {
        fontFamily: fonts.mono,
        fontSize: 8,
        letterSpacing: 1.4,
        color: colors.inkDim,
        fontWeight: "700",
        marginBottom: 9,
    },
    bigScore: {
        fontFamily: fonts.display,
        fontSize: 26,
        letterSpacing: -0.5,
        lineHeight: 28,
        marginBottom: 4,
    },
    cardMeta: {
        fontFamily: fonts.mono,
        fontSize: 8,
        color: colors.inkSoft,
        letterSpacing: 0.8,
    },
    cardEmpty: {
        color: colors.inkSoft,
        fontSize: 12,
        marginTop: 4,
    },
    // Orbit card (dark navy)
    orbitCard: {
        flex: 1,
        backgroundColor: colors.navy,
        borderRadius: 16,
        padding: 12,
        overflow: "hidden",
        shadowColor: colors.navy,
        shadowOpacity: 0.3,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
    },
    orbitPill: {
        backgroundColor: "rgba(245,184,64,0.16)",
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 3,
        alignSelf: "flex-start",
        marginBottom: 9,
    },
    orbitPillText: {
        fontFamily: fonts.mono,
        fontSize: 8.5,
        color: colors.gold,
        fontWeight: "700",
        letterSpacing: 1.2,
    },
    globalScoreRow: {
        flexDirection: "row",
        alignItems: "baseline",
        gap: 4,
    },
    globalScore: {
        fontFamily: fonts.display,
        fontSize: 26,
        color: colors.gold,
        letterSpacing: -0.5,
        lineHeight: 28,
    },
    globalSlash: {
        fontFamily: fonts.mono,
        fontSize: 8,
        color: colors.cdim,
        letterSpacing: 1,
    },
    globalCount: {
        fontFamily: fonts.mono,
        fontSize: 8,
        color: colors.cdim,
        letterSpacing: 0.8,
        marginTop: 5,
    },
    globalEmpty: {
        color: colors.cdim,
        fontSize: 12,
        marginTop: 4,
    },
    // ── Actions sheet ──────────────────────────────────────────────────
    sheetBackdrop: {
        flex: 1,
        justifyContent: "flex-end",
        backgroundColor: "rgba(17,19,28,0.5)",
    },
    sheet: {
        backgroundColor: colors.paper,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 18,
        paddingTop: 10,
        paddingBottom: 34,
        shadowColor: "#000",
        shadowOpacity: 0.4,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: -22 },
    },
    sheetHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: colors.line,
        alignSelf: "center",
        marginBottom: 14,
    },
    sheetSongRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 11,
        paddingBottom: 6,
    },
    sheetCover: {
        width: 42,
        height: 42,
        borderRadius: 10,
        overflow: "hidden",
        backgroundColor: colors.paper2,
        flexShrink: 0,
    },
    sheetCoverImg: { width: "100%", height: "100%" },
    sheetSongText: { flex: 1, minWidth: 0 },
    sheetSongTitle: { fontFamily: fonts.display, fontSize: 15, color: colors.ink },
    sheetSongArtist: {
        fontFamily: fonts.mono,
        fontSize: 8,
        letterSpacing: 1,
        color: colors.inkDim,
        marginTop: 2,
    },
    sheetItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 13,
        paddingVertical: 13,
        paddingHorizontal: 4,
        borderTopWidth: 1,
        borderTopColor: colors.line2,
    },
    sheetItemFirst: { borderTopWidth: 0 },
    sheetItemIcon: {
        width: 38,
        height: 38,
        borderRadius: 11,
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    sheetItemIconDanger: {
        backgroundColor: "rgba(224,73,46,0.10)",
        borderColor: "rgba(224,73,46,0.2)",
    },
    sheetItemText: { flex: 1, minWidth: 0 },
    sheetItemLabel: { fontFamily: fonts.display, fontSize: 15, color: colors.ink },
    sheetItemLabelDanger: { color: colors.danger },
    sheetItemSub: { fontSize: 11, color: colors.inkDim, marginTop: 1 },
    // ── Versus history section ─────────────────────────────────────────
    sdSectionRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "baseline",
        marginTop: 13,
        marginBottom: 7,
    },
    sdSectionLabel: {
        fontFamily: fonts.mono,
        fontSize: 9,
        letterSpacing: 1.6,
        color: colors.inkDim,
        fontWeight: "700",
    },
    sdSectionRight: {
        fontFamily: fonts.mono,
        fontSize: 9,
        color: colors.accent,
        fontWeight: "700",
        letterSpacing: 0.5,
    },
    sdVersusCard: {
        backgroundColor: colors.paper,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.line,
        paddingHorizontal: 12,
        shadowColor: colors.ink,
        shadowOpacity: 0.04,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        marginBottom: 4,
    },
    sdVersusEmpty: {
        alignItems: "center",
        paddingVertical: 16,
        paddingHorizontal: 18,
    },
    sdVersusGhostRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 9,
    },
    sdVersusGhostCover: {
        width: 32,
        height: 32,
        borderRadius: 7,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: colors.inkDim,
        backgroundColor: colors.paper2,
    },
    sdVersusVSText: {
        fontFamily: fonts.display,
        fontSize: 9,
        color: colors.inkDim,
        letterSpacing: 1,
    },
    sdVersusEmptyTitle: {
        fontFamily: fonts.display,
        fontSize: 14,
        color: colors.ink,
        marginTop: 11,
    },
    sdVersusEmptyBody: {
        fontSize: 11.5,
        color: colors.inkSoft,
        lineHeight: 17,
        marginTop: 4,
        textAlign: "center",
        maxWidth: 250,
    },
    sdVersusRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 9,
        gap: 10,
    },
    sdVersusRowBorder: {
        borderTopWidth: 1,
        borderTopColor: colors.paper2,
    },
    // ── Shared cover pair styles (also used in RankingsScreen via inline) ──
    versusCovers: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        flexShrink: 0,
    },
    versusWinnerCover: {
        borderRadius: 6,
        overflow: "hidden",
        borderWidth: 2,
        borderColor: colors.accent,
    },
    versusLoserCover: {
        borderRadius: 6,
        overflow: "hidden",
        opacity: 0.4,
    },
    versusCoverImg: {
        width: 30,
        height: 30,
        borderRadius: 4,
    },
    versusVSLabel: {
        fontFamily: fonts.display,
        fontSize: 8.5,
        color: colors.inkDim,
    },
    versusWinnerInfo: {
        flex: 1,
        minWidth: 0,
    },
    versusWinnerTitle: {
        fontFamily: fonts.display,
        fontSize: 12,
        lineHeight: 14,
        color: colors.ink,
    },
    versusOverLabel: {
        fontSize: 11,
        color: colors.inkSoft,
        marginTop: 2,
    },
    errorText: {
        color: colors.danger,
        fontSize: 14,
        textAlign: "center",
        marginTop: 10,
        marginBottom: 4,
    },
})
