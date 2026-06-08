// Discover tab — houses song search, recommendations, and trending in later phases.
// Phase 3 wires the search bar to LISTn's backend Deezer proxy.
// The search bar auto-focuses when the user navigates here via the FAB.
import { useEffect, useRef, useState } from "react"
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native"
import { CompositeNavigationProp, useNavigation, useRoute, RouteProp } from "@react-navigation/native"
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"

import { ApiError } from "../../api/client"
import StarAvatar from "../../components/StarAvatar"
import { AppStackParamList, TabParamList } from "../../navigation/types"
import { colors, fonts } from "../../theme"
import { useAuth } from "../auth/AuthContext"
import { searchProfiles } from "../profile/apiRequests"
import { Profile } from "../profile/types"
import { getMyRankingByDeezerId } from "../rankings/apiRequests"
import { searchSongs } from "../search/apiRequests"
import { SongSearchResult } from "../search/types"
import { listCoSigns, listFriendsNines } from "./apiRequests"
import SocialDiscoveryCard from "./SocialDiscoveryCard"
import { CoSignItem, FriendsNineItem } from "./types"

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
    const [coSigns, setCoSigns] = useState<CoSignItem[]>([])
    const [friendsNines, setFriendsNines] = useState<FriendsNineItem[]>([])
    const [isDiscoveryLoading, setIsDiscoveryLoading] = useState(false)
    const [discoveryError, setDiscoveryError] = useState<string | null>(null)

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

    const handleDiscoverySongPress = (item: CoSignItem | FriendsNineItem) => {
        navigation.navigate("SongDetail", { song: item.song })
    }

    const handleRatePress = (item: CoSignItem | FriendsNineItem) => {
        navigation.navigate("BucketSelection", { song: item.song })
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

    useEffect(() => {
        if (!token) {
            return
        }
        let isCurrentRequest = true
        setIsDiscoveryLoading(true)
        setDiscoveryError(null)
        Promise.all([
            listCoSigns(token),
            listFriendsNines(token),
        ])
            .then(([coSignResponse, friendsNinesResponse]) => {
                if (isCurrentRequest) {
                    setCoSigns(coSignResponse.items)
                    setFriendsNines(friendsNinesResponse.items)
                }
            })
            .catch((err) => {
                if (isCurrentRequest) {
                    setDiscoveryError(err instanceof ApiError ? err.detail : "Social discovery is temporarily unavailable.")
                }
            })
            .finally(() => {
                if (isCurrentRequest) {
                    setIsDiscoveryLoading(false)
                }
            })
        return () => {
            isCurrentRequest = false
        }
    }, [token])

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.kicker}>DISCOVER</Text>
                <Text style={styles.heading}>Find music</Text>
                <View style={styles.modeRow}>
                    <TouchableOpacity
                        style={[styles.modeButton, searchMode === "songs" ? styles.activeModeButton : null]}
                        onPress={() => setMode("songs")}
                    >
                        <Text style={[styles.modeText, searchMode === "songs" ? styles.activeModeText : null]}>
                            Songs
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.modeButton, searchMode === "users" ? styles.activeModeButton : null]}
                        onPress={() => setMode("users")}
                    >
                        <Text style={[styles.modeText, searchMode === "users" ? styles.activeModeText : null]}>
                            Users
                        </Text>
                    </TouchableOpacity>
                </View>
                <TextInput
                    ref={searchRef}
                    style={styles.searchBar}
                    placeholder={searchMode === "songs" ? "Search for a song..." : "Search for a user..."}
                    placeholderTextColor={colors.inkDim}
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
                {isLoading && <ActivityIndicator color={colors.clay} style={styles.status} />}
                {!isLoading && error !== null && <Text style={styles.errorText}>{error}</Text>}
                {!isLoading && error === null && query.trim().length === 0 && searchMode === "users" && (
                    <Text style={styles.emptyText}>Search for users to follow.</Text>
                )}
                {!isLoading && error === null && query.trim().length === 0 && searchMode === "songs" && (
                    <>
                        {isDiscoveryLoading && <ActivityIndicator color={colors.clay} style={styles.status} />}
                        {!isDiscoveryLoading && discoveryError && <Text style={styles.errorText}>{discoveryError}</Text>}
                        {!isDiscoveryLoading && !discoveryError && (
                            <>
                                <Text style={styles.sectionTitle}>Co-Signed by friends</Text>
                                {coSigns.length === 0
                                    ? <Text style={styles.sectionEmpty}>No Co-Signs yet.</Text>
                                    : coSigns.map((item) => (
                                        <SocialDiscoveryCard
                                            key={`co-sign-${item.song.id}`}
                                            item={item}
                                            kind="co-sign"
                                            token={token ?? ""}
                                            onOpen={() => handleDiscoverySongPress(item)}
                                            onRate={() => handleRatePress(item)}
                                        />
                                    ))}
                                <Text style={styles.sectionTitle}>Friends’ 9s</Text>
                                {friendsNines.length === 0
                                    ? <Text style={styles.sectionEmpty}>No friends’ high scores yet.</Text>
                                    : friendsNines.map((item) => (
                                        <SocialDiscoveryCard
                                            key={`friends-nine-${item.song.id}`}
                                            item={item}
                                            kind="friends-nine"
                                            token={token ?? ""}
                                            onOpen={() => handleDiscoverySongPress(item)}
                                            onRate={() => handleRatePress(item)}
                                        />
                                    ))}
                            </>
                        )}
                    </>
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
                        <View style={styles.coverFrame}>
                            {song.cover_url ? (
                                <Image source={{ uri: song.cover_url }} style={styles.coverImage} />
                            ) : null}
                        </View>
                        <View style={styles.resultText}>
                            <Text style={styles.title} numberOfLines={1}>{song.title}</Text>
                            <Text style={styles.artist} numberOfLines={1}>{song.artist}</Text>
                            <Text style={styles.album} numberOfLines={1}>{song.album}</Text>
                        </View>
                        {openingDeezerId === song.deezer_id && (
                            <ActivityIndicator color={colors.clay} style={styles.rowSpinner} />
                        )}
                    </TouchableOpacity>
                ))}
                {!isLoading && error === null && searchMode === "users" && profileResults.map((profile) => (
                    <TouchableOpacity
                        key={profile.id}
                        style={styles.resultRow}
                        onPress={() => handleProfilePress(profile)}
                        activeOpacity={0.75}
                    >
                        <StarAvatar
                            initial={(profile.display_name || profile.username).charAt(0)}
                            outerColor={colors.clay}
                            size={44}
                        />
                        <View style={styles.resultText}>
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

const cardShadow = {
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.bg,
    },
    header: {
        paddingTop: 60,
        paddingHorizontal: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
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
        fontSize: 32,
        lineHeight: 36,
        marginBottom: 16,
    },
    modeRow: {
        flexDirection: "row",
        backgroundColor: colors.paper,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.line,
        padding: 3,
        marginBottom: 12,
        overflow: "hidden",
    },
    modeButton: {
        flex: 1,
        alignItems: "center",
        paddingVertical: 10,
        borderRadius: 7,
    },
    activeModeButton: {
        backgroundColor: colors.sand,
    },
    modeText: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 12,
        letterSpacing: 0.4,
    },
    activeModeText: {
        color: colors.ink,
    },
    searchBar: {
        backgroundColor: colors.sand,
        color: colors.ink,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.line,
        paddingHorizontal: 14,
        paddingVertical: 10,
        fontSize: 16,
    },
    results: {
        flex: 1,
    },
    resultsContent: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 24,
    },
    status: {
        marginTop: 40,
    },
    emptyText: {
        color: colors.inkDim,
        fontSize: 15,
        marginTop: 40,
        textAlign: "center",
        paddingHorizontal: 12,
        lineHeight: 22,
    },
    errorText: {
        color: colors.dislike,
        fontSize: 15,
        marginTop: 40,
        textAlign: "center",
        paddingHorizontal: 12,
        lineHeight: 22,
    },
    resultRow: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.paper,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.line,
        padding: 12,
        marginBottom: 8,
        gap: 12,
        ...cardShadow,
    },
    coverFrame: {
        width: 52,
        height: 52,
        borderRadius: 8,
        backgroundColor: colors.sand,
        overflow: "hidden",
    },
    coverImage: {
        width: "100%",
        height: "100%",
    },
    resultText: {
        flex: 1,
        minWidth: 0,
    },
    title: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 16,
        lineHeight: 20,
        marginBottom: 3,
    },
    artist: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 13,
        marginBottom: 2,
    },
    album: {
        fontFamily: fonts.mono,
        color: colors.inkDim,
        fontSize: 11,
    },
    rowSpinner: {
        marginLeft: 4,
    },
    sectionTitle: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 20,
        marginTop: 10,
        marginBottom: 10,
    },
    sectionEmpty: {
        color: colors.inkDim,
        fontSize: 13,
        marginBottom: 18,
    },
})
