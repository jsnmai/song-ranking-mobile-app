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
    interpolate,
    LinearTransition,
    useAnimatedScrollHandler,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from "react-native-reanimated"
import type { SharedValue } from "react-native-reanimated"
import { CompositeNavigationProp, useFocusEffect, useNavigation, useRoute, RouteProp } from "@react-navigation/native"
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"
import * as SecureStore from "expo-secure-store"
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from "react-native-svg"

import { ApiError } from "../../api/client"
import BouncyPressable from "../../components/BouncyPressable"
import { DriftingStars, StarDot } from "../../components/DriftingStars"
import FindYourPeopleCard from "../../components/FindYourPeopleCard"
import HatchBox from "../../components/HatchBox"
import { AppStackParamList, DiscoverStackParamList, TabParamList } from "../../navigation/types"
import { bucketColor, colors, fonts } from "../../theme"
import { usePullRefresh } from "../../hooks/usePullRefresh"
import { useAuth } from "../auth/AuthContext"
import { followUser, searchProfiles, unfollowUser } from "../profile/apiRequests"
import { Profile } from "../profile/types"
import { searchSongs } from "../search/apiRequests"
import { SongSearchResult } from "../search/types"
import { getCircleMostRated, getCircleTrending, getNewRelease, getPopular, listCoSigns } from "./apiRequests"
import NewReleaseCard from "./NewReleaseCard"
import SocialDiscoveryCard from "./SocialDiscoveryCard"
import { CircleMostRatedItem, CircleTrendingItem, CoSignItem, NewReleaseItem, PopularItem, PopularWindow } from "./types"

const RECENT_KEY = "discover_recent_searches"
// Recents are kept per scope (songs vs people). Show this many at rest; the rest sit
// behind a "Show more" chip, with each scope's stored history capped independently.
const PREVIEW_RECENTS = 6
const RECENT_CAP_PER_MODE = 12
// A circle aggregate (Trending / Most-rated) needs this many visible circle members before it
// can ever surface a song — mirrors CIRCLE_MIN_CONTRIBUTORS in the backend. Once the viewer has
// this many mutual follows the card stops asking for more and instead waits for them to converge
// on a song, so we split the locked card into "build your circle" vs "warming up" at this line.
const CIRCLE_MIN_MEMBERS = 3
// Song search fetches up to APPLE_SEARCH_LIMIT results in one request (apiRequests.ts) but
// only shows this many at a time; "Load more" reveals more of what's already fetched.
const SONG_RESULTS_PAGE_SIZE = 10

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

function MoonIcon({ color = "#fff", size = 18 }: { color?: string; size?: number }) {
    return (
        <Svg
            testID="quiet-moon-icon"
            accessibilityLabel="Quiet for now"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
        >
            <Path
                d="M19.2 14.9A7.8 7.8 0 0 1 9.1 4.8A8.1 8.1 0 1 0 19.2 14.9Z"
                fill={color}
            />
        </Svg>
    )
}

function LockIcon({ color = "#fff", size = 20 }: { color?: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <Path
                d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4"
                stroke={color}
                strokeWidth={2}
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
                                {/* Just the arrowhead — a chevron, not a full shaft+head arrow.
                                    Sharp (miter) tip so it reads as a crisp arrowhead, not a bubbly
                                    icon. viewBox cropped tight so the stack stays centered. */}
                                <Svg width={13} height={17} viewBox="6 4 12 16" fill="none" style={styles.popularViewChevron}>
                                    {/* strokeWidth ~2.4 → renders ~2.6px, matching the Archivo Black
                                        stem thickness of VIEW; same cream so word + arrow read as one. */}
                                    <Path d="M9 6 L15 12 L9 18" stroke={colors.cream} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="miter" />
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

// Fixed scatter of faint stars behind the navy Most-rated card, so its background reads as a
// night sky rather than a flat dark fill. Positions/sizes are constant (the field shouldn't
// twinkle-shift between renders); a couple render in gold to echo the card's accent.
const MOST_RATED_STARS: { left: `${number}%`; top: `${number}%`; size: number; opacity: number; gold?: boolean }[] = [
    { left: "8%", top: "18%", size: 2, opacity: 0.5 },
    { left: "19%", top: "60%", size: 1.5, opacity: 0.32 },
    { left: "15%", top: "85%", size: 2.5, opacity: 0.45, gold: true },
    { left: "33%", top: "28%", size: 1.5, opacity: 0.3 },
    { left: "45%", top: "74%", size: 2, opacity: 0.4 },
    { left: "52%", top: "44%", size: 1.5, opacity: 0.26 },
    { left: "58%", top: "20%", size: 1.5, opacity: 0.34 },
    { left: "68%", top: "56%", size: 2.5, opacity: 0.5 },
    { left: "77%", top: "84%", size: 1.5, opacity: 0.3 },
    { left: "85%", top: "32%", size: 2, opacity: 0.44 },
    { left: "90%", top: "68%", size: 1.5, opacity: 0.34, gold: true },
    { left: "40%", top: "90%", size: 1.5, opacity: 0.28 },
]

// Normalized for the shared drifting starfield: percent coords, radius = half the dot size,
// gold accents carried through as per-dot colours.
const MOST_RATED_DOTS: StarDot[] = MOST_RATED_STARS.map((s) => ({
    x: parseFloat(s.left),
    y: parseFloat(s.top),
    r: s.size / 2,
    o: s.opacity,
    c: s.gold ? colors.gold : undefined,
}))

function MostRatedStars() {
    return <DriftingStars dots={MOST_RATED_DOTS} />
}

// Width + opacity track the live drag distance from this dot's page (continuous,
// not snapped), so the pill grows/shrinks smoothly as the carousel is dragged.
function CoSignDot({ index, scrollX, cardWidth }: { index: number; scrollX: SharedValue<number>; cardWidth: number }) {
    const style = useAnimatedStyle(() => {
        const distance = Math.abs(scrollX.value / cardWidth - index)
        return {
            width: interpolate(distance, [0, 1], [14, 5], "clamp"),
            opacity: interpolate(distance, [0, 1], [1, 0.35], "clamp"),
        }
    })
    return <Animated.View style={[styles.coSignDot, style]} />
}

export default function DiscoverScreen() {
    const route = useRoute<DiscoverRouteProp>()
    const navigation = useNavigation<DiscoverNavigationProp>()
    const { token, profile } = useAuth()
    const insets = useSafeAreaInsets()
    const searchRef = useRef<TextInput>(null)
    const [searchFocused, setSearchFocused] = useState(false)
    const [searchMode, setSearchMode] = useState<"songs" | "users">(route.params?.searchMode ?? "songs")
    const [query, setQuery] = useState("")
    const [recentSearches, setRecentSearches] = useState<RecentEntry[]>([])
    // Whether the current scope's recents are expanded past the preview count.
    const [recentsExpanded, setRecentsExpanded] = useState(false)
    // Session-only dismiss for the People-tab "Find your people" nudge (like the Feed card).
    const [findPeopleDismissed, setFindPeopleDismissed] = useState(false)
    const recentLoaded = useRef(false)
    const [songResults, setSongResults] = useState<SongSearchResult[]>([])
    const [visibleSongCount, setVisibleSongCount] = useState(SONG_RESULTS_PAGE_SIZE)
    const [profileResults, setProfileResults] = useState<Profile[]>([])
    const [followBusy, setFollowBusy] = useState<Set<string>>(new Set())
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [quietToastVisible, setQuietToastVisible] = useState(false)
    const [quietToastKey, setQuietToastKey] = useState(0)
    const quietToastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [coSigns, setCoSigns] = useState<CoSignItem[]>([])
    const coSignScrollX = useSharedValue(0)
    const coSignScrollOpacity = useSharedValue(1)
    const [isDiscoveryLoading, setIsDiscoveryLoading] = useState(false)
    const [discoveryError, setDiscoveryError] = useState<string | null>(null)
    const [trending, setTrending] = useState<CircleTrendingItem[]>([])
    const [mostRated, setMostRated] = useState<CircleMostRatedItem[]>([])
    // Visible circle members (mutual follows) from the circle endpoints. Drives the honest
    // "X/3" progress and the locked-vs-warming-up split on the circle cards: with < 3 members
    // an aggregate can never surface (follow more), with >= 3 it just hasn't converged yet.
    const [circleSize, setCircleSize] = useState(0)
    const [newRelease, setNewRelease] = useState<NewReleaseItem | null>(null)
    const [popular, setPopular] = useState<PopularItem[]>([])
    const [popularWindow, setPopularWindow] = useState<PopularWindow>("week")
    // Which Popular tile is showing its "View" confirmation (null = none armed).
    const [confirmingPopularId, setConfirmingPopularId] = useState<number | null>(null)
    // Size the 4 Popular tiles to fill the content row exactly (14px padding each side, three
    // 10px gaps), so the scroller rests flush with both screen edges while still bouncing.
    const { width: windowWidth } = useWindowDimensions()
    const coSignCardWidth = windowWidth - 28
    const popularTileSize = (windowWidth - 28 - 30) / 4
    // Pin both two-col cards (New Release + Most-rated) to an identical width so the split
    // lands dead-centre. flex:1 alone let the Most-rated card's fixed-width count row bias it
    // wider. 28 = scroll padding (14×2), 8 = the twoColRow gap.
    const twoColCardWidth = (windowWidth - 28 - 8) / 2

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

    // The "Find your people" nudge stays available on the People tab every visit; the ✕
    // only hides it for the current visit. Reset the dismiss each time search is (re)opened
    // so it's offered again next time, without nagging within the same session.
    useEffect(() => {
        if (searchFocused) {
            setFindPeopleDismissed(false)
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

    // People-tab "Find your people" card actions. Contacts-sync and invite aren't built
    // yet, so both buttons fall back to surfacing the search field (bringing the keyboard
    // up) so the user can start typing a name — the Feed card's deferred equivalent.
    const handleFindPeople = () => {
        searchRef.current?.focus()
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
                        setVisibleSongCount(SONG_RESULTS_PAGE_SIZE)
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
            const [coSignResponse, trendingResponse, mostRatedResponse, popularResponse, newReleaseResponse] =
                await Promise.all([
                    listCoSigns(token),
                    getCircleTrending(token),
                    getCircleMostRated(token),
                    getPopular(token),
                    getNewRelease(token),
                ])
            setCoSigns(coSignResponse.items)
            setTrending(trendingResponse.items)
            setMostRated(mostRatedResponse.items)
            setCircleSize(trendingResponse.circle_size)
            setPopular(popularResponse.items)
            setPopularWindow(popularResponse.window)
            setNewRelease(newReleaseResponse.items[0] ?? null)
        } catch (err) {
            setDiscoveryError(
                err instanceof ApiError ? err.detail : "Social discovery is temporarily unavailable.",
            )
        }
    }, [token])

    // Refetch on focus (not just on token change) so a transient backend error can't leave the
    // discovery section stuck on a stale error — matching how Feed and Profile recover on focus.
    // Only the FIRST load shows the full-section spinner; every later focus (e.g. swiping back from
    // Song Detail) refreshes silently in the background so the content never flashes to a spinner.
    const hasLoadedDiscoveryRef = useRef(false)
    useFocusEffect(
        useCallback(() => {
            if (!token) return
            let isCurrentRequest = true
            const isFirstLoad = !hasLoadedDiscoveryRef.current
            if (isFirstLoad) {
                setIsDiscoveryLoading(true)
                setDiscoveryError(null)
            }
            Promise.all([
                listCoSigns(token),
                getCircleTrending(token),
                getCircleMostRated(token),
                getPopular(token),
                getNewRelease(token),
            ])
                .then(([coSignResponse, trendingResponse, mostRatedResponse, popularResponse, newReleaseResponse]) => {
                    if (!isCurrentRequest) return
                    hasLoadedDiscoveryRef.current = true
                    setDiscoveryError(null)
                    setCoSigns(coSignResponse.items)
                    setTrending(trendingResponse.items)
                    setMostRated(mostRatedResponse.items)
                    setCircleSize(trendingResponse.circle_size)
                    setPopular(popularResponse.items)
                    setPopularWindow(popularResponse.window)
                    setNewRelease(newReleaseResponse.items[0] ?? null)
                })
                .catch((err) => {
                    // A failed SILENT refresh leaves the existing content in place; only surface the
                    // error (and the blanked section) when there is nothing to show yet (first load).
                    if (isCurrentRequest && isFirstLoad) {
                        setDiscoveryError(
                            err instanceof ApiError
                                ? err.detail
                                : "Social discovery is temporarily unavailable.",
                        )
                    }
                })
                .finally(() => {
                    if (isCurrentRequest && isFirstLoad) setIsDiscoveryLoading(false)
                })
            return () => { isCurrentRequest = false }
        }, [token]),
    )

    const { refreshing, onRefresh } = usePullRefresh(refreshDiscovery)
    const hasMultipleCoSigns = coSigns.length > 1

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

    // Dots track scrollX continuously (see CoSignDot) and dim while a drag or
    // momentum fling is in flight, then settle back to full opacity on rest.
    const coSignScrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => {
            coSignScrollX.value = event.contentOffset.x
        },
        onBeginDrag: () => {
            coSignScrollOpacity.value = withTiming(0.35, { duration: 150 })
        },
        onMomentumEnd: () => {
            coSignScrollOpacity.value = withTiming(1, { duration: 200 })
        },
    })
    const coSignDotsRowStyle = useAnimatedStyle(() => ({ opacity: coSignScrollOpacity.value }))

    const showQuietToast = () => {
        if (quietToastTimeout.current) clearTimeout(quietToastTimeout.current)
        setQuietToastKey((current) => current + 1)
        setQuietToastVisible(true)
        quietToastTimeout.current = setTimeout(() => {
            setQuietToastVisible(false)
            quietToastTimeout.current = null
        }, 1200)
    }

    useEffect(() => () => { if (quietToastTimeout.current) clearTimeout(quietToastTimeout.current) }, [])

    const dismissPopularConfirmation = useCallback(() => {
        setConfirmingPopularId(null)
    }, [])

    useFocusEffect(
        useCallback(() => {
            return dismissPopularConfirmation
        }, [dismissPopularConfirmation]),
    )

    const trimmedQuery = query.trim()
    const hasQuery = trimmedQuery.length > 0
    // Recents are scoped to the active tab; collapse to a preview unless expanded.
    const tabRecents = recentSearches.filter(r => r.mode === searchMode)
    const visibleRecents = recentsExpanded ? tabRecents : tabRecents.slice(0, PREVIEW_RECENTS)
    const ratedCount = profile?.user_stats?.rated_count ?? 0
    const hasEnoughFollowsForCoSign = (profile?.following_count ?? 0) >= 2
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
                testID="discover-scroll"
                style={styles.scroll}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 92 }]}
                keyboardShouldPersistTaps="handled"
                onScrollBeginDrag={dismissPopularConfirmation}
                refreshControl={
                    searchFocused ? undefined : (
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={colors.inkDim}
                        />
                    )
                }
            >
                {searchFocused ? (
                    <>
                        {isLoading && (
                            <View style={styles.loaderSlot}>
                                <ActivityIndicator color={colors.accent} />
                            </View>
                        )}

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

                        {/* Find-your-people nudge — People tab resting state, below Recent so a
                            returning user's recent searches stay at the top. Always available
                            here (no follow-count gate); the ✕ only hides it for the current visit
                            and it returns on the next one. */}
                        {searchMode === "users" && !isLoading && error === null && !hasQuery
                            && !findPeopleDismissed && (
                            <FindYourPeopleCard
                                style={styles.findPeopleCard}
                                onConnect={handleFindPeople}
                                onInvite={handleFindPeople}
                                onDismiss={() => setFindPeopleDismissed(true)}
                            />
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
                                {songResults.slice(0, visibleSongCount).map((song, i) => {
                                    const rated = song.my_bucket != null && song.my_score != null
                                    return (
                                        <TouchableOpacity
                                            key={song.apple_track_id ?? song.deezer_id ?? `${song.title}:${song.artist}`}
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

                        {!isLoading && error === null && searchMode === "songs" && songResults.length > visibleSongCount && (
                            <TouchableOpacity
                                style={styles.loadMoreBtn}
                                onPress={() => setVisibleSongCount((c) => c + SONG_RESULTS_PAGE_SIZE)}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.loadMoreText}>Load more</Text>
                            </TouchableOpacity>
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
                            <View style={styles.loaderSlot}>
                                <ActivityIndicator color={colors.accent} />
                            </View>
                        )}
                        {!isDiscoveryLoading && discoveryError && (
                            <Text style={styles.errorText}>{discoveryError}</Text>
                        )}
                        {!isDiscoveryLoading && !discoveryError && (
                            <>
                                {/* Popular on LISTn — global, always visible. Label adapts: a real
                                    "this week" chart when the window has signal, else all-time backfill. */}
                                <View style={[styles.discoverSectionRow, styles.firstDiscoverSectionRow]}>
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
                                        onScrollBeginDrag={dismissPopularConfirmation}
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

                                {/* Co-Sign — live when people the viewer follows co-sign, locked otherwise */}
                                {coSigns.length > 0 ? (
                                    <View style={styles.coSignSwipeWindow}>
                                        <Animated.ScrollView
                                            horizontal
                                            pagingEnabled
                                            snapToInterval={coSignCardWidth}
                                            decelerationRate="fast"
                                            showsHorizontalScrollIndicator={false}
                                            bounces={false}
                                            style={styles.coSignCarousel}
                                            testID="co-sign-carousel"
                                            onScroll={coSignScrollHandler}
                                            scrollEventThrottle={16}
                                        >
                                            {coSigns.map((item, index) => (
                                                <View
                                                    key={`co-sign-${item.song.id}`}
                                                    style={[styles.coSignSlide, { width: coSignCardWidth }]}
                                                >
                                                    <SocialDiscoveryCard
                                                        item={item}
                                                        token={token ?? ""}
                                                        embedded
                                                        pageIndex={index}
                                                        pageCount={coSigns.length}
                                                        onOpen={() => handleDiscoverySongPress(item)}
                                                        onRate={() => handleRatePress(item)}
                                                    />
                                                </View>
                                            ))}
                                        </Animated.ScrollView>
                                        {/* Overlaid outside the ScrollView so it stays fixed in place while the
                                            cards swipe underneath it. Width/opacity per dot track the live drag
                                            position continuously; the whole row also dims while actively scrolling. */}
                                        {hasMultipleCoSigns ? (
                                            <Animated.View
                                                style={[styles.coSignDotsOverlay, coSignDotsRowStyle]}
                                                pointerEvents="none"
                                            >
                                                {coSigns.map((item, index) => (
                                                    <CoSignDot
                                                        key={`co-sign-dot-${item.song.id}`}
                                                        index={index}
                                                        scrollX={coSignScrollX}
                                                        cardWidth={coSignCardWidth}
                                                    />
                                                ))}
                                            </Animated.View>
                                        ) : null}
                                    </View>
                                ) : (
                                    <BouncyPressable
                                        style={styles.coSignLockedCard}
                                        onPress={hasEnoughFollowsForCoSign ? showQuietToast : undefined}
                                    >
                                        {/* Left: pill + kicker, then ghost row */}
                                        <View style={styles.coSignLockedLeft}>
                                            <View style={styles.coSignLockedHeader}>
                                                <View style={styles.coSignPill}>
                                                    <Text style={styles.coSignPillText}>Co-sign</Text>
                                                </View>
                                                <Text style={styles.coSignKicker}>PEOPLE YOU FOLLOW RATED 9+</Text>
                                            </View>
                                            <View style={styles.coSignGhostRow}>
                                                <HatchBox size={46} radius={8} tone="light" />
                                                <View style={styles.coSignGhostLines}>
                                                    <View style={[styles.coSignGhostLine, { width: "72%" }]} />
                                                    <View style={[styles.coSignGhostLine, { width: "46%", opacity: 0.65 }]} />
                                                </View>
                                            </View>
                                        </View>
                                        {/* Right: lock until enough follows; sleepy once follows are enough but quiet. */}
                                        <View
                                            style={styles.coSignLockCircle}
                                            testID={hasEnoughFollowsForCoSign ? "co-sign-quiet-cue" : "co-sign-lock-cue"}
                                        >
                                            {hasEnoughFollowsForCoSign
                                                ? <MoonIcon color="#fff" size={20} />
                                                : <LockIcon color="#fff" size={22} />}
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
                                ) : circleSize >= CIRCLE_MIN_MEMBERS ? (
                                    /* Warming up: the viewer has enough circle members, so this is NOT
                                       locked on an action they can take. It fills in once the circle rates the
                                       same song this week, so we drop the lock + counter and say so plainly. */
                                    <BouncyPressable style={styles.trendingCard}>
                                        <View style={styles.trendingLockCircle}>
                                            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                                                <Path d="M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z"
                                                    stroke={colors.ink} strokeWidth={2}
                                                    strokeLinecap="round" strokeLinejoin="round" />
                                            </Svg>
                                        </View>
                                        <View style={styles.trendingTextBlock}>
                                            <Text style={styles.trendingKicker}>TRENDING IN YOUR CIRCLE</Text>
                                            <Text style={styles.trendingTitle}>Warming up</Text>
                                            <Text style={styles.trendingBody}>
                                                Nothing trending yet. This fills in as your circle rates the same songs.
                                            </Text>
                                        </View>
                                    </BouncyPressable>
                                ) : (
                                    /* Needs circle members: fewer than 3 visible circle members, so an aggregate can
                                       never surface. The counter tracks mutual circle members (not one-way
                                       follows), so it can't read 3/3 while the card stays locked. */
                                    <BouncyPressable style={styles.trendingCard}>
                                        <View style={styles.trendingLockCircle}>
                                            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                                                <Path d="M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zM7 11V7a5 5 0 0110 0v4"
                                                    stroke={colors.ink} strokeWidth={2}
                                                    strokeLinecap="round" strokeLinejoin="round" />
                                            </Svg>
                                        </View>
                                        <View style={styles.trendingTextBlock}>
                                            <Text style={styles.trendingKicker}>TRENDING IN YOUR CIRCLE</Text>
                                            <Text style={styles.trendingTitle}>Locked</Text>
                                            <Text style={styles.trendingBody}>
                                                Add people who follow you back to see what's hot in your circle.
                                            </Text>
                                        </View>
                                        <Text style={styles.trendingCounter}>{Math.min(circleSize, CIRCLE_MIN_MEMBERS)}/{CIRCLE_MIN_MEMBERS}</Text>
                                    </BouncyPressable>
                                )}

                                {/* 2-col: New Release (poster) + Most-Rated. New Release is the
                                    global weekly feed (one rotating pick per day); an empty feed
                                    (no batch yet) renders the card's placeholder state. */}
                                <View style={styles.twoColRow}>
                                    <NewReleaseCard
                                        item={newRelease}
                                        width={twoColCardWidth}
                                        onOpen={() => {
                                            if (newRelease) navigation.navigate("SongDetail", { song: newRelease.song })
                                        }}
                                        onRate={() => {
                                            if (newRelease) navigation.navigate("BucketSelection", { song: newRelease.song })
                                        }}
                                    />

                                    {mostRated.length > 0 ? (
                                        <TouchableOpacity
                                            style={[styles.twoColCard, styles.circleCard, { width: twoColCardWidth }]}
                                            activeOpacity={0.85}
                                            onPress={() => navigation.navigate("SongDetail", { song: mostRated[0].song })}
                                            accessibilityLabel={`Open ${mostRated[0].song.title}`}
                                        >
                                            <MostRatedStars />
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
                                                <Text style={styles.circleCountLabel}>IN CIRCLE</Text>
                                            </View>
                                        </TouchableOpacity>
                                    ) : circleSize >= CIRCLE_MIN_MEMBERS ? (
                                        /* Warming up: enough circle members, so this isn't locked on an
                                           action. It fills in once the circle converges on a song, so we
                                           drop the counter and say what the card will show. */
                                        <BouncyPressable
                                            style={[styles.twoColCard, styles.circleCard, { width: twoColCardWidth }]}
                                            testID="most-rated-warming"
                                        >
                                            <MostRatedStars />
                                            <View style={styles.circlePill}>
                                                <Text style={styles.circlePillText}>Most-rated</Text>
                                            </View>
                                            {/* Icon + state centered in its own flex zone (even space above and
                                                below it); the descriptor sits lower, lifted off the bottom. */}
                                            <View style={styles.circleLockMain}>
                                                <View style={styles.circleLockSquare}>
                                                    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                                                        <Path d="M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z"
                                                            stroke={colors.gold} strokeWidth={2}
                                                            strokeLinecap="round" strokeLinejoin="round" />
                                                    </Svg>
                                                </View>
                                                <Text style={styles.circleLockTitle}>Warming up</Text>
                                            </View>
                                            <Text style={styles.circleLockText}>Your circle's top song</Text>
                                        </BouncyPressable>
                                    ) : (
                                        /* Needs circle members: fewer than 3 mutual follows, so no aggregate
                                           can surface. The counter tracks mutual members, never one-way follows. */
                                        <BouncyPressable
                                            style={[styles.twoColCard, styles.circleCard, { width: twoColCardWidth }]}
                                            testID="most-rated-locked"
                                        >
                                            <MostRatedStars />
                                            <View style={styles.circlePill}>
                                                <Text style={styles.circlePillText}>Most-rated</Text>
                                            </View>
                                            {/* Lock + unlock progress centered in its own flex zone (even space
                                                above and below it); the descriptor sits lower, lifted off the
                                                bottom. "X/3 friends" over "to unlock" is the lock signal, no label. */}
                                            <View style={styles.circleLockMain}>
                                                <View style={styles.circleLockSquare}>
                                                    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                                                        <Path d="M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zM7 11V7a5 5 0 0110 0v4"
                                                            stroke={colors.gold} strokeWidth={2}
                                                            strokeLinecap="round" strokeLinejoin="round" />
                                                    </Svg>
                                                </View>
                                                <View style={styles.circleUnlockBlock}>
                                                    <View style={styles.circleUnlockCountRow}>
                                                        <Text style={styles.circleUnlockCount}>
                                                            {Math.min(circleSize, CIRCLE_MIN_MEMBERS)}/{CIRCLE_MIN_MEMBERS}
                                                        </Text>
                                                        <Text style={styles.circleUnlockUnit}>friends</Text>
                                                    </View>
                                                    <Text style={styles.circleUnlockLabel}>to unlock</Text>
                                                </View>
                                            </View>
                                            <Text style={styles.circleLockText}>Your circle's top song</Text>
                                        </BouncyPressable>
                                    )}
                                </View>

                                {/* Curated Lists — REMOVED FOR LAUNCH, deliberately kept commented.
                                    The feature is deferred to the future recommendations work (see
                                    launch plan); restore this block (and its curated* styles below)
                                    when lists ship rather than rebuilding from scratch.
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
                                */}
                            </>
                        )}
                    </>
                )}
            </ScrollView>
            {quietToastVisible ? (
                <Animated.View
                    key={quietToastKey}
                    pointerEvents="none"
                    entering={FadeIn.duration(90)}
                    exiting={FadeOut.duration(380)}
                    style={styles.quietToast}
                    testID="discover-quiet-toast"
                >
                    <Text style={styles.quietToastText}>It’s Quiet For Now</Text>
                </Animated.View>
            ) : null}
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.bg,
    },
    quietToast: {
        // Full-screen non-interactive overlay so the pill floats dead-center.
        ...StyleSheet.absoluteFillObject,
        alignItems: "center",
        justifyContent: "center",
        zIndex: 20,
    },
    quietToastText: {
        overflow: "hidden",
        borderRadius: 999,
        backgroundColor: "rgba(17,20,29,0.9)",
        color: "#fff",
        fontFamily: fonts.mono,
        fontSize: 10,
        fontWeight: "700",
        letterSpacing: 1.1,
        paddingHorizontal: 14,
        paddingVertical: 8,
        textTransform: "uppercase",
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
    // ── Find your people (People tab) ──────────────────────────────────
    // No horizontal margin — scrollContent already pads 14. Top gap separates it from
    // the recent chips above (collapses to just the scroll's top padding when there
    // are no recents, so it sits near the top for a first-time visitor).
    findPeopleCard: {
        marginTop: 18,
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
        // Small clearance so the native pull-to-refresh wheel doesn't graze the first row on
        // the way out.
        paddingTop: 10,
        paddingBottom: 96,
    },
    loaderSlot: {
        minHeight: 68,
        alignItems: "center",
        justifyContent: "center",
    },
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
    loadMoreBtn: {
        alignItems: "center",
        justifyContent: "center",
        marginTop: 10,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.paper,
    },
    loadMoreText: {
        fontFamily: fonts.display,
        fontSize: 12,
        color: colors.inkSoft,
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
    firstDiscoverSectionRow: {
        marginTop: 0,
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
    // Archivo Black (display) so the word carries the same geometric heft as the bold arrow.
    // lineHeight == fontSize + no font padding tightens the line box around the caps (Archivo
    // Black otherwise leaves big descender slack). With the arrow box now cropped tight, only a
    // hair of top offset is needed to land the visible word+arrow dead-center in the tile.
    popularViewLabel: {
        fontFamily: fonts.display,
        fontSize: 13,
        lineHeight: 13,
        includeFontPadding: false,
        letterSpacing: 0.5,
        color: colors.cream,
        marginTop: -1,
    },
    popularViewChevron: {
        marginTop: 4,
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
    coSignSwipeWindow: {
        backgroundColor: colors.berry,
        borderRadius: 16,
        // Match every other discovery card's gap (8) so the space above Trending
        // equals the space below it — the swipe window read 2px heavy at 10.
        marginBottom: 8,
        overflow: "hidden",
    },
    coSignCarousel: {
        backgroundColor: colors.berry,
    },
    coSignSlide: {
        backgroundColor: colors.berry,
    },
    coSignDotsOverlay: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 8,
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        gap: 4,
    },
    // width/opacity are driven by CoSignDot's animated style; this just fixes the
    // shape (borderRadius large enough to stay pill-shaped at the widest animated width).
    coSignDot: {
        height: 5,
        borderRadius: 999,
        backgroundColor: "#fff",
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
        padding: 12,
        marginBottom: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 11,
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
        fontSize: 8,
        letterSpacing: 1.3,
        color: colors.ink,
        fontWeight: "700",
        marginBottom: 3,
    },
    trendingLockCircle: {
        width: 44,
        height: 44,
        borderRadius: 8,
        borderWidth: 1.5,
        borderColor: "rgba(17,19,28,0.35)",
        borderStyle: "dashed",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
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
    // Dashed lock/clock square — enlarged so the lock + progress read as the card's
    // centered focal point rather than a small bottom-corner glyph.
    circleLockSquare: {
        width: 40,
        height: 40,
        borderRadius: 9,
        borderWidth: 1.5,
        borderColor: "rgba(245,184,64,0.55)",
        borderStyle: "dashed",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    circleLockTitle: {
        fontFamily: fonts.display,
        fontSize: 18,
        color: "#fff",
        letterSpacing: -0.2,
    },
    circleLockText: {
        fontFamily: fonts.mono,
        fontSize: 10.5,
        lineHeight: 15,
        color: colors.cdim,
        // Sits lower than the lock but lifted off the very bottom edge.
        marginBottom: 16,
    },
    // Lock/clock icon + state on one row that fills the space between the pill and the
    // descriptor (flex:1) and centers itself. paddingBottom nudges the centered content a
    // little higher. The count "X/3 friends / to unlock" is the lock signal, no "Locked" label.
    circleLockMain: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingBottom: 4,
    },
    circleUnlockBlock: {
        alignItems: "flex-start",
        gap: 1,
    },
    circleUnlockCountRow: {
        flexDirection: "row",
        alignItems: "baseline",
        gap: 4,
    },
    circleUnlockCount: {
        fontFamily: fonts.display,
        fontSize: 22,
        color: colors.gold,
        lineHeight: 22,
    },
    circleUnlockUnit: {
        fontFamily: fonts.mono,
        fontSize: 9,
        letterSpacing: 0.3,
        color: colors.cdim,
    },
    circleUnlockLabel: {
        fontFamily: fonts.mono,
        fontSize: 8,
        letterSpacing: 0.4,
        color: colors.cdim,
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
    // ── Curated Lists styles — feature commented out for launch (deferred to the
    //    recommendations work); kept so the commented JSX block restores cleanly. ──
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
