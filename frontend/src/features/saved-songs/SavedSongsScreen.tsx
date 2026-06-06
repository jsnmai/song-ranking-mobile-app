import { useCallback, useEffect, useState } from "react"
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { FlashList } from "@shopify/flash-list"
import { NativeStackScreenProps } from "@react-navigation/native-stack"

import { ApiError } from "../../api/client"
import BucketBadge from "../../components/BucketBadge"
import { AppStackParamList } from "../../navigation/types"
import { colors, fonts } from "../../theme"
import { formatRelativeTime } from "../../utils/formatRelativeTime"
import { useAuth } from "../auth/AuthContext"
import { listMySavedSongs } from "./apiRequests"
import { SavedSong } from "./types"

type SavedSongsScreenProps = NativeStackScreenProps<AppStackParamList, "SavedSongs">

export default function SavedSongsScreen({ navigation }: SavedSongsScreenProps) {
    const { token } = useAuth()
    const [saves, setSaves] = useState<SavedSong[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const loadSaves = useCallback(async () => {
        if (!token) {
            setIsLoading(false)
            return
        }
        setIsLoading(true)
        setError(null)
        try {
            const response = await listMySavedSongs(token)
            setSaves(response.saves)
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.detail)
            } else if (err instanceof Error) {
                setError(err.message)
            } else {
                setError("Saved Songs is temporarily unavailable.")
            }
        } finally {
            setIsLoading(false)
        }
    }, [token])

    const openSong = (save: SavedSong) => {
        if (save.ranking !== null) {
            navigation.navigate("SongDetail", { ranking: save.ranking })
            return
        }
        navigation.navigate("SongDetail", { song: save.song })
    }

    useEffect(() => {
        loadSaves()
    }, [loadSaves])

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>
                <Text style={styles.kicker}>SAVE FOR LATER</Text>
                <Text style={styles.heading}>Saved Songs</Text>
                <Text style={styles.subheading}>Songs saved for later. Private, free, and unlimited.</Text>
            </View>

            {isLoading ? (
                <ActivityIndicator accessibilityLabel="Loading Saved Songs" color={colors.clay} style={styles.status} />
            ) : error !== null ? (
                <View style={styles.centerState}>
                    <Text style={styles.error}>{error}</Text>
                    <TouchableOpacity style={styles.retryButton} onPress={loadSaves}>
                        <Text style={styles.retryText}>Try again</Text>
                    </TouchableOpacity>
                </View>
            ) : saves.length === 0 ? (
                <Text style={styles.empty}>Songs you save will show up here.</Text>
            ) : (
                <FlashList
                    data={saves}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel={`Open ${item.song.title}`}
                            style={styles.row}
                            onPress={() => openSong(item)}
                            activeOpacity={0.8}
                        >
                            <View style={styles.coverFrame}>
                                {item.song.cover_url ? (
                                    <Image source={{ uri: item.song.cover_url }} style={styles.cover} />
                                ) : null}
                            </View>
                            <View style={styles.songText}>
                                <Text style={styles.title} numberOfLines={1}>{item.song.title}</Text>
                                <Text style={styles.artist} numberOfLines={1}>{item.song.artist}</Text>
                                <Text style={styles.savedAt}>{formatRelativeTime(item.saved_at)}</Text>
                            </View>
                            {item.ranking !== null ? <BucketBadge bucket={item.ranking.bucket} /> : null}
                        </TouchableOpacity>
                    )}
                    keyExtractor={(item) => item.id.toString()}
                    contentContainerStyle={styles.listContent}
                />
            )}
        </View>
    )
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
        fontFamily: fonts.mono,
        color: colors.ink,
        fontSize: 13,
    },
    empty: {
        color: colors.inkDim,
        fontSize: 15,
        marginTop: 42,
        textAlign: "center",
    },
    listContent: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 28,
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 12,
        padding: 12,
        marginBottom: 9,
        gap: 12,
    },
    coverFrame: {
        width: 48,
        height: 48,
        borderRadius: 8,
        backgroundColor: colors.sand,
        overflow: "hidden",
    },
    cover: {
        width: "100%",
        height: "100%",
    },
    songText: {
        flex: 1,
        minWidth: 0,
    },
    title: {
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
    savedAt: {
        fontFamily: fonts.mono,
        color: colors.inkDim,
        fontSize: 9,
        marginTop: 5,
    },
})
