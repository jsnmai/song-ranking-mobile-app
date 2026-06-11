// Bucket Selection — bottom sheet overlay over dimmed SongDetail.
// Layout: dim backdrop → sheet (drag handle → SongMini → BucketPreview → choice cards → note → Next)
import { useEffect, useRef, useState } from "react"
import {
    ActivityIndicator,
    Animated,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from "react-native"
import Svg, { Path, Rect, ClipPath, Defs, Circle } from "react-native-svg"
import { NativeStackScreenProps } from "@react-navigation/native-stack"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { ApiError } from "../../api/client"
import { useAudioPlayer } from "../../hooks/useAudioPlayer"
import { AppStackParamList } from "../../navigation/types"
import { colors, fonts, bucketColor } from "../../theme"
import { useAuth } from "../auth/AuthContext"
import { listMyRankings } from "../rankings/apiRequests"
import { finalizeRating, startComparisonSession } from "./apiRequests"
import { BucketName } from "./types"

type BucketSelectionProps = NativeStackScreenProps<AppStackParamList, "BucketSelection">

const BUCKETS: { name: BucketName; label: string }[] = [
    { name: "like", label: "Like" },
    { name: "alright", label: "Okay" },
    { name: "dislike", label: "Dislike" },
]

const HEART = "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"

function HeartDashedGlyph() {
    return (
        <Svg width={40} height={40} viewBox="0 0 24 24">
            <Path
                d={HEART}
                fill="none"
                stroke={colors.paper2}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="3 3"
            />
        </Svg>
    )
}

function HeartFull({ color }: { color: string }) {
    return (
        <Svg width={40} height={40} viewBox="0 0 24 24">
            <Path d={HEART} fill={color} />
        </Svg>
    )
}

function HeartHalf({ color }: { color: string }) {
    return (
        <Svg width={40} height={40} viewBox="0 0 24 24">
            <Defs>
                <ClipPath id="bso-lhalf">
                    <Rect x="0" y="0" width="12" height="24" />
                </ClipPath>
            </Defs>
            <Path d={HEART} fill="none" stroke={color} strokeWidth={1.5} />
            <Path d={HEART} fill={color} clipPath="url(#bso-lhalf)" />
        </Svg>
    )
}

function HeartBroken({ color }: { color: string }) {
    return (
        <Svg width={40} height={40} viewBox="0 0 24 24">
            <Path d={HEART} fill={color} />
            <Path
                d="M12 5.5 10 11h4l-2 5.5"
                stroke="white" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none"
            />
        </Svg>
    )
}

function BucketGlyph({ bucket, color }: { bucket: BucketName; color: string }) {
    if (bucket === "like") return <HeartFull color={color} />
    if (bucket === "alright") return <HeartHalf color={color} />
    return <HeartBroken color={color} />
}

function CheckIcon({ color }: { color: string }) {
    return (
        <Svg width={17} height={17} viewBox="0 0 24 24" fill="none"
            stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M20 6 9 17l-5-5" />
        </Svg>
    )
}

function EditIcon() {
    return (
        <Svg width={15} height={15} viewBox="0 0 24 24" fill="none"
            stroke={colors.inkDim} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <Path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z" />
        </Svg>
    )
}

function ForwardIcon() {
    return (
        <Svg width={17} height={17} viewBox="0 0 24 24" fill="none"
            stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <Path d="m9 18 6-6-6-6" />
        </Svg>
    )
}

const RING_SIZE = 46
const RING_R = 20
const RING_C = 2 * Math.PI * RING_R

const PREVIEW_MS = 30_000
const CX = RING_SIZE / 2

function ProgressRing({ progress, color }: { progress: number; color: string }) {
    const filled = RING_C * Math.max(0, Math.min(progress, 1))
    const gap = RING_C - filled
    return (
        <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
            {/* Track — always-visible faint full circle */}
            <Circle cx={CX} cy={CX} r={RING_R} fill="none" stroke={color} strokeWidth={2.5} strokeOpacity={0.18} />
            {/* Fill — grows from 12 o'clock clockwise */}
            <Circle
                cx={CX} cy={CX} r={RING_R}
                fill="none"
                stroke={color}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeDasharray={`${filled} ${gap}`}
                rotation={-90}
                originX={CX}
                originY={CX}
            />
        </Svg>
    )
}

function PlayIcon({ color }: { color: string }) {
    return (
        <Svg width={14} height={14} viewBox="0 0 24 24" fill={color}>
            <Path d="M5 3l14 9-14 9V3z" />
        </Svg>
    )
}

function PauseIcon({ color }: { color: string }) {
    return (
        <Svg width={14} height={14} viewBox="0 0 24 24" fill={color}>
            <Path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
        </Svg>
    )
}

export default function BucketSelectionScreen({ navigation, route }: BucketSelectionProps) {
    const { token } = useAuth()
    const { song } = route.params
    const insets = useSafeAreaInsets()
    const { height: screenH } = useWindowDimensions()
    const [selectedBucket, setSelectedBucket] = useState<BucketName | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [note, setNote] = useState("")
    const [error, setError] = useState<string | null>(null)
    const { isPlaying, toggle: toggleAudio, stop: stopAudio } = useAudioPlayer(song.preview_url)

    const backdropAnim = useRef(new Animated.Value(0)).current
    const sheetAnim = useRef(new Animated.Value(screenH)).current
    const isClosing = useRef(false)
    const [ringProgress, setRingProgress] = useState(0)
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

    // Entrance: backdrop fades in full-screen, sheet slides up independently
    useEffect(() => {
        Animated.parallel([
            Animated.timing(backdropAnim, { toValue: 1, duration: 260, useNativeDriver: true }),
            Animated.timing(sheetAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start()
    }, [])

    // Progress ring: fills from 0→1 over 30s while playing; resets on pause
    useEffect(() => {
        if (isPlaying) {
            setRingProgress(0)
            const start = Date.now()
            intervalRef.current = setInterval(() => {
                const p = (Date.now() - start) / PREVIEW_MS
                if (p >= 1) {
                    setRingProgress(1)
                    clearInterval(intervalRef.current!)
                } else {
                    setRingProgress(p)
                }
            }, 80)
        } else {
            if (intervalRef.current) clearInterval(intervalRef.current)
            setRingProgress(0)
        }
        return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
    }, [isPlaying])

    useEffect(() => {
        return navigation.addListener("blur", () => {
            stopAudio()
        })
    }, [navigation, stopAudio])

    const handleClose = () => {
        if (isClosing.current) return
        isClosing.current = true
        stopAudio()
        Animated.parallel([
            Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
            Animated.timing(sheetAnim, { toValue: screenH, duration: 220, useNativeDriver: true }),
        ]).start(() => navigation.goBack())
    }

    const handleBucketPress = (bucket: BucketName) => {
        if (isSubmitting) return
        setSelectedBucket(bucket)
        setError(null)
    }

    const handleContinue = async () => {
        if (!token || selectedBucket === null || isSubmitting) return

        setIsSubmitting(true)
        setError(null)
        try {
            const requiresComparison = await bucketRequiresComparison(selectedBucket, token)
            const ratingNote = note.trim().length > 0 ? note : undefined
            const ratingRequest = ratingNote === undefined
                ? { song, bucket: selectedBucket }
                : { song, bucket: selectedBucket, note: ratingNote }
            stopAudio()
            if (requiresComparison) {
                const session = await startComparisonSession(ratingRequest, token)
                navigation.replace("ComparisonFlow", { session })
                return
            }

            const result = await finalizeRating(ratingRequest, token)
            navigation.replace("ScoreReveal", { result })
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.detail)
            } else if (err instanceof Error) {
                setError(err.message)
            } else {
                setError("Could not rate this song.")
            }
        } finally {
            setIsSubmitting(false)
        }
    }

    const bucketRequiresComparison = async (bucket: BucketName, authToken: string): Promise<boolean> => {
        let cursor: string | undefined
        while (true) {
            const response = await listMyRankings(authToken, cursor)
            const hasOtherSongInBucket = response.rankings.some(
                (r) => r.bucket === bucket && r.song.deezer_id !== song.deezer_id,
            )
            if (hasOtherSongInBucket) return true
            if (response.next_cursor === null) return false
            cursor = response.next_cursor
        }
    }

    const selectedColor = selectedBucket ? bucketColor(selectedBucket) : null
    const maxSheetH = screenH * 0.82

    return (
        <View style={styles.root}>
            {/* Backdrop — fades in over full screen, never slides */}
            <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropAnim }]} />

            {/* Tap to dismiss */}
            <TouchableOpacity style={{ flex: 1 }} onPress={handleClose} activeOpacity={1} accessible={false} testID="bucket-selection-close" />

            {/* Sheet slides up independently */}
            <Animated.View style={{ transform: [{ translateY: sheetAnim }] }}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
                <View style={[styles.sheet, { maxHeight: maxSheetH, paddingBottom: insets.bottom + 12 }]}>
                    {/* Drag handle */}
                    <View style={styles.dragHandle} />

                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={styles.scrollContent}
                    >
                        {/* Song mini */}
                        <View style={styles.songMini}>
                            <View style={styles.artWrap}>
                                {song.cover_url ? (
                                    <Image source={{ uri: song.cover_url }} style={styles.art} />
                                ) : (
                                    <View style={[styles.art, { backgroundColor: colors.paper2 }]} />
                                )}
                            </View>
                            <View style={styles.songInfo}>
                                <Text style={styles.ratingKicker}>RATING</Text>
                                <Text style={styles.songTitle} numberOfLines={1}>{song.title}</Text>
                                <Text style={styles.songArtist} numberOfLines={1}>{song.artist}</Text>
                            </View>
                            {song.preview_url !== null && (
                                <View style={styles.playContainer}>
                                    <View style={styles.playRing}>
                                        <ProgressRing
                                            progress={isPlaying ? ringProgress : 1}
                                            color={selectedColor ?? colors.inkDim}
                                        />
                                    </View>
                                    <TouchableOpacity
                                        style={[styles.playDot, { borderColor: "transparent" }]}
                                        onPress={isPlaying ? stopAudio : toggleAudio}
                                        accessibilityRole="button"
                                        accessibilityLabel={isPlaying ? "Stop preview" : "Play preview"}
                                    >
                                        {isPlaying
                                            ? <PauseIcon color={selectedColor ?? colors.inkDim} />
                                            : <PlayIcon color={selectedColor ?? colors.inkDim} />
                                        }
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>

                        {/* Bucket preview — fixed height so selection never shifts layout */}
                        <View style={styles.bucketPreview}>
                            {selectedBucket !== null && selectedColor !== null
                                ? <BucketGlyph bucket={selectedBucket} color={selectedColor} />
                                : <HeartDashedGlyph />
                            }
                            <Text style={[
                                styles.bucketWord,
                                { color: selectedBucket !== null ? colors.ink : colors.paper2 },
                            ]}>
                                {selectedBucket !== null
                                    ? BUCKETS.find((b) => b.name === selectedBucket)?.label ?? ""
                                    : "—"
                                }
                            </Text>
                        </View>

                        {/* HOW DID IT LAND? */}
                        <Text style={styles.howKicker}>HOW DID IT LAND?</Text>

                        {/* Three choice cards */}
                        <View style={styles.choiceRow}>
                            {BUCKETS.map((bucket) => {
                                const accent = bucketColor(bucket.name)
                                const isSelected = selectedBucket === bucket.name
                                return (
                                    <TouchableOpacity
                                        key={bucket.name}
                                        style={[
                                            styles.choiceCard,
                                            isSelected && {
                                                backgroundColor: `${accent}14`,
                                                borderColor: accent,
                                            },
                                            isSubmitting && !isSelected && styles.choiceCardDisabled,
                                        ]}
                                        onPress={() => handleBucketPress(bucket.name)}
                                        disabled={isSubmitting}
                                        testID={`bucket-${bucket.name}`}
                                    >
                                        <View style={[
                                            styles.choiceCircle,
                                            { backgroundColor: isSelected ? accent : `${accent}22` },
                                        ]}>
                                            {isSelected
                                                ? <CheckIcon color="#fff" />
                                                : <View style={[styles.choiceDot, { backgroundColor: accent }]} />
                                            }
                                        </View>
                                        <Text style={styles.choiceLabel}>{bucket.label}</Text>
                                    </TouchableOpacity>
                                )
                            })}
                        </View>

                        {/* Note field */}
                        <View style={styles.noteField}>
                            <EditIcon />
                            <TextInput
                                value={note}
                                onChangeText={setNote}
                                multiline
                                maxLength={280}
                                editable={!isSubmitting}
                                placeholder="Add a note…"
                                placeholderTextColor={colors.inkDim}
                                style={styles.noteInput}
                                scrollEnabled={false}
                            />
                        </View>

                        {error !== null && <Text style={styles.errorText}>{error}</Text>}

                        {/* Next → */}
                        <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityState={{ disabled: selectedBucket === null || isSubmitting }}
                            style={[
                                styles.nextButton,
                                selectedBucket !== null && !isSubmitting && {
                                    backgroundColor: selectedColor ?? colors.accent,
                                },
                                (selectedBucket === null || isSubmitting) && styles.nextButtonDisabled,
                            ]}
                            onPress={handleContinue}
                            disabled={selectedBucket === null || isSubmitting}
                        >
                            {isSubmitting ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <>
                                    <Text style={styles.nextButtonText}>Next</Text>
                                    <ForwardIcon />
                                </>
                            )}
                        </TouchableOpacity>
                        <Text style={styles.nextCaption}>WE'LL PLACE IT WITH A FEW COMPARISONS</Text>
                    </ScrollView>
                </View>
            </KeyboardAvoidingView>
            </Animated.View>
        </View>
    )
}

const styles = StyleSheet.create({
    // ── Root (transparent — SongDetail shows through) ────────────────────────
    root: {
        flex: 1,
        backgroundColor: "transparent",
        justifyContent: "flex-end",
    },
    backdrop: {
        backgroundColor: "rgba(0,0,0,0.52)",
    },
    // ── Sheet ────────────────────────────────────────────────────────────────
    sheet: {
        backgroundColor: colors.paper,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        shadowColor: "#000",
        shadowOpacity: 0.28,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: -6 },
        elevation: 16,
    },
    dragHandle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: colors.line,
        alignSelf: "center",
        marginTop: 10,
        marginBottom: 6,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 4,
        paddingBottom: 8,
    },
    // ── Song mini ────────────────────────────────────────────────────────────
    songMini: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        marginBottom: 14,
    },
    artWrap: {
        width: 46,
        height: 46,
        borderRadius: 11,
        overflow: "hidden",
        flexShrink: 0,
        shadowColor: colors.ink,
        shadowOpacity: 0.18,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
    },
    art: {
        width: "100%",
        height: "100%",
    },
    songInfo: {
        flex: 1,
        minWidth: 0,
    },
    ratingKicker: {
        fontFamily: fonts.mono,
        fontSize: 8,
        letterSpacing: 2.4,
        color: colors.inkDim,
        fontWeight: "700",
    },
    songTitle: {
        fontFamily: fonts.display,
        fontSize: 17,
        color: colors.ink,
        marginTop: 3,
    },
    songArtist: {
        fontSize: 11,
        color: colors.inkDim,
        marginTop: 1,
    },
    playContainer: {
        width: RING_SIZE,
        height: RING_SIZE,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    playRing: {
        position: "absolute",
    },
    playDot: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: "#fff",
        alignItems: "center",
        justifyContent: "center",
        shadowColor: colors.ink,
        shadowOpacity: 0.14,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
    },
    // ── Large bucket preview ─────────────────────────────────────────────────
    bucketPreview: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginBottom: 14,
        height: 52,
    },
    bucketWord: {
        fontFamily: fonts.display,
        fontSize: 48,
        lineHeight: 44,
        letterSpacing: -1,
        color: colors.ink,
    },
    // ── HOW DID IT LAND? ─────────────────────────────────────────────────────
    howKicker: {
        fontFamily: fonts.mono,
        fontSize: 9,
        letterSpacing: 2.8,
        color: colors.inkDim,
        fontWeight: "700",
        marginBottom: 10,
    },
    // ── Choice cards ─────────────────────────────────────────────────────────
    choiceRow: {
        flexDirection: "row",
        gap: 10,
        marginBottom: 14,
    },
    choiceCard: {
        flex: 1,
        alignItems: "center",
        gap: 9,
        paddingVertical: 14,
        paddingHorizontal: 8,
        borderRadius: 16,
        backgroundColor: colors.bg,
        borderWidth: 1.5,
        borderColor: colors.line,
    },
    choiceCardDisabled: {
        opacity: 0.5,
    },
    choiceCircle: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: "center",
        justifyContent: "center",
    },
    choiceDot: {
        width: 11,
        height: 11,
        borderRadius: 6,
    },
    choiceLabel: {
        fontFamily: fonts.display,
        fontSize: 13,
        color: colors.ink,
    },
    // ── Note field ───────────────────────────────────────────────────────────
    noteField: {
        flexDirection: "row",
        alignItems: "center",
        gap: 9,
        backgroundColor: colors.bg,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 12,
        paddingHorizontal: 13,
        minHeight: 46,
        marginBottom: 16,
    },
    noteInput: {
        flex: 1,
        fontSize: 15,
        color: colors.ink,
        paddingVertical: 12,
    },
    // ── Error ─────────────────────────────────────────────────────────────────
    errorText: {
        color: colors.danger,
        fontSize: 14,
        marginBottom: 14,
        textAlign: "center",
    },
    // ── Next button ───────────────────────────────────────────────────────────
    nextButton: {
        height: 52,
        borderRadius: 14,
        backgroundColor: colors.accent,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 9,
        shadowColor: colors.ink,
        shadowOpacity: 0.22,
        shadowRadius: 0,
        shadowOffset: { width: 3, height: 3 },
        elevation: 4,
    },
    nextButtonDisabled: {
        backgroundColor: colors.sand,
        shadowOpacity: 0,
        elevation: 0,
    },
    nextButtonText: {
        fontFamily: fonts.display,
        color: "#fff",
        fontSize: 15,
    },
    nextCaption: {
        fontFamily: fonts.mono,
        fontSize: 8,
        letterSpacing: 1.8,
        color: colors.inkDim,
        textAlign: "center",
        marginTop: 10,
    },
})
