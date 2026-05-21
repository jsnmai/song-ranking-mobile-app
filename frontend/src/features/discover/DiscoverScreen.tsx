// Discover tab — houses song search, recommendations, and trending in later phases.
// Phase 3 wires the search bar to LISTn's backend Deezer proxy.
// The search bar auto-focuses when the user navigates here via the FAB.
import { useEffect, useRef, useState } from "react"
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native"
import { CompositeNavigationProp, useNavigation, useRoute, RouteProp } from "@react-navigation/native"
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"

import { ApiError } from "../../api/client"
import { AppStackParamList, TabParamList } from "../../navigation/types"
import { useAuth } from "../auth/AuthContext"
import { getMyRankingByDeezerId } from "../rankings/apiRequests"
import { searchSongs } from "../search/apiRequests"
import { SongSearchResult } from "../search/types"

// RouteProp<ParamList, ScreenName> gives the type of route.params for a specific screen.
type DiscoverRouteProp = RouteProp<TabParamList, "Discover">
type DiscoverNavigationProp = CompositeNavigationProp<
    BottomTabNavigationProp<TabParamList, "Discover">,
    NativeStackNavigationProp<AppStackParamList>
>

export default function DiscoverScreen() {
    const route = useRoute<DiscoverRouteProp>()
    const navigation = useNavigation<DiscoverNavigationProp>()
    const { token } = useAuth()
    // useRef holds a reference to the TextInput DOM node so we can call .focus() imperatively.
    const searchRef = useRef<TextInput>(null)
    const [query, setQuery] = useState("")
    const [results, setResults] = useState<SongSearchResult[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [openingDeezerId, setOpeningDeezerId] = useState<number | null>(null)
    const [error, setError] = useState<string | null>(null)

    const handleSongPress = async (song: SongSearchResult) => {
        if (!token || openingDeezerId !== null) {
            return
        }

        setOpeningDeezerId(song.deezer_id)
        setError(null)

        try {
            const ranking = await getMyRankingByDeezerId(song.deezer_id, token)
            navigation.navigate("SongDetail", { ranking })
        } catch (err) {
            if (err instanceof ApiError && err.status === 404) {
                navigation.navigate("SongDetail", { song })
                return
            }

            if (err instanceof ApiError) {
                setError(err.detail)
            } else if (err instanceof Error) {
                setError(err.message)
            } else {
                setError("Could not open this song.")
            }
        } finally {
            setOpeningDeezerId(null)
        }
    }

    // Auto-focus the search bar when navigated here via the FAB.
    // After focusing, reset the param so a normal tab press later does not re-trigger focus.
    useEffect(() => {
        if (route.params?.focusSearch) {
            searchRef.current?.focus()
            navigation.setParams({ focusSearch: undefined })
        }
    }, [route.params?.focusSearch, navigation])

    // Debounce means wait for typing to pause before searching, instead of firing one request per keypress.
    useEffect(() => {
        const trimmedQuery = query.trim()
        if (trimmedQuery.length === 0) {
            setResults([])
            setError(null)
            setIsLoading(false)
            return
        }

        if (trimmedQuery.length < 2) {
            setResults([])
            setError("Type at least 2 characters.")
            setIsLoading(false)
            return
        }

        if (!token) {
            return
        }

        let isCurrentSearch = true
        const timeoutId = setTimeout(async () => {
            setIsLoading(true)
            setError(null)

            try {
                const response = await searchSongs(trimmedQuery, token)
                if (isCurrentSearch) {
                    setResults(response.results)
                }
            } catch (err) {
                if (isCurrentSearch) {
                    setResults([])
                    if (err instanceof ApiError) {
                        setError(err.detail)
                    } else if (err instanceof Error) {
                        setError(err.message)
                    } else {
                        setError("Search is temporarily unavailable.")
                    }
                }
            } finally {
                if (isCurrentSearch) {
                    setIsLoading(false)
                }
            }
        }, 350)

        return () => {
            isCurrentSearch = false
            clearTimeout(timeoutId)
        }
    }, [query, token])

    return (
        <View style={styles.container}>
            <View style={styles.searchRow}>
                <TextInput
                    ref={searchRef}
                    style={styles.searchBar}
                    placeholder="Search for a song..."
                    placeholderTextColor="#555"
                    value={query}
                    onChangeText={setQuery}
                    autoCapitalize="none"
                    returnKeyType="search"
                />
            </View>
            <ScrollView
                style={styles.results}
                contentContainerStyle={styles.resultsContent}
                keyboardShouldPersistTaps="handled"
            >
                {isLoading && <ActivityIndicator color="#fff" style={styles.status} />}
                {!isLoading && error !== null && <Text style={styles.errorText}>{error}</Text>}
                {!isLoading && error === null && query.trim().length === 0 && (
                    <Text style={styles.emptyText}>Search for a song to start ranking.</Text>
                )}
                {!isLoading && error === null && query.trim().length >= 2 && results.length === 0 && (
                    <Text style={styles.emptyText}>No songs found.</Text>
                )}
                {!isLoading && error === null && results.map((song) => (
                    <TouchableOpacity
                        key={song.deezer_id}
                        style={styles.resultRow}
                        onPress={() => handleSongPress(song)}
                        disabled={openingDeezerId !== null}
                        activeOpacity={0.75}
                    >
                        {song.cover_url ? (
                            <Image source={{ uri: song.cover_url }} style={styles.cover} />
                        ) : (
                            <View style={styles.coverPlaceholder} />
                        )}
                        <View style={styles.songText}>
                            <Text style={styles.title} numberOfLines={1}>{song.title}</Text>
                            <Text style={styles.artist} numberOfLines={1}>{song.artist}</Text>
                            <Text style={styles.album} numberOfLines={1}>{song.album}</Text>
                        </View>
                        {openingDeezerId === song.deezer_id && <ActivityIndicator color="#fff" />}
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#000",
    },
    searchRow: {
        paddingTop: 60,
        paddingHorizontal: 16,
        paddingBottom: 12,
    },
    searchBar: {
        backgroundColor: "#1a1a1a",
        color: "#fff",
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        fontSize: 16,
    },
    results: {
        flex: 1,
    },
    resultsContent: {
        paddingHorizontal: 16,
        paddingBottom: 24,
    },
    status: {
        marginTop: 40,
    },
    emptyText: {
        color: "#777",
        fontSize: 15,
        marginTop: 40,
        textAlign: "center",
    },
    errorText: {
        color: "#ff6b6b",
        fontSize: 15,
        marginTop: 40,
        textAlign: "center",
    },
    resultRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#1f1f1f",
    },
    cover: {
        width: 56,
        height: 56,
        borderRadius: 6,
        marginRight: 12,
    },
    coverPlaceholder: {
        width: 56,
        height: 56,
        borderRadius: 6,
        marginRight: 12,
        backgroundColor: "#1a1a1a",
    },
    songText: {
        flex: 1,
    },
    title: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "600",
        marginBottom: 3,
    },
    artist: {
        color: "#b8b8b8",
        fontSize: 14,
        marginBottom: 3,
    },
    album: {
        color: "#777",
        fontSize: 13,
    },
})
