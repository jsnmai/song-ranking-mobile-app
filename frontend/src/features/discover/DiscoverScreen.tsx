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
import { searchProfiles } from "../profile/apiRequests"
import { Profile } from "../profile/types"
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
    const [searchMode, setSearchMode] = useState<"songs" | "users">(route.params?.searchMode ?? "songs")
    const [query, setQuery] = useState("")
    const [songResults, setSongResults] = useState<SongSearchResult[]>([])
    const [profileResults, setProfileResults] = useState<Profile[]>([])
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

    const handleProfilePress = (profile: Profile) => {
        if (profile.is_own_profile) {
            navigation.navigate("MainTabs", { screen: "Profile" })
            return
        }
        navigation.navigate("OtherProfile", { username: profile.username })
    }

    const setMode = (mode: "songs" | "users") => {
        setSearchMode(mode)
        setSongResults([])
        setProfileResults([])
        setError(null)
    }

    // Auto-focus the search bar when navigated here via the FAB.
    // After focusing, reset the param so a normal tab press later does not re-trigger focus.
    useEffect(() => {
        if (route.params?.searchMode) {
            setMode(route.params.searchMode)
            navigation.setParams({ searchMode: undefined })
        }
        if (route.params?.focusSearch) {
            searchRef.current?.focus()
            navigation.setParams({ focusSearch: undefined })
        }
    }, [route.params?.focusSearch, route.params?.searchMode, navigation])

    // Debounce means wait for typing to pause before searching, instead of firing one request per keypress.
    useEffect(() => {
        const trimmedQuery = query.trim()
        if (trimmedQuery.length === 0) {
            setSongResults([])
            setProfileResults([])
            setError(null)
            setIsLoading(false)
            return
        }

        if (trimmedQuery.length < 2) {
            setSongResults([])
            setProfileResults([])
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
                if (searchMode === "songs") {
                    const response = await searchSongs(trimmedQuery, token)
                    if (isCurrentSearch) {
                        setSongResults(response.results)
                        setProfileResults([])
                    }
                } else {
                    const response = await searchProfiles(trimmedQuery, token)
                    if (isCurrentSearch) {
                        setProfileResults(response.results)
                        setSongResults([])
                    }
                }
            } catch (err) {
                if (isCurrentSearch) {
                    setSongResults([])
                    setProfileResults([])
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
    }, [query, searchMode, token])

    return (
        <View style={styles.container}>
            <View style={styles.searchRow}>
                <View style={styles.modeRow}>
                    <TouchableOpacity
                        style={[styles.modeButton, searchMode === "songs" ? styles.activeModeButton : null]}
                        onPress={() => setMode("songs")}
                    >
                        <Text style={[styles.modeText, searchMode === "songs" ? styles.activeModeText : null]}>Songs</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.modeButton, searchMode === "users" ? styles.activeModeButton : null]}
                        onPress={() => setMode("users")}
                    >
                        <Text style={[styles.modeText, searchMode === "users" ? styles.activeModeText : null]}>Users</Text>
                    </TouchableOpacity>
                </View>
                <TextInput
                    ref={searchRef}
                    style={styles.searchBar}
                    placeholder={searchMode === "songs" ? "Search for a song..." : "Search for a user..."}
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
                    <Text style={styles.emptyText}>
                        {searchMode === "songs" ? "Search for a song to start ranking." : "Search for users to follow."}
                    </Text>
                )}
                {!isLoading && error === null && query.trim().length >= 2 && searchMode === "songs" && songResults.length === 0 && (
                    <Text style={styles.emptyText}>No songs found.</Text>
                )}
                {!isLoading && error === null && query.trim().length >= 2 && searchMode === "users" && profileResults.length === 0 && (
                    <Text style={styles.emptyText}>No users found.</Text>
                )}
                {!isLoading && error === null && searchMode === "songs" && songResults.map((song) => (
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
                {!isLoading && error === null && searchMode === "users" && profileResults.map((profile) => (
                    <TouchableOpacity
                        key={profile.id}
                        style={styles.resultRow}
                        onPress={() => handleProfilePress(profile)}
                        activeOpacity={0.75}
                    >
                        <View style={styles.avatar}>
                            <Text style={styles.avatarText}>{profile.display_name.slice(0, 1).toUpperCase()}</Text>
                        </View>
                        <View style={styles.songText}>
                            <Text style={styles.title} numberOfLines={1}>{profile.display_name}</Text>
                            <Text style={styles.artist} numberOfLines={1}>@{profile.username}</Text>
                            <Text style={styles.album} numberOfLines={1}>
                                {profile.follower_count} followers, {profile.following_count} following
                            </Text>
                        </View>
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
    modeRow: {
        flexDirection: "row",
        backgroundColor: "#111",
        borderRadius: 8,
        padding: 3,
        marginBottom: 12,
    },
    modeButton: {
        flex: 1,
        alignItems: "center",
        paddingVertical: 8,
        borderRadius: 6,
    },
    activeModeButton: {
        backgroundColor: "#fff",
    },
    modeText: {
        color: "#888",
        fontSize: 14,
        fontWeight: "700",
    },
    activeModeText: {
        color: "#000",
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
    avatar: {
        width: 56,
        height: 56,
        borderRadius: 28,
        marginRight: 12,
        backgroundColor: "#1f1f1f",
        alignItems: "center",
        justifyContent: "center",
    },
    avatarText: {
        color: "#fff",
        fontSize: 20,
        fontWeight: "700",
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
