// Discover tab — song search, user search, and social discovery sections.
import { useCallback, useEffect, useRef, useState } from "react"
import {
    ActivityIndicator,
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native"
import Animated, {
    FadeInDown,
    FadeInRight,
    FadeOut,
    FadeOutRight,
    LinearTransition,
} from "react-native-reanimated"
import { CompositeNavigationProp, useFocusEffect, useNavigation, useRoute, RouteProp } from "@react-navigation/native"
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"
import * as SecureStore from "expo-secure-store"
import Svg, { Circle, Path } from "react-native-svg"

import { ApiError } from "../../api/client"
import { AppStackParamList, DiscoverStackParamList, TabParamList } from "../../navigation/types"
import { bucketColor, colors, fonts } from "../../theme"
import { useAuth } from "../auth/AuthContext"
import { followUser, getMostCompatible, searchProfiles, unfollowUser } from "../profile/apiRequests"
import { MostCompatibleItem, Profile } from "../profile/types"
import { getMyRankingByDeezerId } from "../rankings/apiRequests"
import { searchSongs } from "../search/apiRequests"
import { SongSearchResult } from "../search/types"
import { listCoSigns } from "./apiRequests"
import SocialDiscoveryCard from "./SocialDiscoveryCard"
import { CoSignItem } from "./types"

const RECENT_KEY = "discover_recent_searches"

type DiscoverRouteProp = RouteProp<DiscoverStackParamList, "DiscoverHome">
type DiscoverNavigationProp = CompositeNavigationProp<
    NativeStackNavigationProp<DiscoverStackParamList, "DiscoverHome">,
    CompositeNavigationProp<
        BottomTabNavigationProp<TabParamList, "Discover">,
        NativeStackNavigationProp<AppStackParamList>
    >
>

function SearchIcon({ size = 16 }: { size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke={colors.inkSoft} strokeWidth={1.9} strokeLinecap="round">
            <Circle cx={11} cy={11} r={7} />
            <Path d="m20 20-3.4-3.4" />
        </Svg>
    )
}

function PersonIcon() {
    return (
        <Svg width={11} height={11} viewBox="0 0 24 24" fill="none">
            <Circle cx="12" cy="8" r="4" stroke={colors.inkSoft} strokeWidth={2} strokeLinecap="round" />
            <Path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" stroke={colors.inkSoft} strokeWidth={2} strokeLinecap="round" />
        </Svg>
    )
}

function MiniSearchIcon() {
    return (
        <Svg width={11} height={11} viewBox="0 0 24 24" fill="none">
            <Circle cx={11} cy={11} r={7} stroke={colors.inkSoft} strokeWidth={2} />
            <Path d="m20 20-3.4-3.4" stroke={colors.inkSoft} strokeWidth={2} strokeLinecap="round" />
        </Svg>
    )
}

type RecentEntry = { query: string; mode: "songs" | "users" }

// Deterministic avatar background per user, matching the follow-list palette.
const AVATAR_COLORS = [colors.accent, colors.sky, colors.plum, colors.mint, colors.gold]

function avatarColor(username: string): string {
    let hash = 0
    for (let i = 0; i < username.length; i++) {
        hash = (hash * 31 + username.charCodeAt(i)) % 997
    }
    return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

// Render text with the matched query substring highlighted in accent.
function HighlightedText({
    text,
    query,
    style,
}: {
    text: string
    query: string
    style: object
}) {
    const i = query.length > 0 ? text.toLowerCase().indexOf(query.toLowerCase()) : -1
    if (i < 0) {
        return <Text style={style} numberOfLines={1}>{text}</Text>
    }
    return (
        <Text style={style} numberOfLines={1}>
            {text.slice(0, i)}
            <Text style={{ color: colors.accent }}>{text.slice(i, i + query.length)}</Text>
            {text.slice(i + query.length)}
        </Text>
    )
}

export default function DiscoverScreen() {
    const route = useRoute<DiscoverRouteProp>()
    const navigation = useNavigation<DiscoverNavigationProp>()
    const { token, profile } = useAuth()
    const avatarInitial = (profile?.display_name || profile?.username || "?").charAt(0).toUpperCase()
    const searchRef = useRef<TextInput>(null)
    const [searchFocused, setSearchFocused] = useState(false)
    const [searchMode, setSearchMode] = useState<"songs" | "users">(route.params?.searchMode ?? "songs")
    const [query, setQuery] = useState("")
    const [recentSearches, setRecentSearches] = useState<RecentEntry[]>([])
    const recentLoaded = useRef(false)
    const [songResults, setSongResults] = useState<SongSearchResult[]>([])
    const [profileResults, setProfileResults] = useState<Profile[]>([])
    const [followBusy, setFollowBusy] = useState<Set<string>>(new Set())
    const [isLoading, setIsLoading] = useState(false)
    const [openingDeezerId, setOpeningDeezerId] = useState<number | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [coSigns, setCoSigns] = useState<CoSignItem[]>([])
    const [isDiscoveryLoading, setIsDiscoveryLoading] = useState(false)
    const [discoveryError, setDiscoveryError] = useState<string | null>(null)
    const [topCompatUser, setTopCompatUser] = useState<MostCompatibleItem | null>(null)

    // Load persisted recent searches on mount
    useEffect(() => {
        SecureStore.getItemAsync(RECENT_KEY)
            .then(json => {
                if (json) {
                    try { setRecentSearches(JSON.parse(json)) } catch {}
                }
            })
            .finally(() => { recentLoaded.current = true })
    }, [])

    // Persist recent searches whenever the list changes (skip initial empty state)
    useEffect(() => {
        if (!recentLoaded.current) return
        SecureStore.setItemAsync(RECENT_KEY, JSON.stringify(recentSearches)).catch(() => {})
    }, [recentSearches])

    // Bring up the keyboard whenever searchFocused becomes true (e.g. from route param or tap).
    // 150ms gives nav transitions time to complete before focus is requested.
    useEffect(() => {
        if (searchFocused) {
            const id = setTimeout(() => searchRef.current?.focus(), 150)
            return () => clearTimeout(id)
        }
    }, [searchFocused])

    // Restore keyboard when returning to this tab while a search is in progress.
    useFocusEffect(
        useCallback(() => {
            if (searchFocused) {
                const id = setTimeout(() => searchRef.current?.focus(), 150)
                return () => clearTimeout(id)
            }
        }, [searchFocused])
    )

    // Pressing the Discover tab while already on it and searching → reset to home.
    // tabPress fires on the parent tab navigator, not this screen's stack.
    useEffect(() => {
        const tabNavigation = navigation.getParent<BottomTabNavigationProp<TabParamList, "Discover">>()
        if (!tabNavigation) return
        return tabNavigation.addListener("tabPress", (e) => {
            if (navigation.isFocused() && searchFocused) {
                e.preventDefault()
                handleCancel()
            }
        })
    }, [navigation, searchFocused])

    const addToRecent = (q: string, mode: "songs" | "users") => {
        if (q.trim().length < 2) return
        setRecentSearches(prev => {
            const filtered = prev.filter(r => !(r.query === q.trim() && r.mode === mode))
            return [{ query: q.trim(), mode }, ...filtered].slice(0, 8)
        })
    }

    const handleFocusSearch = () => setSearchFocused(true)

    const handleCancel = () => {
        setSearchFocused(false)
        setQuery("")
        searchRef.current?.blur()
        setSongResults([])
        setProfileResults([])
        setError(null)
    }

    const handleRecentPress = (item: RecentEntry) => {
        setSearchMode(item.mode)
        setQuery(item.query)
    }

    const handleRemoveRecent = (item: RecentEntry) => {
        setRecentSearches(prev => prev.filter(r => !(r.query === item.query && r.mode === item.mode)))
    }

    const handleSongPress = async (song: SongSearchResult) => {
        if (!token || openingDeezerId !== null) return
        setOpeningDeezerId(song.deezer_id)
        setError(null)
        addToRecent(query, "songs")
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

    const handleProfilePress = (p: Profile) => {
        addToRecent(query, "users")
        if (p.is_own_profile) {
            navigation.navigate("MainTabs", { screen: "Profile" })
            return
        }
        navigation.navigate("OtherProfile", { username: p.username })
    }

    const handleSearchRatePress = (song: SongSearchResult) => {
        // Skip Song Detail and drop straight into the rating flow.
        addToRecent(query, "songs")
        navigation.navigate("BucketSelection", { song })
    }

    const handleToggleFollow = async (p: Profile) => {
        if (!token || followBusy.has(p.username)) {
            return
        }
        setFollowBusy((prev) => new Set(prev).add(p.username))
        try {
            const updated = p.is_following
                ? await unfollowUser(p.username, token)
                : await followUser(p.username, token)
            setProfileResults((prev) =>
                prev.map((row) => (row.username === updated.username ? { ...row, ...updated } : row))
            )
        } catch {
            // Leave the row unchanged; the user can retry or follow from the profile.
        } finally {
            setFollowBusy((prev) => {
                const next = new Set(prev)
                next.delete(p.username)
                return next
            })
        }
    }

    const handleDiscoverySongPress = (item: CoSignItem) => {
        navigation.navigate("SongDetail", { song: item.song })
    }

    const handleRatePress = (item: CoSignItem) => {
        navigation.navigate("BucketSelection", { song: item.song })
    }

    const setMode = (mode: "songs" | "users") => {
        setSearchMode(mode)
        setSongResults([])
        setProfileResults([])
        setError(null)
    }

    useEffect(() => {
        if (route.params?.searchMode) {
            setMode(route.params.searchMode)
            navigation.setParams({ searchMode: undefined })
        }
        if (route.params?.focusSearch) {
            setSearchFocused(true)
            navigation.setParams({ focusSearch: undefined })
        }
    }, [route.params?.focusSearch, route.params?.searchMode, navigation])

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
        if (!token) return

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
                if (isCurrentSearch) setIsLoading(false)
            }
        }, 350)

        return () => {
            isCurrentSearch = false
            clearTimeout(timeoutId)
        }
    }, [query, searchMode, token])

    // Refetch on focus (not just on token change) so a transient backend error
    // can't leave the discovery section permanently stuck on a stale error —
    // matching how Feed and Profile recover when the tab regains focus.
    useFocusEffect(
        useCallback(() => {
            if (!token) return
            let isCurrentRequest = true
            setIsDiscoveryLoading(true)
            setDiscoveryError(null)
            Promise.all([
                listCoSigns(token),
                getMostCompatible(token),
            ])
                .then(([coSignResponse, compatResponse]) => {
                    if (!isCurrentRequest) return
                    setCoSigns(coSignResponse.items)
                    setTopCompatUser(compatResponse.users[0] ?? null)
                })
                .catch((err) => {
                    if (isCurrentRequest) {
                        setDiscoveryError(
                            err instanceof ApiError
                                ? err.detail
                                : "Social discovery is temporarily unavailable.",
                        )
                    }
                })
                .finally(() => {
                    if (isCurrentRequest) setIsDiscoveryLoading(false)
                })
            return () => { isCurrentRequest = false }
        }, [token]),
    )

    const trimmedQuery = query.trim()
    const hasQuery = trimmedQuery.length > 0
    const followingCount = profile?.following_count ?? 0
    const ratedCount = profile?.user_stats?.rated_count ?? 0

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View>
                    <Text style={styles.kicker}>DISCOVER THROUGH TASTE</Text>
                    <Text style={styles.heading}>Discover</Text>
                </View>
                <TouchableOpacity
                    style={styles.avatarCircle}
                    onPress={() => navigation.navigate("Profile")}
                    accessibilityLabel="Your profile"
                >
                    <Text style={styles.avatarLetter}>{avatarInitial}</Text>
                </TouchableOpacity>
            </View>

            {/* Search area */}
            <View style={styles.searchArea}>
                <Animated.View layout={LinearTransition.duration(220)} style={styles.searchFocusedRow}>
                    <Pressable style={styles.searchBar} onPress={() => searchRef.current?.focus()}>
                        <SearchIcon />
                        <TextInput
                            ref={searchRef}
                            style={styles.searchInput}
                            placeholder="Search songs or people…"
                            placeholderTextColor={colors.inkDim}
                            value={query}
                            onChangeText={setQuery}
                            autoCapitalize="none"
                            returnKeyType="search"
                            onFocus={handleFocusSearch}
                        />
                    </Pressable>
                    {searchFocused && (
                        <Animated.View entering={FadeInRight.duration(220)} exiting={FadeOutRight.duration(180)}>
                            <TouchableOpacity onPress={handleCancel} style={styles.cancelBtn} activeOpacity={0.7}>
                                <Text style={styles.cancelText}>Cancel</Text>
                            </TouchableOpacity>
                        </Animated.View>
                    )}
                </Animated.View>
            </View>

            {/* Scope toggle — focused only */}
            {searchFocused && (
                <Animated.View
                    entering={FadeInDown.duration(200)}
                    exiting={FadeOut.duration(120)}
                    style={styles.scopeRow}
                >
                    <View style={styles.scopePill}>
                        {(["songs", "users"] as const).map((mode) => (
                            <TouchableOpacity
                                key={mode}
                                style={[styles.scopeBtn, searchMode === mode && styles.scopeBtnActive]}
                                onPress={() => setMode(mode)}
                            >
                                <Text style={[styles.scopeBtnText, searchMode === mode && styles.scopeBtnTextActive]}>
                                    {mode === "songs" ? "Songs" : "People"}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </Animated.View>
            )}

            {/* Content */}
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
            >
                {searchFocused ? (
                    <>
                        {isLoading && <ActivityIndicator color={colors.accent} style={styles.spinner} />}

                        {!isLoading && error !== null && (
                            <Text style={styles.errorText}>{error}</Text>
                        )}

                        {/* No query: recent searches */}
                        {!isLoading && error === null && !hasQuery && recentSearches.length > 0 && (
                            <>
                                <View style={styles.recentHeader}>
                                    <Text style={styles.recentLabel}>RECENT</Text>
                                    <TouchableOpacity onPress={() => setRecentSearches([])}>
                                        <Text style={styles.clearText}>Clear</Text>
                                    </TouchableOpacity>
                                </View>
                                <View style={styles.recentChips}>
                                    {recentSearches.map((item, i) => (
                                        <View key={i} style={styles.recentChip}>
                                            <View style={styles.recentChipIcon}>
                                                {item.mode === "songs" ? <MiniSearchIcon /> : <PersonIcon />}
                                            </View>
                                            <TouchableOpacity onPress={() => handleRecentPress(item)}>
                                                <Text style={styles.recentChipText}>{item.query}</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity onPress={() => handleRemoveRecent(item)} style={styles.recentChipClose}>
                                                <Text style={styles.recentChipCloseText}>×</Text>
                                            </TouchableOpacity>
                                        </View>
                                    ))}
                                </View>
                            </>
                        )}

                        {/* No results */}
                        {!isLoading && error === null && trimmedQuery.length >= 2 && searchMode === "songs" && songResults.length === 0 && (
                            <Text style={styles.emptyText}>No songs found.</Text>
                        )}
                        {!isLoading && error === null && trimmedQuery.length >= 2 && searchMode === "users" && profileResults.length === 0 && (
                            <Text style={styles.emptyText}>No users found.</Text>
                        )}

                        {/* Song results — rated rows show your score, others a Rate pill */}
                        {!isLoading && error === null && searchMode === "songs" && songResults.length > 0 && (
                            <View style={styles.resultCard}>
                                {songResults.map((song, i) => {
                                    const rated = song.my_bucket != null && song.my_score != null
                                    return (
                                        <TouchableOpacity
                                            key={song.deezer_id}
                                            style={[styles.resultRow, i > 0 && styles.resultRowBorder]}
                                            onPress={() => handleSongPress(song)}
                                            disabled={openingDeezerId !== null}
                                            activeOpacity={0.75}
                                        >
                                            <View style={styles.cover}>
                                                {song.cover_url ? (
                                                    <Image source={{ uri: song.cover_url }} style={styles.coverImg} />
                                                ) : null}
                                            </View>
                                            <View style={styles.resultText}>
                                                <HighlightedText text={song.title} query={trimmedQuery} style={styles.resultTitle} />
                                                <HighlightedText text={song.artist} query={trimmedQuery} style={styles.resultArtist} />
                                            </View>
                                            {openingDeezerId === song.deezer_id ? (
                                                <ActivityIndicator color={colors.accent} size="small" />
                                            ) : rated ? (
                                                <View style={styles.ratedCluster}>
                                                    <View style={styles.ratedTagRow}>
                                                        <View style={[styles.ratedDot, { backgroundColor: bucketColor(song.my_bucket!) }]} />
                                                        <Text style={styles.ratedTagText}>RATED</Text>
                                                    </View>
                                                    <Text style={[styles.ratedScore, { color: bucketColor(song.my_bucket!) }]}>
                                                        {song.my_score!.toFixed(1)}
                                                    </Text>
                                                </View>
                                            ) : (
                                                <TouchableOpacity
                                                    style={styles.ratePill}
                                                    onPress={() => handleSearchRatePress(song)}
                                                    disabled={openingDeezerId !== null}
                                                >
                                                    <Text style={styles.ratePillLabel}>Rate</Text>
                                                </TouchableOpacity>
                                            )}
                                        </TouchableOpacity>
                                    )
                                })}
                            </View>
                        )}

                        {/* People results — taste match + relationship note + follow action */}
                        {!isLoading && error === null && searchMode === "users" && profileResults.length > 0 && (
                            <View style={styles.resultCard}>
                                {profileResults.map((p, i) => {
                                    const mutual = p.is_following && p.is_followed_by
                                    const note = mutual
                                        ? "MUTUAL"
                                        : p.is_followed_by
                                            ? "FOLLOWS YOU"
                                            : `${p.follower_count} FOLLOWERS`
                                    const matchPct = p.similarity_score != null
                                        ? Math.round(p.similarity_score * 100)
                                        : null
                                    const busy = followBusy.has(p.username)
                                    return (
                                        <TouchableOpacity
                                            key={p.id}
                                            style={[styles.resultRow, i > 0 && styles.resultRowBorder]}
                                            onPress={() => handleProfilePress(p)}
                                            activeOpacity={0.75}
                                        >
                                            <View style={[styles.userBust, { backgroundColor: avatarColor(p.username) }]}>
                                                <Text style={styles.userBustLetter}>
                                                    {(p.display_name || p.username).charAt(0).toUpperCase()}
                                                </Text>
                                            </View>
                                            <View style={styles.resultText}>
                                                <HighlightedText text={p.display_name} query={trimmedQuery} style={styles.resultTitle} />
                                                <Text style={styles.matchNote} numberOfLines={1}>
                                                    {matchPct !== null && (
                                                        <Text style={styles.matchPct}>{matchPct}% MATCH · </Text>
                                                    )}
                                                    {note}
                                                </Text>
                                            </View>
                                            {!p.is_own_profile && (
                                                <TouchableOpacity
                                                    style={[
                                                        p.is_following ? styles.followingPill : styles.followPill,
                                                        busy && { opacity: 0.5 },
                                                    ]}
                                                    onPress={() => handleToggleFollow(p)}
                                                    disabled={busy}
                                                >
                                                    <Text style={p.is_following ? styles.followingPillLabel : styles.followPillLabel}>
                                                        {p.is_following ? "Following" : "Follow"}
                                                    </Text>
                                                </TouchableOpacity>
                                            )}
                                        </TouchableOpacity>
                                    )
                                })}
                            </View>
                        )}
                    </>
                ) : (
                    <>
                        {isDiscoveryLoading && (
                            <ActivityIndicator color={colors.accent} style={styles.spinner} />
                        )}
                        {!isDiscoveryLoading && discoveryError && (
                            <Text style={styles.errorText}>{discoveryError}</Text>
                        )}
                        {!isDiscoveryLoading && !discoveryError && (
                            <>
                                {/* Co-Sign — live when friends co-sign exist, locked otherwise */}
                                {coSigns.length > 0 ? (
                                    <>
                                        {coSigns.map((item) => (
                                            <SocialDiscoveryCard
                                                key={`co-sign-${item.song.id}`}
                                                item={item}
                                                token={token ?? ""}
                                                onOpen={() => handleDiscoverySongPress(item)}
                                                onRate={() => handleRatePress(item)}
                                            />
                                        ))}
                                    </>
                                ) : (
                                    <View style={styles.coSignLockedCard}>
                                        {/* Left: pill + kicker, then ghost row */}
                                        <View style={styles.coSignLockedLeft}>
                                            <View style={styles.coSignLockedHeader}>
                                                <View style={styles.coSignPill}>
                                                    <Text style={styles.coSignPillText}>Co-sign</Text>
                                                </View>
                                                <Text style={styles.coSignKicker}>FRIENDS' UNANIMOUS 9s</Text>
                                            </View>
                                            <View style={styles.coSignGhostRow}>
                                                <View style={styles.coSignGhostThumb} />
                                                <View style={styles.coSignGhostLines}>
                                                    <View style={[styles.coSignGhostLine, { width: "72%" }]} />
                                                    <View style={[styles.coSignGhostLine, { width: "46%", opacity: 0.65 }]} />
                                                </View>
                                            </View>
                                        </View>
                                        {/* Right: lock circle */}
                                        <View style={styles.coSignLockCircle}>
                                            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                                                <Path d="M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zM7 11V7a5 5 0 0110 0v4"
                                                    stroke="#fff" strokeWidth={2}
                                                    strokeLinecap="round" strokeLinejoin="round" />
                                            </Svg>
                                        </View>
                                    </View>
                                )}

                                {/* Trending in your circle — locked until trending API ships; show friend progress */}
                                <View style={styles.trendingCard}>
                                    <Text style={styles.trendingKicker}>TRENDING IN YOUR CIRCLE</Text>
                                    <View style={styles.trendingRow}>
                                        <View style={styles.trendingLockCircle}>
                                            <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
                                                <Path d="M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zM7 11V7a5 5 0 0110 0v4"
                                                    stroke="rgba(17,19,28,0.5)" strokeWidth={2}
                                                    strokeLinecap="round" strokeLinejoin="round" />
                                            </Svg>
                                        </View>
                                        <View style={styles.trendingTextBlock}>
                                            <Text style={styles.trendingTitle}>Locked for now</Text>
                                            <Text style={styles.trendingBody}>
                                                Follow friends to see what's hot in your circle.
                                            </Text>
                                        </View>
                                        <Text style={styles.trendingCounter}>{Math.min(followingCount, 3)}/3</Text>
                                    </View>
                                </View>

                                {/* 2-col: Compatibility (live or locked) + Most-Rated (locked) */}
                                <View style={styles.twoColRow}>
                                    <View style={[styles.twoColCard, styles.compatCard]}>
                                        <View style={styles.compatPill}>
                                            <Text style={styles.compatPillText}>Compatibility</Text>
                                        </View>
                                        {topCompatUser ? (
                                            <>
                                                <View style={styles.compatUserRow}>
                                                    <View style={styles.compatAva}>
                                                        <Text style={styles.compatAvaText}>
                                                            {(topCompatUser.display_name || topCompatUser.username).charAt(0).toUpperCase()}
                                                        </Text>
                                                    </View>
                                                    <Text style={styles.compatUserName} numberOfLines={1}>
                                                        {(topCompatUser.display_name || topCompatUser.username).split(" ")[0]}
                                                    </Text>
                                                </View>
                                                <View style={styles.compatScoreRow}>
                                                    <Text style={styles.compatPct} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                                                        {Math.round(topCompatUser.similarity_score * 100)}%
                                                    </Text>
                                                    <Text style={styles.compatAlignedLabel}>ALIGNED</Text>
                                                </View>
                                            </>
                                        ) : (
                                            <>
                                                <View style={styles.compatLockRow}>
                                                    <View style={styles.compatLockCircle}>
                                                        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                                                            <Path d="M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zM7 11V7a5 5 0 0110 0v4"
                                                                stroke="rgba(255,255,255,0.55)" strokeWidth={2}
                                                                strokeLinecap="round" strokeLinejoin="round" />
                                                        </Svg>
                                                    </View>
                                                    <View style={styles.compatBars}>
                                                        <View style={[styles.compatBar, { width: "90%" }]} />
                                                        <View style={[styles.compatBar, { width: "62%" }]} />
                                                    </View>
                                                </View>
                                                <View style={styles.compatScoreRow}>
                                                    <Text style={styles.compatPct} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>–%</Text>
                                                    <Text style={styles.compatAlignedLabel}>ALIGNED</Text>
                                                </View>
                                                <Text style={styles.compatBody}>Follow friends to see your match.</Text>
                                            </>
                                        )}
                                    </View>

                                    <View style={[styles.twoColCard, styles.circleCard]}>
                                        <View style={styles.circlePill}>
                                            <Text style={styles.circlePillText}>Most-rated · circle</Text>
                                        </View>
                                        <View style={styles.circleLockRow}>
                                            <View style={styles.circleLockSquare}>
                                                <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                                                    <Path d="M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zM7 11V7a5 5 0 0110 0v4"
                                                        stroke={colors.gold} strokeWidth={2}
                                                        strokeLinecap="round" strokeLinejoin="round" />
                                                </Svg>
                                            </View>
                                            <View style={styles.circleBars}>
                                                <View style={[styles.circleBar, { width: "72%" }]} />
                                                <View style={[styles.circleBar, { width: "44%" }]} />
                                            </View>
                                        </View>
                                        <View style={styles.circleCountRow}>
                                            <Text style={styles.circleCountNum}>—</Text>
                                            <Text style={styles.circleCountLabel}>TOTAL RATINGS</Text>
                                        </View>
                                    </View>
                                </View>

                                {/* Curated Lists — locked with rated count progress */}
                                <View style={styles.discoverSectionRow}>
                                    <Text style={styles.discoverSectionLabel}>CURATED LISTS</Text>
                                </View>
                                <View style={styles.curatedCard}>
                                    <View style={styles.curatedLockWrap}>
                                        <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
                                            <Path d="M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zM7 11V7a5 5 0 0110 0v4"
                                                stroke={colors.inkSoft} strokeWidth={2}
                                                strokeLinecap="round" strokeLinejoin="round" />
                                        </Svg>
                                    </View>
                                    <View style={styles.curatedText}>
                                        <Text style={styles.curatedTitle}>No lists yet</Text>
                                        <Text style={styles.curatedBody}>
                                            Rate more songs to unlock lists curated to your taste.
                                        </Text>
                                    </View>
                                    <Text style={styles.trendingCounter}>{Math.min(ratedCount, 30)}/30</Text>
                                </View>
                            </>
                        )}
                    </>
                )}
            </ScrollView>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.bg,
    },
    // ── Header ─────────────────────────────────────────────────────────
    header: {
        paddingTop: 60,
        paddingHorizontal: 16,
        paddingBottom: 10,
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
    },
    kicker: {
        fontFamily: fonts.mono,
        color: colors.inkDim,
        fontSize: 8.5,
        letterSpacing: 2,
        fontWeight: "700",
        marginBottom: 3,
    },
    heading: {
        fontFamily: fonts.display,
        fontSize: 30,
        letterSpacing: -0.6,
        lineHeight: 29,
        color: colors.ink,
    },
    avatarCircle: {
        width: 32,
        height: 32,
        borderRadius: 9,
        backgroundColor: colors.ink,
        alignItems: "center",
        justifyContent: "center",
        marginTop: 4,
    },
    avatarLetter: {
        color: "#fff",
        fontWeight: "700",
        fontSize: 17,
    },
    // ── Search area ────────────────────────────────────────────────────
    searchArea: {
        paddingHorizontal: 14,
        marginBottom: 6,
    },
    searchFocusedRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    searchBar: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 9,
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 12,
        height: 40,
        paddingHorizontal: 13,
        shadowColor: colors.ink,
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
    },
    searchInput: {
        flex: 1,
        fontSize: 12.5,
        color: colors.ink,
        padding: 0,
    },
    cancelBtn: {
        paddingVertical: 4,
        paddingLeft: 2,
    },
    cancelText: {
        fontFamily: fonts.display,
        fontSize: 13.5,
        color: colors.accent,
    },
    // ── Scope toggle ───────────────────────────────────────────────────
    scopeRow: {
        paddingHorizontal: 14,
        marginBottom: 8,
    },
    scopePill: {
        flexDirection: "row",
        backgroundColor: colors.bg,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.line,
        padding: 3,
    },
    scopeBtn: {
        flex: 1,
        paddingVertical: 7,
        alignItems: "center",
        borderRadius: 999,
    },
    scopeBtnActive: {
        backgroundColor: colors.ink,
    },
    scopeBtnText: {
        fontWeight: "600",
        fontSize: 12,
        color: colors.inkSoft,
    },
    scopeBtnTextActive: {
        color: "#fff",
    },
    // ── Recent searches ────────────────────────────────────────────────
    recentHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 10,
    },
    recentLabel: {
        fontFamily: fonts.mono,
        fontSize: 9,
        letterSpacing: 1.8,
        color: colors.inkDim,
        fontWeight: "700",
    },
    clearText: {
        fontFamily: fonts.mono,
        fontSize: 11,
        color: colors.accent,
        fontWeight: "600",
    },
    recentChips: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    recentChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 999,
        paddingVertical: 8,
        paddingHorizontal: 11,
    },
    recentChipIcon: {
        opacity: 0.7,
    },
    recentChipText: {
        fontSize: 13,
        color: colors.ink,
        fontWeight: "500",
    },
    recentChipClose: {
        paddingLeft: 2,
    },
    recentChipCloseText: {
        fontSize: 15,
        color: colors.inkDim,
        lineHeight: 16,
        marginTop: -1,
    },
    // ── Results ────────────────────────────────────────────────────────
    scroll: { flex: 1 },
    scrollContent: {
        paddingHorizontal: 14,
        paddingTop: 8,
        paddingBottom: 96,
    },
    spinner: { marginTop: 40 },
    errorText: {
        color: colors.danger,
        fontSize: 14,
        marginTop: 30,
        textAlign: "center",
        lineHeight: 20,
    },
    emptyText: {
        color: colors.inkDim,
        fontSize: 14,
        marginTop: 30,
        textAlign: "center",
        lineHeight: 20,
    },
    // ── Section labels ────────────────────────────────────────────────
    sectionRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "baseline",
        marginTop: 13,
        marginBottom: 7,
    },
    sectionLabel: {
        fontFamily: fonts.mono,
        fontSize: 9,
        letterSpacing: 1.6,
        color: colors.inkDim,
        fontWeight: "700",
    },
    // ── Result card + rows ────────────────────────────────────────────
    resultCard: {
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 16,
        overflow: "hidden",
        shadowColor: colors.ink,
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        paddingHorizontal: 14,
        paddingVertical: 2,
    },
    resultRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 10,
    },
    resultRowBorder: {
        borderTopWidth: 1,
        borderTopColor: colors.line,
    },
    cover: {
        width: 44,
        height: 44,
        borderRadius: 8,
        backgroundColor: colors.paper2,
        overflow: "hidden",
        flexShrink: 0,
    },
    coverImg: { width: "100%", height: "100%" },
    userBust: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    userBustLetter: {
        color: "#fff",
        fontWeight: "700",
        fontSize: 18,
    },
    resultText: {
        flex: 1,
        minWidth: 0,
    },
    resultTitle: {
        fontFamily: fonts.display,
        fontSize: 14,
        color: colors.ink,
        lineHeight: 18,
    },
    resultArtist: {
        color: colors.inkDim,
        fontSize: 11.5,
        marginTop: 1.5,
    },
    // Song rows: rated state cluster
    ratedCluster: {
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        flexShrink: 0,
    },
    ratedTagRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    ratedDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    ratedTagText: {
        fontFamily: fonts.mono,
        fontSize: 7,
        letterSpacing: 0.7,
        fontWeight: "700",
        color: colors.inkDim,
    },
    ratedScore: {
        fontFamily: fonts.display,
        fontSize: 16,
        letterSpacing: -0.3,
    },
    ratePill: {
        backgroundColor: colors.ink,
        borderRadius: 999,
        paddingVertical: 8,
        paddingHorizontal: 15,
        flexShrink: 0,
    },
    ratePillLabel: {
        fontFamily: fonts.display,
        fontSize: 12,
        color: "#fff",
    },
    // People rows: match note + follow actions
    matchNote: {
        fontFamily: fonts.mono,
        fontSize: 8,
        letterSpacing: 0.6,
        color: colors.inkDim,
        marginTop: 3,
    },
    matchPct: {
        color: colors.mint,
        fontWeight: "700",
    },
    followPill: {
        backgroundColor: colors.accent,
        borderRadius: 999,
        paddingVertical: 8,
        paddingHorizontal: 15,
        flexShrink: 0,
        shadowColor: colors.ink,
        shadowOpacity: 1,
        shadowRadius: 0,
        shadowOffset: { width: 2, height: 2 },
    },
    followPillLabel: {
        fontFamily: fonts.display,
        fontSize: 11.5,
        color: "#fff",
    },
    followingPill: {
        backgroundColor: colors.bg,
        borderWidth: 1.5,
        borderColor: colors.line,
        borderRadius: 999,
        paddingVertical: 7,
        paddingHorizontal: 14,
        flexShrink: 0,
    },
    followingPillLabel: {
        fontFamily: fonts.display,
        fontSize: 11.5,
        color: colors.inkSoft,
    },
    // ── Discovery sections ─────────────────────────────────────────────
    discoverSectionRow: {
        marginTop: 12,
        marginBottom: 7,
    },
    discoverSectionLabel: {
        fontFamily: fonts.mono,
        fontSize: 9,
        letterSpacing: 1.6,
        color: colors.inkDim,
        fontWeight: "700",
    },
    coSignLockedCard: {
        backgroundColor: colors.mint,
        borderRadius: 14,
        padding: 12,
        marginBottom: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        overflow: "hidden",
    },
    coSignLockedLeft: {
        flex: 1,
        minWidth: 0,
    },
    coSignLockedHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    coSignPill: {
        backgroundColor: "rgba(0,0,0,0.22)",
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    coSignPillText: {
        fontFamily: fonts.mono,
        color: "#fff",
        fontSize: 8.5,
        letterSpacing: 1.4,
        fontWeight: "700",
        textTransform: "uppercase",
    },
    coSignKicker: {
        fontFamily: fonts.mono,
        fontSize: 9.5,
        fontWeight: "700",
        letterSpacing: 0.9,
        color: "rgba(255,255,255,0.9)",
        flexShrink: 1,
    },
    coSignGhostRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 11,
        marginTop: 11,
    },
    coSignGhostThumb: {
        width: 46,
        height: 46,
        borderRadius: 8,
        borderWidth: 1.5,
        borderColor: "rgba(255,255,255,0.5)",
        borderStyle: "dashed",
        backgroundColor: "rgba(255,255,255,0.07)",
        flexShrink: 0,
    },
    coSignGhostLines: {
        flex: 1,
        gap: 7,
    },
    coSignGhostLine: {
        height: 10,
        borderRadius: 5,
        backgroundColor: "rgba(255,255,255,0.32)",
    },
    coSignLockCircle: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: "rgba(255,255,255,0.18)",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    trendingCard: {
        backgroundColor: colors.butter,
        borderRadius: 16,
        padding: 14,
        marginBottom: 8,
    },
    trendingKicker: {
        fontFamily: fonts.mono,
        fontSize: 8.5,
        letterSpacing: 1.8,
        color: "rgba(17,19,28,0.5)",
        fontWeight: "700",
        marginBottom: 12,
    },
    trendingRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
    },
    trendingLockCircle: {
        width: 42,
        height: 42,
        borderRadius: 8,
        borderWidth: 1.5,
        borderColor: "rgba(17,19,28,0.3)",
        borderStyle: "dashed",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        marginTop: 2,
    },
    trendingTextBlock: {
        flex: 1,
    },
    trendingTitle: {
        fontFamily: fonts.display,
        fontSize: 17,
        letterSpacing: -0.3,
        color: colors.ink,
        marginBottom: 4,
    },
    trendingBody: {
        fontFamily: fonts.mono,
        fontSize: 11,
        lineHeight: 16,
        color: "rgba(17,19,28,0.6)",
    },
    trendingCounter: {
        fontFamily: fonts.mono,
        fontSize: 13,
        fontWeight: "700",
        color: "rgba(17,19,28,0.5)",
        marginTop: 2,
    },
    twoColRow: {
        flexDirection: "row",
        gap: 8,
        marginBottom: 8,
    },
    twoColCard: {
        flex: 1,
        borderRadius: 16,
        padding: 11,
    },
    compatCard: {
        backgroundColor: colors.sky,
    },
    compatPill: {
        backgroundColor: "rgba(255,255,255,0.20)",
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 3,
        alignSelf: "flex-start",
        marginBottom: 9,
    },
    compatPillText: {
        fontFamily: fonts.mono,
        color: "#fff",
        fontSize: 8.5,
        letterSpacing: 1.4,
        fontWeight: "700",
        textTransform: "uppercase",
    },
    compatUserRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        marginBottom: 6,
    },
    compatAva: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: "rgba(255,255,255,0.30)",
        borderWidth: 1.5,
        borderColor: "rgba(255,255,255,0.50)",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    compatAvaText: {
        color: "#fff",
        fontWeight: "700",
        fontSize: 11,
    },
    compatUserName: {
        fontFamily: fonts.display,
        fontSize: 15,
        color: "#fff",
        flex: 1,
        minWidth: 0,
    },
    compatScoreRow: {
        flexDirection: "row",
        alignItems: "flex-end",
        gap: 6,
    },
    compatPct: {
        fontFamily: fonts.display,
        fontSize: 44,
        color: "#fff",
        lineHeight: 40,
        letterSpacing: -1,
        flex: 1,
    },
    compatAlignedLabel: {
        fontFamily: fonts.mono,
        fontSize: 8,
        color: "rgba(255,255,255,0.85)",
        letterSpacing: 1.6,
        fontWeight: "700",
        paddingBottom: 6,
        flexShrink: 0,
    },
    compatLockRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginBottom: 6,
    },
    compatLockCircle: {
        width: 34,
        height: 34,
        borderRadius: 17,
        borderWidth: 1.5,
        borderColor: "rgba(255,255,255,0.45)",
        borderStyle: "dashed",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    compatBars: {
        flex: 1,
        gap: 6,
    },
    compatBar: {
        height: 6,
        borderRadius: 3,
        backgroundColor: "rgba(255,255,255,0.35)",
    },
    compatBody: {
        fontFamily: fonts.mono,
        fontSize: 9.5,
        lineHeight: 14,
        color: "rgba(255,255,255,0.72)",
        marginTop: 4,
    },
    circleCard: {
        backgroundColor: colors.navy,
    },
    circlePill: {
        backgroundColor: "rgba(245,184,64,0.16)",
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 3,
        alignSelf: "flex-start",
        marginBottom: 9,
    },
    circlePillText: {
        fontFamily: fonts.mono,
        color: colors.gold,
        fontSize: 8.5,
        letterSpacing: 1.4,
        fontWeight: "700",
        textTransform: "uppercase",
    },
    circleLockRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginBottom: 9,
    },
    circleLockSquare: {
        width: 34,
        height: 34,
        borderRadius: 7,
        borderWidth: 1.5,
        borderColor: "rgba(245,184,64,0.55)",
        borderStyle: "dashed",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    circleBars: {
        flex: 1,
        gap: 7,
    },
    circleBar: {
        height: 7,
        borderRadius: 4,
        backgroundColor: "rgba(255,255,255,0.14)",
    },
    circleCountRow: {
        flexDirection: "row",
        alignItems: "baseline",
        gap: 6,
    },
    circleCountNum: {
        fontFamily: fonts.display,
        fontSize: 26,
        color: colors.gold,
        lineHeight: 24,
    },
    circleCountLabel: {
        fontFamily: fonts.mono,
        fontSize: 8,
        color: colors.cdim,
        letterSpacing: 1.4,
    },
    curatedCard: {
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 16,
        padding: 14,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        marginBottom: 8,
        shadowColor: colors.ink,
        shadowOpacity: 0.04,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
    },
    curatedLockWrap: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: colors.paper2,
        borderWidth: 1.5,
        borderColor: colors.line,
        borderStyle: "dashed",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    curatedText: {
        flex: 1,
    },
    curatedTitle: {
        fontWeight: "700",
        fontSize: 14,
        color: colors.ink,
        marginBottom: 3,
    },
    curatedBody: {
        fontFamily: fonts.mono,
        fontSize: 10.5,
        color: colors.inkSoft,
        lineHeight: 15,
    },
})
