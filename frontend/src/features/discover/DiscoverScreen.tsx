// Discover tab — song search, user search, and social discovery sections.
import { useCallback, useEffect, useRef, useState } from "react"
import {
    ActivityIndicator,
    Image,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Animated, {
    FadeIn,
    FadeInDown,
    FadeInLeft,
    FadeInRight,
    FadeOut,
    FadeOutRight,
    LinearTransition,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from "react-native-reanimated"
import { CompositeNavigationProp, useFocusEffect, useNavigation, useRoute, RouteProp } from "@react-navigation/native"
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"
import * as SecureStore from "expo-secure-store"
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from "react-native-svg"

import { ApiError } from "../../api/client"
import BouncyPressable from "../../components/BouncyPressable"
import HatchBox from "../../components/HatchBox"
import { AppStackParamList, DiscoverStackParamList, TabParamList } from "../../navigation/types"
import { bucketColor, colors, fonts } from "../../theme"
import { usePullRefresh } from "../../hooks/usePullRefresh"
import { useAuth } from "../auth/AuthContext"
import { followUser, getMostCompatible, searchProfiles, unfollowUser } from "../profile/apiRequests"
import { MostCompatibleItem, Profile } from "../profile/types"
import { searchSongs } from "../search/apiRequests"
import { SongSearchResult } from "../search/types"
import { getCircleMostRated, getCircleTrending, getPopular, listCoSigns } from "./apiRequests"
import SocialDiscoveryCard from "./SocialDiscoveryCard"
import { CircleMostRatedItem, CircleTrendingItem, CoSignItem, PopularItem, PopularWindow } from "./types"

const RECENT_KEY = "discover_recent_searches"
// Recents are kept per scope (songs vs people). Show this many at rest; the rest sit
// behind a "Show more" chip, with each scope's stored history capped independently.
const PREVIEW_RECENTS = 6
const RECENT_CAP_PER_MODE = 12

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

function PersonIcon({ size = 10 }: { size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <Circle cx="12" cy="8" r="4" stroke={colors.inkSoft} strokeWidth={2} strokeLinecap="round" />
            <Path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" stroke={colors.inkSoft} strokeWidth={2} strokeLinecap="round" />
        </Svg>
    )
}

function MiniSearchIcon({ size = 9 }: { size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <Circle cx={11} cy={11} r={7} stroke={colors.inkSoft} strokeWidth={2} />
            <Path d="m20 20-3.4-3.4" stroke={colors.inkSoft} strokeWidth={2} strokeLinecap="round" />
        </Svg>
    )
}

// Small X for the recent-chip dismiss badge (the badge supplies the circle).
function RecentCloseIcon() {
    return (
        <Svg width={9} height={9} viewBox="0 0 24 24" fill="none">
            <Path d="M6 6l12 12M18 6 6 18" stroke={colors.inkSoft} strokeWidth={2.6} strokeLinecap="round" />
        </Svg>
    )
}

function ClearIcon() {
    return (
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Circle cx={12} cy={12} r={10} fill={colors.inkSoft} />
            <Path d="m9 9 6 6m0-6-6 6" stroke={colors.paper} strokeWidth={2} strokeLinecap="round" />
        </Svg>
    )
}

// Caret for the recents "Show more / Show less" chip.
function ChevronIcon({ up = false, size = 11 }: { up?: boolean; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <Path
                d={up ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"}
                stroke={colors.inkSoft}
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
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

// One Popular-on-LISTn tile. The first tap "arms" a View confirmation rather than navigating: the
// cover art zooms in inside its fixed frame and dims, surfacing a frosted-glass VIEW chip, so a
// stray tap previews intent instead of yanking the user to the song page. Tapping VIEW opens it;
// tapping the card again — or scrolling the row — backs out.
function PopularCard({
    item,
    size,
    isConfirming,
    onArm,
    onDismiss,
    onView,
}: {
    item: PopularItem;
    size: number;
    isConfirming: boolean;
    onArm: () => void;
    onDismiss: () => void;
    onView: () => void;
}) {
    // Only the artwork scales — the tile frame stays put, so the zoom reads as the image pushing
    // into its clipped square rather than the whole card growing.
    const zoom = useSharedValue(1)
    useEffect(() => {
        zoom.value = withSpring(isConfirming ? 1.14 : 1, { damping: 16, stiffness: 320, mass: 0.6 })
    }, [isConfirming, zoom])
    const imageStyle = useAnimatedStyle(() => ({ transform: [{ scale: zoom.value }] }))

    return (
        <View style={{ width: size }}>
            <TouchableOpacity
                activeOpacity={0.85}
                onPress={isConfirming ? onDismiss : onArm}
                accessibilityLabel={isConfirming ? `Dismiss ${item.song.title}` : `Preview ${item.song.title}`}
            >
                <View style={[styles.popularCoverBox, { width: size, height: size }]}>
                    {item.song.cover_url ? (
                        <Animated.Image source={{ uri: item.song.cover_url }} style={[styles.popularCover, imageStyle]} />
                    ) : (
                        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                            <Path d="M9 18V5l12-2v13M9 18a3 3 0 01-6 0 3 3 0 016 0zm12-2a3 3 0 01-6 0 3 3 0 016 0z"
                                stroke={colors.inkDim} strokeWidth={1.5}
                                strokeLinecap="round" strokeLinejoin="round" />
                        </Svg>
                    )}
                    {isConfirming && (
                        <View style={styles.popularConfirmOverlay}>
                            {/* Center-weighted scrim — darkest behind the label, fading out so the
                                zoomed art still reads at the edges. pointerEvents off so taps on the
                                dim fall through to the card (dismiss). */}
                            <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
                                <Defs>
                                    <RadialGradient id={`viewDim-${item.song.id}`} cx="50%" cy="50%" r="72%">
                                        <Stop offset="0" stopColor="#0c0e16" stopOpacity={0.62} />
                                        <Stop offset="1" stopColor="#0c0e16" stopOpacity={0.16} />
                                    </RadialGradient>
                                </Defs>
                                <Rect x="0" y="0" width="100%" height="100%" fill={`url(#viewDim-${item.song.id})`} />
                            </Svg>
                            <BouncyPressable
                                style={styles.popularViewStack}
                                onPress={onView}
                                accessibilityLabel={`View ${item.song.title}`}
                                hitSlop={{ top: 14, bottom: 14, left: 18, right: 18 }}
                            >
                                <Text style={styles.popularViewLabel}>VIEW</Text>
                                <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" style={styles.popularViewChevron}>
                                    <Path d="M5 12H19M12 5L19 12L12 19" stroke={colors.cream} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
                                </Svg>
                            </BouncyPressable>
                        </View>
                    )}
                </View>
                <Text style={styles.popularTileTitle} numberOfLines={1}>{item.song.title}</Text>
                <Text style={styles.popularTileArtist} numberOfLines={1}>{item.song.artist.toUpperCase()}</Text>
            </TouchableOpacity>
        </View>
    )
}

export default function DiscoverScreen() {
    const route = useRoute<DiscoverRouteProp>()
    const navigation = useNavigation<DiscoverNavigationProp>()
    const { token, profile } = useAuth()
    const insets = useSafeAreaInsets()
    const avatarInitial = (profile?.display_name || profile?.username || "?").charAt(0).toUpperCase()
    const searchRef = useRef<TextInput>(null)
    const [searchFocused, setSearchFocused] = useState(false)
    const [searchMode, setSearchMode] = useState<"songs" | "users">(route.params?.searchMode ?? "songs")
    const [query, setQuery] = useState("")
    const [recentSearches, setRecentSearches] = useState<RecentEntry[]>([])
    // Whether the current scope's recents are expanded past the preview count.
    const [recentsExpanded, setRecentsExpanded] = useState(false)
    const recentLoaded = useRef(false)
    const [songResults, setSongResults] = useState<SongSearchResult[]>([])
    const [profileResults, setProfileResults] = useState<Profile[]>([])
    const [followBusy, setFollowBusy] = useState<Set<string>>(new Set())
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [coSigns, setCoSigns] = useState<CoSignItem[]>([])
    const [isDiscoveryLoading, setIsDiscoveryLoading] = useState(false)
    const [discoveryError, setDiscoveryError] = useState<string | null>(null)
    const [topCompatUser, setTopCompatUser] = useState<MostCompatibleItem | null>(null)
    const [trending, setTrending] = useState<CircleTrendingItem[]>([])
    const [mostRated, setMostRated] = useState<CircleMostRatedItem[]>([])
    const [popular, setPopular] = useState<PopularItem[]>([])
    const [popularWindow, setPopularWindow] = useState<PopularWindow>("week")
    // Which Popular tile is showing its "View" confirmation (null = none armed).
    const [confirmingPopularId, setConfirmingPopularId] = useState<number | null>(null)
    // Size the 4 Popular tiles to fill the content row exactly (14px padding each side, three
    // 10px gaps), so the scroller rests flush with both screen edges while still bouncing.
    const { width: windowWidth } = useWindowDimensions()
    const popularTileSize = (windowWidth - 28 - 30) / 4

    // Latest search params mirrored into refs so the on-focus refresh can read them
    // without re-subscribing (and re-firing) on every keystroke.
    const queryRef = useRef(query)
    const searchModeRef = useRef(searchMode)
    queryRef.current = query
    searchModeRef.current = searchMode

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

    // Deliberately do NOT re-focus the input when this screen regains focus
    // (e.g. returning from Song Detail or dismissing the Rate sheet). The search
    // UI and results stay visible, but the keyboard stays down until the user
    // taps the search bar again — auto-popping it back up is jarring.

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
        const trimmed = q.trim()
        if (trimmed.length < 2) return
        setRecentSearches(prev => {
            const filtered = prev.filter(r => !(r.query === trimmed && r.mode === mode))
            const next = [{ query: trimmed, mode }, ...filtered]
            // Cap each scope's history independently while keeping global recency order.
            const seen: Record<string, number> = { songs: 0, users: 0 }
            return next.filter(r => {
                seen[r.mode] += 1
                return seen[r.mode] <= RECENT_CAP_PER_MODE
            })
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
        setRecentsExpanded(false)
    }

    const handleRecentPress = (item: RecentEntry) => {
        setSearchMode(item.mode)
        setQuery(item.query)
    }

    const handleRemoveRecent = (item: RecentEntry) => {
        setRecentSearches(prev => prev.filter(r => !(r.query === item.query && r.mode === item.mode)))
    }

    // "Clear" only wipes the scope you're looking at, leaving the other tab's history intact.
    const handleClearRecents = () => {
        setRecentSearches(prev => prev.filter(r => r.mode !== searchMode))
        setRecentsExpanded(false)
    }

    const handleSongPress = (song: SongSearchResult) => {
        addToRecent(query, "songs")
        // Navigate immediately; Song Detail resolves the viewer's ranking (the row already shows it).
        navigation.navigate("SongDetail", { song })
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
        setRecentsExpanded(false)
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
            // Not an error — a gentle "keep typing" hint is rendered instead.
            setError(null)
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

    // Pull-to-refresh re-runs the full social-discovery fetch on demand. It keeps its own state, so
    // the on-focus loader below is left untouched.
    const refreshDiscovery = useCallback(async () => {
        if (!token) return
        setDiscoveryError(null)
        try {
            const [coSignResponse, compatResponse, trendingResponse, mostRatedResponse, popularResponse] =
                await Promise.all([
                    listCoSigns(token),
                    getMostCompatible(token),
                    getCircleTrending(token),
                    getCircleMostRated(token),
                    getPopular(token),
                ])
            setCoSigns(coSignResponse.items)
            setTopCompatUser(compatResponse.users[0] ?? null)
            setTrending(trendingResponse.items)
            setMostRated(mostRatedResponse.items)
            setPopular(popularResponse.items)
            setPopularWindow(popularResponse.window)
        } catch (err) {
            setDiscoveryError(
                err instanceof ApiError ? err.detail : "Social discovery is temporarily unavailable.",
            )
        }
    }, [token])

    // Refetch on focus (not just on token change) so a transient backend error can't leave the
    // discovery section stuck on a stale error — matching how Feed and Profile recover on focus.
    useFocusEffect(
        useCallback(() => {
            if (!token) return
            let isCurrentRequest = true
            setIsDiscoveryLoading(true)
            setDiscoveryError(null)
            Promise.all([
                listCoSigns(token),
                getMostCompatible(token),
                getCircleTrending(token),
                getCircleMostRated(token),
                getPopular(token),
            ])
                .then(([coSignResponse, compatResponse, trendingResponse, mostRatedResponse, popularResponse]) => {
                    if (!isCurrentRequest) return
                    setCoSigns(coSignResponse.items)
                    setTopCompatUser(compatResponse.users[0] ?? null)
                    setTrending(trendingResponse.items)
                    setMostRated(mostRatedResponse.items)
                    setPopular(popularResponse.items)
                    setPopularWindow(popularResponse.window)
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

    const { refreshing, onRefresh } = usePullRefresh(refreshDiscovery)

    // When the screen regains focus after the rate flow (or any push), silently re-run
    // the active song search so a row the user just rated shows its new score instead of
    // the Rate pill. Skips the first focus (the debounced effect handles initial load)
    // and stays silent — no spinner, no clearing — so the existing rows don't flash.
    const skipFirstFocusRefresh = useRef(true)
    useFocusEffect(
        useCallback(() => {
            if (skipFirstFocusRefresh.current) {
                skipFirstFocusRefresh.current = false
                return
            }
            if (!token || searchModeRef.current !== "songs") return
            const trimmed = queryRef.current.trim()
            if (trimmed.length < 2) return
            let isCurrentRefresh = true
            searchSongs(trimmed, token)
                .then((response) => {
                    // Only apply if the query/mode hasn't moved on since we fired.
                    if (isCurrentRefresh
                        && searchModeRef.current === "songs"
                        && queryRef.current.trim() === trimmed) {
                        setSongResults(response.results)
                    }
                })
                .catch(() => {
                    // Leave the existing rows in place; a failed refresh shouldn't blank them.
                })
            return () => { isCurrentRefresh = false }
        }, [token]),
    )

    const trimmedQuery = query.trim()
    const hasQuery = trimmedQuery.length > 0
    // Recents are scoped to the active tab; collapse to a preview unless expanded.
    const tabRecents = recentSearches.filter(r => r.mode === searchMode)
    const visibleRecents = recentsExpanded ? tabRecents : tabRecents.slice(0, PREVIEW_RECENTS)
    const followingCount = profile?.following_count ?? 0
    const ratedCount = profile?.user_stats?.rated_count ?? 0
    // Hide the viewer's own score in search results until they've rated 10 songs.
    const scoresLocked = ratedCount < 10

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View>
                    <Text style={styles.kicker}>BROWSE</Text>
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
                        {query.length > 0 && (
                            <TouchableOpacity
                                onPress={() => {
                                    setQuery("")
                                    searchRef.current?.focus()
                                }}
                                hitSlop={8}
                                accessibilityLabel="Clear search"
                            >
                                <ClearIcon />
                            </TouchableOpacity>
                        )}
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
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 92 }]}
                keyboardShouldPersistTaps="handled"
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.inkDim} />}
            >
                {searchFocused ? (
                    <>
                        {isLoading && <ActivityIndicator color={colors.accent} style={styles.spinner} />}

                        {!isLoading && error !== null && (
                            <Text style={styles.errorText}>{error}</Text>
                        )}

                        {/* Keep-typing hint — gentle, on-theme (shown after 1 character) */}
                        {!isLoading && error === null && hasQuery && trimmedQuery.length < 2 && (
                            <View style={styles.searchHint}>
                                <SearchIcon size={18} />
                                <Text style={styles.searchHintText}>Keep typing to search…</Text>
                            </View>
                        )}

                        {/* No query: recent searches, scoped to the active tab. The RECENT /
                            Clear header stays anchored; only the chip cloud below it slides
                            toward the tab you just tapped. */}
                        {!isLoading && error === null && !hasQuery && tabRecents.length > 0 && (
                            <>
                                <View style={styles.recentHeader}>
                                    <Text style={styles.recentLabel}>RECENT</Text>
                                    <TouchableOpacity onPress={handleClearRecents}>
                                        <Text style={styles.clearText}>Clear</Text>
                                    </TouchableOpacity>
                                </View>
                                <Animated.View
                                    key={searchMode}
                                    entering={(searchMode === "users" ? FadeInRight : FadeInLeft).duration(240)}
                                    exiting={FadeOut.duration(120)}
                                    layout={LinearTransition.duration(220)}
                                    style={styles.recentChips}
                                >
                                    {visibleRecents.map((item) => (
                                        <Animated.View
                                            key={`${item.mode}:${item.query}`}
                                            entering={FadeIn.duration(160)}
                                            exiting={FadeOut.duration(120)}
                                            layout={LinearTransition.duration(220)}
                                            style={styles.recentChip}
                                        >
                                            <TouchableOpacity
                                                style={styles.recentChipBody}
                                                onPress={() => handleRecentPress(item)}
                                                activeOpacity={0.7}
                                            >
                                                <View style={styles.recentChipIcon}>
                                                    {item.mode === "songs" ? <MiniSearchIcon /> : <PersonIcon />}
                                                </View>
                                                <Text style={styles.recentChipText}>{item.query}</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                onPress={() => handleRemoveRecent(item)}
                                                style={styles.recentChipClose}
                                                hitSlop={6}
                                            >
                                                <RecentCloseIcon />
                                            </TouchableOpacity>
                                        </Animated.View>
                                    ))}
                                    {tabRecents.length > PREVIEW_RECENTS && (
                                        <Animated.View key="more-toggle" layout={LinearTransition.duration(220)}>
                                            <TouchableOpacity
                                                style={styles.recentMoreChip}
                                                onPress={() => setRecentsExpanded((e) => !e)}
                                                activeOpacity={0.7}
                                            >
                                                <Text style={styles.recentMoreText}>
                                                    {recentsExpanded ? "Show less" : "Show more"}
                                                </Text>
                                                <ChevronIcon up={recentsExpanded} />
                                            </TouchableOpacity>
                                        </Animated.View>
                                    )}
                                </Animated.View>
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
                                            {rated ? (
                                                <View style={styles.ratedCluster}>
                                                    <View style={styles.ratedTagRow}>
                                                        <View style={[styles.ratedDot, { backgroundColor: bucketColor(song.my_bucket!) }]} />
                                                        <Text style={styles.ratedTagText}>RATED</Text>
                                                    </View>
                                                    <Text style={[styles.ratedScore, { color: bucketColor(song.my_bucket!) }]}>
                                                        {scoresLocked ? "?" : song.my_score!.toFixed(1)}
                                                    </Text>
                                                </View>
                                            ) : (
                                                <TouchableOpacity
                                                    style={styles.ratePill}
                                                    onPress={() => handleSearchRatePress(song)}
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
                                {/* Popular on LISTn — global, always visible. Label adapts: a real
                                    "this week" chart when the window has signal, else all-time backfill. */}
                                <View style={styles.discoverSectionRow}>
                                    <Text style={styles.discoverSectionLabel}>
                                        {popularWindow === "week" ? "POPULAR ON LISTN · THIS WEEK" : "POPULAR ON LISTN"}
                                    </Text>
                                </View>
                                {popular.length > 0 ? (
                                    <ScrollView
                                        horizontal
                                        showsHorizontalScrollIndicator={false}
                                        style={styles.popularScroll}
                                        contentContainerStyle={styles.popularScrollContent}
                                        onScrollBeginDrag={() => setConfirmingPopularId(null)}
                                    >
                                        {popular.map((item) => (
                                            <PopularCard
                                                key={item.song.id}
                                                item={item}
                                                size={popularTileSize}
                                                isConfirming={confirmingPopularId === item.song.id}
                                                onArm={() => setConfirmingPopularId(item.song.id)}
                                                onDismiss={() => setConfirmingPopularId(null)}
                                                onView={() => {
                                                    setConfirmingPopularId(null)
                                                    navigation.navigate("SongDetail", { song: item.song })
                                                }}
                                            />
                                        ))}
                                    </ScrollView>
                                ) : (
                                    <Text style={styles.popularEmptyNote}>
                                        Nothing here yet. Rate a song to get it going.
                                    </Text>
                                )}

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
                                    <BouncyPressable style={styles.coSignLockedCard}>
                                        {/* Left: pill + kicker, then ghost row */}
                                        <View style={styles.coSignLockedLeft}>
                                            <View style={styles.coSignLockedHeader}>
                                                <View style={styles.coSignPill}>
                                                    <Text style={styles.coSignPillText}>Co-sign</Text>
                                                </View>
                                                <Text style={styles.coSignKicker}>FRIENDS' UNANIMOUS 9s</Text>
                                            </View>
                                            <View style={styles.coSignGhostRow}>
                                                <HatchBox size={46} radius={8} tone="light" />
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
                                    </BouncyPressable>
                                )}

                                {/* Trending in your circle — live (top song this week) once the circle backend returns items, else locked */}
                                {trending.length > 0 ? (
                                    <TouchableOpacity
                                        style={styles.trendingCardLive}
                                        activeOpacity={0.85}
                                        onPress={() => navigation.navigate("SongDetail", { song: trending[0].song })}
                                        accessibilityLabel={`Open ${trending[0].song.title}`}
                                    >
                                        {/* Rounded square album art on the left (design treatment) */}
                                        <View style={styles.trendingCoverFull}>
                                            {trending[0].song.cover_url
                                                ? <Image source={{ uri: trending[0].song.cover_url }} style={styles.trendingCoverImg} />
                                                : null}
                                        </View>
                                        <View style={styles.trendingTextBlock}>
                                            <Text style={styles.trendingLiveKicker} numberOfLines={1}>TRENDING IN YOUR CIRCLE</Text>
                                            <Text style={styles.trendingTitle} numberOfLines={1}>{trending[0].song.title}</Text>
                                            <Text style={styles.trendingBody} numberOfLines={1}>{trending[0].song.artist.toUpperCase()}</Text>
                                        </View>
                                        <View style={styles.trendingStatBlock}>
                                            {/* spacer mirrors THIS WEEK's height below, so the count+arrow row sits centered */}
                                            <View style={styles.trendingStatSpacer} />
                                            <View style={styles.trendingStatNumRow}>
                                                <Text style={styles.trendingStatNum}>{trending[0].recent_circle_rating_count}</Text>
                                                {/* The 32px SVG has ~5px of dead padding each side; this box crops the layout
                                                    width to the visible arrow so the row's geometric centre (where THIS WEEK
                                                    centres) tracks the ink — correct for 1, 2, or 3 digits with no magic offset. */}
                                                <View style={styles.trendingStatArrowBox}>
                                                    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
                                                        <Path d="M4 20L20 4M15 4H20V9" stroke={colors.ink} strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
                                                    </Svg>
                                                </View>
                                            </View>
                                            <Text style={styles.trendingStatLabel}>THIS WEEK</Text>
                                        </View>
                                    </TouchableOpacity>
                                ) : (
                                    <BouncyPressable style={styles.trendingCard}>
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
                                                <Text style={styles.trendingTitle}>Locked</Text>
                                                <Text style={styles.trendingBody}>
                                                    Follow friends to see what's hot in your circle.
                                                </Text>
                                            </View>
                                            <Text style={styles.trendingCounter}>{Math.min(followingCount, 3)}/3</Text>
                                        </View>
                                    </BouncyPressable>
                                )}

                                {/* 2-col: Compatibility (live or locked) + Most-Rated (locked) */}
                                <View style={styles.twoColRow}>
                                    <BouncyPressable style={[styles.twoColCard, styles.compatCard]}>
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
                                                    <Text style={[styles.compatPct, styles.compatPctLocked]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>–%</Text>
                                                    <Text style={styles.compatAlignedLabel}>ALIGNED</Text>
                                                </View>
                                                <Text style={styles.compatBody}>Follow friends to see your match.</Text>
                                            </>
                                        )}
                                    </BouncyPressable>

                                    {mostRated.length > 0 ? (
                                        <TouchableOpacity
                                            style={[styles.twoColCard, styles.circleCard]}
                                            activeOpacity={0.85}
                                            onPress={() => navigation.navigate("SongDetail", { song: mostRated[0].song })}
                                            accessibilityLabel={`Open ${mostRated[0].song.title}`}
                                        >
                                            <View style={styles.circlePill}>
                                                <Text style={styles.circlePillText}>Most-rated</Text>
                                            </View>
                                            <View style={styles.circleLiveRow}>
                                                <View style={styles.circleCoverGlow}>
                                                    <View style={styles.circleCoverCircle}>
                                                        {mostRated[0].song.cover_url
                                                            ? <Image source={{ uri: mostRated[0].song.cover_url }} style={styles.circleCover} />
                                                            : null}
                                                    </View>
                                                </View>
                                                <View style={styles.circleSongText}>
                                                    <Text style={styles.circleSongTitle} numberOfLines={1}>{mostRated[0].song.title}</Text>
                                                    <Text style={styles.circleSongArtist} numberOfLines={1}>{mostRated[0].song.artist.toUpperCase()}</Text>
                                                </View>
                                            </View>
                                            <View style={[styles.circleCountRow, styles.circleCountRowTop]}>
                                                <Text style={styles.circleCountNum}>{mostRated[0].circle_rating_count}</Text>
                                                <Text style={styles.circleCountLabel}>TOTAL RATINGS</Text>
                                            </View>
                                        </TouchableOpacity>
                                    ) : (
                                        <BouncyPressable style={[styles.twoColCard, styles.circleCard]}>
                                            <View style={styles.circlePill}>
                                                <Text style={styles.circlePillText}>Most-rated</Text>
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
                                        </BouncyPressable>
                                    )}
                                </View>

                                {/* Curated Lists — locked with rated count progress */}
                                <View style={styles.discoverSectionRow}>
                                    <Text style={styles.discoverSectionLabel}>CURATED LISTS</Text>
                                </View>
                                <BouncyPressable style={styles.curatedCard}>
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
                                </BouncyPressable>
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
        // Align the right-side icon with the title (bottom of the kicker+heading
        // column), not the small kicker label above it.
        alignItems: "flex-end",
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
        // lineHeight clears the display font's descender (kept consistent across
        // all screen titles); 29 (< fontSize) clipped descenders like "g".
        lineHeight: 36,
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
        fontFamily: fonts.display,
        fontSize: 11.5,
        color: colors.accent,
    },
    recentChips: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    recentChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 999,
        paddingVertical: 8,
        // Asymmetric: tighter on the icon side, roomier past the dismiss badge.
        paddingLeft: 10,
        paddingRight: 11,
    },
    // Icon + query as one tap target, so tapping the icon re-runs the search too.
    recentChipBody: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    recentChipIcon: {
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: colors.bg,
        borderWidth: 1,
        borderColor: colors.line,
        alignItems: "center",
        justifyContent: "center",
    },
    recentChipText: {
        fontFamily: fonts.display,
        fontSize: 12.5,
        color: colors.ink,
    },
    recentChipClose: {
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: colors.line,
        alignItems: "center",
        justifyContent: "center",
    },
    // "Show more / less" expander — chip-shaped but quieter (no fill, no dismiss badge).
    recentMoreChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        backgroundColor: colors.bg,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 999,
        paddingVertical: 8,
        paddingHorizontal: 13,
    },
    recentMoreText: {
        fontFamily: fonts.display,
        fontSize: 12,
        color: colors.inkSoft,
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
    searchHint: {
        alignItems: "center",
        marginTop: 36,
        gap: 9,
    },
    searchHintText: {
        fontFamily: fonts.mono,
        fontSize: 11,
        letterSpacing: 0.8,
        color: colors.inkDim,
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
        // Accent fill + hard ink offset shadow — the same primary-action treatment as the
        // people-results Follow pill (an ink shadow only reads against the accent fill, not an ink one).
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
    popularScroll: {
        marginHorizontal: -14,
    },
    popularScrollContent: {
        paddingHorizontal: 14,
        gap: 10,
        paddingBottom: 12,
    },
    popularCoverBox: {
        borderRadius: 12,
        backgroundColor: colors.paper2,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 6,
        overflow: "hidden",
    },
    popularCover: {
        width: "100%",
        height: "100%",
    },
    popularEmptyNote: {
        fontFamily: fonts.mono,
        fontSize: 11,
        color: colors.inkDim,
        paddingBottom: 12,
    },
    popularTileTitle: {
        fontWeight: "700",
        fontSize: 11.5,
        color: colors.ink,
        textAlign: "left",
        lineHeight: 14,
        marginBottom: 2,
    },
    popularTileArtist: {
        fontFamily: fonts.mono,
        fontSize: 8,
        color: colors.inkDim,
        textAlign: "left",
        letterSpacing: 0.3,
    },
    // Dim is drawn by the radial-gradient Svg; the overlay itself just centers the label.
    popularConfirmOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: "center",
        justifyContent: "center",
    },
    // No container — label + a chevron stacked beneath it, bouncing together over the center-
    // weighted scrim. monoBold + letter spacing matches the app's CTA labels; cream is its warm
    // off-white for text on dark surfaces. Column keeps the word horizontally centered.
    popularViewStack: {
        alignItems: "center",
        gap: 1,
        paddingHorizontal: 8,
        paddingVertical: 5,
    },
    // Archivo Black (display) so the word carries the same geometric heft as the bold arrow, and
    // flat — no shadow — so the two read as one drawn asset rather than text-plus-icon.
    popularViewLabel: {
        fontFamily: fonts.display,
        fontSize: 13,
        letterSpacing: 0.5,
        color: colors.cream,
    },
    popularViewChevron: {
        marginTop: 2,
    },
    coSignLockedCard: {
        backgroundColor: colors.berry,
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
    // Live trending card: a rounded square album art on the left, then text + stat in a centered
    // row (matches the core-screen design treatment).
    trendingCardLive: {
        backgroundColor: colors.butter,
        borderRadius: 16,
        marginBottom: 8,
        padding: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 11,
    },
    trendingCoverFull: {
        width: 54,
        height: 54,
        borderRadius: 9,
        backgroundColor: "rgba(0,0,0,0.14)",
        overflow: "hidden",
        flexShrink: 0,
    },
    // Absolute fill keeps the album art's intrinsic pixel height from driving any layout.
    trendingCoverImg: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    trendingLiveKicker: {
        fontFamily: fonts.mono,
        fontSize: 9.5,
        letterSpacing: 0.4,
        color: "rgba(17,19,28,0.82)",
        fontWeight: "700",
        marginBottom: 4,
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
        paddingHorizontal: 11,
        paddingTop: 11,
        // Slightly tighter bottom padding offsets the line-box space under the
        // big stat number, so the card doesn't read bottom-heavy.
        paddingBottom: 9,
        // Header pill hugs the top, headline stat hugs the bottom — leftover
        // height (the cards stretch to equal heights) spreads between sections
        // instead of pooling under the last row.
        justifyContent: "space-between",
    },
    compatCard: {
        backgroundColor: colors.teal,
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
    // Locked placeholder "–%" matches the blank bars/lock-circle shade, not bold white.
    compatPctLocked: {
        color: "rgba(255,255,255,0.4)",
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
    // The live count row follows the song row, so it needs its own top gap.
    circleCountRowTop: {
        marginTop: 9,
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
    // --- Live circle cards (Trending / Most-rated): reuse the locked containers above ---
    circleCoverFrame: {
        width: 40,
        height: 40,
        borderRadius: 8,
        backgroundColor: "rgba(0,0,0,0.14)",
        overflow: "hidden",
        flexShrink: 0,
    },
    circleCover: {
        width: "100%",
        height: "100%",
    },
    // Most-rated cover is circular with a soft gold glow (design: orbCover). The
    // glow lives on an outer view because the inner clip (overflow: hidden) would
    // otherwise crop the shadow.
    circleCoverGlow: {
        width: 34,
        height: 34,
        borderRadius: 17,
        shadowColor: colors.gold,
        shadowOpacity: 0.4,
        shadowRadius: 5,
        shadowOffset: { width: 0, height: 0 },
        flexShrink: 0,
    },
    circleCoverCircle: {
        width: 34,
        height: 34,
        borderRadius: 17,
        overflow: "hidden",
        backgroundColor: "rgba(0,0,0,0.14)",
    },
    // [spacer][count+arrow row][THIS WEEK] — the spacer equals the label block below it, so the
    // count+arrow row lands at the column's centre while the label still counts toward the card
    // height (stays inside the card).
    trendingStatBlock: {
        alignItems: "center",
        flexShrink: 0,
        // Roomy enough that a rare 3-digit count + gap + arrow never clips; 1–2 digits size to content.
        maxWidth: 84,
    },
    trendingStatSpacer: {
        height: 12,
    },
    // alignItems center lines the number up with the arrow's vertical middle. The gap restores the
    // breathing room the cropped arrow box removed (it's symmetric, so it doesn't affect centering).
    trendingStatNumRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    // Crops the arrow's layout width to its visible ink (the 32px SVG, centered, overflows this box
    // by ~5px each side). Keeps the SVG's full height so the vertical alignment is untouched.
    trendingStatArrowBox: {
        width: 22,
        alignItems: "center",
        justifyContent: "center",
    },
    trendingStatNum: {
        fontFamily: fonts.display,
        fontSize: 22,
        color: colors.ink,
        lineHeight: 22,
        // Digits sit a couple px high in their line box; nudge down so the number reads as centered
        // on the arrow's vertical middle.
        marginTop: 4,
    },
    trendingStatLabel: {
        // In flow, directly under the count+arrow row (mirrored by the spacer above). lineHeight is
        // fixed so the spacer can match this block's height exactly. No manual offset: alignItems
        // center on the column centres it under the row, which is now correct for any digit count
        // because the arrow box is cropped to its ink.
        marginTop: 2,
        lineHeight: 10,
        fontFamily: fonts.mono,
        fontSize: 7.5,
        letterSpacing: 1.2,
        textAlign: "center",
        color: "rgba(17,19,28,0.5)",
        fontWeight: "700",
    },
    circleLiveRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    circleSongText: {
        flex: 1,
        minWidth: 0,
    },
    circleSongTitle: {
        fontFamily: fonts.display,
        fontSize: 13,
        color: "#fff",
        lineHeight: 14,
    },
    circleSongArtist: {
        fontFamily: fonts.mono,
        fontSize: 7,
        color: colors.cdim,
        letterSpacing: 0.5,
        marginTop: 2,
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
