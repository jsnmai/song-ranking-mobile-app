// Rank Map — the bloom card (the "song preview" that slides up when you tap a
// star). Matches the §13 design: one row of [cover · meta+inline-preview ·
// score], a close button floated top-right, and an inline 30s audio preview
// (play/pause + progress + time). Tapping the body opens the full Song Detail.
import { useEffect, useState } from "react"
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native"
import Animated, { FadeInDown } from "react-native-reanimated"
import { BlurView } from "expo-blur"
import Svg, { Path } from "react-native-svg"

import { bucketColor, colors, fonts } from "../../../theme"
import { useAudioPlayer } from "../../../hooks/useAudioPlayer"
import { fetchPreviewUrl } from "../../songs/apiRequests"
import { bucketLabel, RankMapSong } from "./layouts"

function CloseIcon() {
    return (
        <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
            <Path d="M6 6l12 12M18 6 6 18" stroke={colors.cdim} strokeWidth={2} strokeLinecap="round" />
        </Svg>
    )
}

function PlayIcon() {
    return (
        <Svg width={12} height={12} viewBox="0 0 24 24">
            <Path d="M8 5v14l11-7z" fill="#fff" />
        </Svg>
    )
}

function PauseIcon() {
    return (
        <Svg width={12} height={12} viewBox="0 0 24 24">
            <Path d="M7 5h3.2v14H7zM13.8 5H17v14h-3.2z" fill="#fff" />
        </Svg>
    )
}

function fmtTime(sec: number): string {
    const s = Math.max(0, Math.floor(sec))
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

export function BloomCard({
    s,
    rank,
    token,
    lift = 0,
    onClose,
    onOpen,
}: {
    s: RankMapSong
    rank: number
    token: string | null
    lift?: number
    onClose: () => void
    onOpen: () => void
}) {
    const c = bucketColor(s.bucket)
    const dist = 10 - s.score // how far from your sun

    // Rated songs don't carry a usable preview_url on the row — fetch the live
    // 30s preview by deezer id, exactly like Song Detail does.
    const deezerId = s.ranking.song.deezer_id
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [loadingPreview, setLoadingPreview] = useState(true)
    useEffect(() => {
        let active = true
        setPreviewUrl(null)
        setLoadingPreview(true)
        if (deezerId == null) {
            setLoadingPreview(false)
            return () => { active = false }
        }
        fetchPreviewUrl(deezerId, token ?? "")
            .then((url) => active && setPreviewUrl(url))
            .catch(() => active && setPreviewUrl(null))
            .finally(() => active && setLoadingPreview(false))
        return () => { active = false }
    }, [deezerId, token])

    const { isPlaying, currentTime, duration, toggle, stop } = useAudioPlayer(previewUrl)
    const hasPreview = previewUrl !== null
    const showAudio = loadingPreview || hasPreview
    const dur = duration && duration > 0 ? duration : 30
    const progress = duration && duration > 0 ? Math.min(1, currentTime / duration) : 0

    // Stop any preview before leaving — the card stays mounted under Song Detail.
    const handleOpen = () => {
        stop()
        onOpen()
    }

    return (
        <Animated.View
            entering={FadeInDown.duration(420)}
            style={[styles.wrap, { bottom: 16 + lift }]}
            pointerEvents="box-none"
        >
            <BlurView intensity={32} tint="dark" style={[styles.card, { borderColor: colors.cline }]}>
                <Pressable style={styles.close} onPress={onClose} accessibilityLabel="Close" hitSlop={8}>
                    <CloseIcon />
                </Pressable>

                <Pressable
                    style={styles.row}
                    onPress={handleOpen}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${s.title}`}
                >
                    <View style={[styles.cover, { shadowColor: c, borderColor: c }]}>
                        {s.cover ? (
                            <Image source={{ uri: s.cover }} style={styles.coverImg} />
                        ) : (
                            <View style={[styles.coverFallback, { backgroundColor: c }]} />
                        )}
                    </View>

                    <View style={styles.meta}>
                        <View style={styles.metaTop}>
                            <View style={[styles.bucketChip, { backgroundColor: `${c}26`, borderColor: c }]}>
                                <View style={[styles.dot, { backgroundColor: c }]} />
                                <Text style={[styles.bucketChipText, { color: c }]} numberOfLines={1}>
                                    {bucketLabel(s.bucket).toUpperCase()}
                                </Text>
                            </View>
                            <Text style={styles.rankText} numberOfLines={1}>
                                RANK #{rank}
                                {rank === 1 ? " · YOUR SUN" : ""}
                            </Text>
                        </View>
                        <Text style={styles.title} numberOfLines={1}>
                            {s.title || "Untitled"}
                        </Text>
                        <Text style={styles.sub} numberOfLines={1}>
                            {(s.artist || "Unknown").toUpperCase()} · {s.genre.toUpperCase()}
                        </Text>

                        {showAudio ? (
                            <Pressable
                                style={styles.audioRow}
                                onPress={hasPreview ? toggle : undefined}
                                disabled={!hasPreview}
                                accessibilityRole="button"
                                accessibilityLabel={
                                    !hasPreview
                                        ? `Loading ${s.title} preview`
                                        : isPlaying
                                            ? `Pause ${s.title} preview`
                                            : `Play ${s.title} preview`
                                }
                            >
                                <View style={[styles.playBtn, { backgroundColor: c }]}>
                                    {loadingPreview ? (
                                        <ActivityIndicator size="small" color="#fff" />
                                    ) : isPlaying ? (
                                        <PauseIcon />
                                    ) : (
                                        <PlayIcon />
                                    )}
                                </View>
                                <View style={styles.progressTrack}>
                                    <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: c }]} />
                                </View>
                                <Text style={styles.time}>
                                    {fmtTime(currentTime)} / {fmtTime(dur)}
                                </Text>
                            </Pressable>
                        ) : null}
                    </View>

                    <View style={styles.scoreCol}>
                        <Text style={[styles.score, { color: c }]} adjustsFontSizeToFit numberOfLines={1}>
                            {s.score.toFixed(1)}
                        </Text>
                        <Text style={styles.distance} numberOfLines={2}>
                            {dist < 1.2 ? "AT YOUR CORE" : `${dist.toFixed(1)} FROM SUN`}
                        </Text>
                    </View>
                </Pressable>
            </BlurView>
        </Animated.View>
    )
}

const styles = StyleSheet.create({
    wrap: {
        position: "absolute",
        left: 12,
        right: 12,
        zIndex: 40,
    },
    card: {
        borderRadius: 20,
        borderWidth: 1,
        padding: 14,
        overflow: "hidden",
        backgroundColor: "rgba(18,22,32,0.9)",
        shadowColor: "#000",
        shadowOpacity: 0.55,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 16 },
    },
    close: {
        position: "absolute",
        top: 10,
        right: 10,
        width: 24,
        height: 24,
        borderRadius: 8,
        backgroundColor: "rgba(245,238,220,0.1)",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2,
    },
    row: { flexDirection: "row", gap: 13, alignItems: "center" },
    cover: {
        width: 74,
        height: 74,
        borderRadius: 14,
        overflow: "hidden",
        borderWidth: 1.5,
        shadowOpacity: 0.55,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 0 },
    },
    coverImg: { width: "100%", height: "100%" },
    coverFallback: { width: "100%", height: "100%", opacity: 0.5 },
    meta: { flex: 1, minWidth: 0, paddingRight: 14 },
    metaTop: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
    bucketChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 999,
        borderWidth: 1,
    },
    bucketChipText: { fontFamily: fonts.mono, fontSize: 8, fontWeight: "700", letterSpacing: 0.6 },
    dot: { width: 5, height: 5, borderRadius: 3 },
    rankText: { flexShrink: 1, fontFamily: fonts.mono, fontSize: 8, color: colors.cdim, letterSpacing: 0.6 },
    title: { fontFamily: fonts.serif, fontSize: 19, lineHeight: 21, color: colors.cream, marginTop: 5 },
    sub: { fontFamily: fonts.mono, fontSize: 8.5, color: colors.cdim, letterSpacing: 0.6, marginTop: 3 },
    audioRow: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 10 },
    playBtn: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: "center",
        justifyContent: "center",
    },
    progressTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: "rgba(245,238,220,0.16)", overflow: "hidden" },
    progressFill: { height: "100%", borderRadius: 2 },
    time: { fontFamily: fonts.mono, fontSize: 8.5, color: colors.cdim },
    scoreCol: { width: 54, alignItems: "flex-end", justifyContent: "center" },
    score: { fontFamily: fonts.display, fontSize: 38, lineHeight: 40, letterSpacing: 0 },
    distance: {
        fontFamily: fonts.mono,
        fontSize: 6.5,
        color: colors.cdim,
        letterSpacing: 0.7,
        marginTop: 3,
        maxWidth: 58,
        textAlign: "right",
    },
})
