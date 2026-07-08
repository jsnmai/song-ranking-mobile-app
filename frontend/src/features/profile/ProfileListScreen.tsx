// ProfileList shows follower and following lists for any visible profile,
// styled per the Bento Orbit "Followers / Following" design: in-place tab
// toggle with counts, client-side search, and one card of hairline rows with
// MUTUAL chips and Follow/Following pill buttons.
import { useEffect, useState } from "react"
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native"
import { NativeStackScreenProps } from "@react-navigation/native-stack"
import Svg, { Circle, Path } from "react-native-svg"

import { ApiError } from "../../api/client"
import { AppStackParamList } from "../../navigation/types"
import { colors, fonts } from "../../theme"
import { useAuth } from "../auth/AuthContext"
import {
    followUser,
    getFollowers,
    getFollowing,
    getProfileByUsername,
    unfollowUser,
} from "./apiRequests"
import { Profile } from "./types"

type ProfileListProps = NativeStackScreenProps<AppStackParamList, "ProfileList">
type ListTab = "followers" | "following"

// Deterministic avatar background per user, cycling the Bento accent palette.
const AVATAR_COLORS = [colors.accent, colors.sky, colors.plum, colors.mint, colors.gold]

function avatarColor(username: string): string {
    let hash = 0
    for (let i = 0; i < username.length; i++) {
        hash = (hash * 31 + username.charCodeAt(i)) % 997
    }
    return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function BackIcon() {
    return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"
            stroke={colors.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
        </Svg>
    )
}

function SearchIcon() {
    return (
        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none"
            stroke={colors.inkSoft} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <Circle cx={11} cy={11} r={7} />
            <Path d="M21 21l-4.35-4.35" />
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

export default function ProfileListScreen({ navigation, route }: ProfileListProps) {
    const { token } = useAuth()
    const { username, listType } = route.params
    const [activeTab, setActiveTab] = useState<ListTab>(listType)
    const [lists, setLists] = useState<Record<ListTab, Profile[] | null>>({
        followers: null,
        following: null,
    })
    const [counts, setCounts] = useState<{ followers: number; following: number } | null>(null)
    const [query, setQuery] = useState("")
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [busyUsernames, setBusyUsernames] = useState<Set<string>>(new Set())

    const openProfile = (profile: Profile) => {
        if (profile.is_own_profile) {
            navigation.navigate("MainTabs", { screen: "Profile" })
            return
        }
        navigation.navigate("OtherProfile", { username: profile.username })
    }

    const handleToggleFollow = async (profile: Profile) => {
        if (!token || busyUsernames.has(profile.username)) {
            return
        }
        setBusyUsernames((prev) => new Set(prev).add(profile.username))
        try {
            const updated = profile.is_following
                ? await unfollowUser(profile.username, token)
                : await followUser(profile.username, token)
            setLists((prev) => ({
                followers: prev.followers?.map((p) => (p.username === updated.username ? updated : p)) ?? null,
                following: prev.following?.map((p) => (p.username === updated.username ? updated : p)) ?? null,
            }))
        } catch {
            // Leave the row unchanged; the user can retry from the row or the profile screen.
        } finally {
            setBusyUsernames((prev) => {
                const next = new Set(prev)
                next.delete(profile.username)
                return next
            })
        }
    }

    useEffect(() => {
        async function fetchCounts() {
            if (!token) {
                return
            }
            try {
                const summary = await getProfileByUsername(username, token)
                setCounts({
                    followers: summary.follower_count,
                    following: summary.following_count,
                })
            } catch {
                // Counts are decorative; the tab labels still work without them.
            }
        }
        fetchCounts()
    }, [token, username])

    useEffect(() => {
        async function fetchList() {
            if (!token || lists[activeTab] !== null) {
                return
            }
            setIsLoading(true)
            setError(null)
            try {
                const response = activeTab === "followers"
                    ? await getFollowers(username, token)
                    : await getFollowing(username, token)
                setLists((prev) => ({ ...prev, [activeTab]: response.profiles }))
            } catch (err) {
                if (err instanceof ApiError) {
                    setError(err.detail)
                } else if (err instanceof Error) {
                    setError(err.message)
                } else {
                    setError("Failed to load profiles.")
                }
            } finally {
                setIsLoading(false)
            }
        }
        fetchList()
    }, [activeTab, lists, token, username])

    const profiles = lists[activeTab]
    const trimmedQuery = query.trim().toLowerCase()
    const visibleProfiles = profiles?.filter(
        (p) =>
            trimmedQuery.length === 0
            || p.display_name.toLowerCase().includes(trimmedQuery)
            || p.username.toLowerCase().includes(trimmedQuery)
    ) ?? null

    const formatCount = (value: number) =>
        value >= 1000 ? `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k` : `${value}`

    return (
        <View style={styles.container}>
            {/* Nav bar: back icon button + centered @username */}
            <View style={styles.navBar}>
                <View style={styles.navSide}>
                    <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={() => navigation.goBack()}
                        accessibilityLabel="Back"
                    >
                        <BackIcon />
                    </TouchableOpacity>
                </View>
                <Text style={styles.navTitle}>@{username}</Text>
                <View style={[styles.navSide, { alignItems: "flex-end" }]} />
            </View>

            <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
                {/* Followers / Following toggle */}
                <View style={styles.toggleRow}>
                    {(["followers", "following"] as const).map((tab) => {
                        const active = tab === activeTab
                        const label = tab === "followers" ? "Followers" : "Following"
                        const count = counts === null ? null : counts[tab]
                        return (
                            <TouchableOpacity
                                key={tab}
                                style={[styles.toggleBtn, active && styles.toggleBtnActive]}
                                onPress={() => { setActiveTab(tab); setQuery("") }}
                                activeOpacity={0.8}
                            >
                                <Text style={[styles.toggleLabel, active && styles.toggleLabelActive]}>
                                    {label}
                                </Text>
                                {count !== null && (
                                    <Text style={[styles.toggleCount, active && styles.toggleCountActive]}>
                                        {formatCount(count)}
                                    </Text>
                                )}
                            </TouchableOpacity>
                        )
                    })}
                </View>

                {/* Search */}
                <View style={styles.searchBar}>
                    <SearchIcon />
                    <TextInput
                        style={styles.searchInput}
                        value={query}
                        onChangeText={setQuery}
                        placeholder={activeTab === "followers" ? "Search followers…" : "Search following…"}
                        placeholderTextColor={colors.inkDim}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                    {query.length > 0 && (
                        <TouchableOpacity
                            onPress={() => setQuery("")}
                            hitSlop={8}
                            accessibilityLabel="Clear search"
                        >
                            <ClearIcon />
                        </TouchableOpacity>
                    )}
                </View>

                {isLoading ? (
                    <ActivityIndicator color={colors.accent} style={styles.status} />
                ) : error !== null ? (
                    <Text style={styles.error}>{error}</Text>
                ) : visibleProfiles === null || visibleProfiles.length === 0 ? (
                    <Text style={styles.empty}>
                        {trimmedQuery.length > 0 ? "No matches." : "No profiles yet."}
                    </Text>
                ) : (
                    <View style={styles.card}>
                        {visibleProfiles.map((profile, index) => {
                            const mutual = profile.is_following && profile.is_followed_by
                            const busy = busyUsernames.has(profile.username)
                            return (
                                <TouchableOpacity
                                    key={profile.id}
                                    style={[styles.row, index > 0 && styles.rowDivider]}
                                    onPress={() => openProfile(profile)}
                                    activeOpacity={0.75}
                                >
                                    <View style={[styles.bust, { backgroundColor: avatarColor(profile.username) }]}>
                                        <Text style={styles.bustLetter}>
                                            {(profile.display_name || profile.username).charAt(0).toUpperCase()}
                                        </Text>
                                    </View>
                                    <View style={styles.rowText}>
                                        <View style={styles.nameRow}>
                                            <Text style={styles.displayName} numberOfLines={1}>
                                                {profile.display_name}
                                            </Text>
                                            {mutual && (
                                                <View style={styles.mutualChip}>
                                                    <Text style={styles.mutualChipText}>MUTUAL</Text>
                                                </View>
                                            )}
                                        </View>
                                        <Text style={styles.username} numberOfLines={1}>
                                            @{profile.username}
                                        </Text>
                                    </View>
                                    {!profile.is_own_profile && (
                                        <TouchableOpacity
                                            style={[
                                                styles.followBtn,
                                                profile.is_following ? styles.followBtnOutline : styles.followBtnFilled,
                                                busy && { opacity: 0.5 },
                                            ]}
                                            onPress={() => handleToggleFollow(profile)}
                                            disabled={busy}
                                        >
                                            <Text style={profile.is_following ? styles.followBtnOutlineText : styles.followBtnFilledText}>
                                                {profile.is_following ? "Following" : "Follow"}
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                </TouchableOpacity>
                            )
                        })}
                    </View>
                )}
                {/* Clear the floating tab bar */}
                <View style={{ height: 96 }} />
            </ScrollView>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.bg,
    },
    navBar: {
        paddingTop: 58,
        paddingHorizontal: 14,
        paddingBottom: 8,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    navSide: {
        width: 60,
        flexDirection: "row",
    },
    navTitle: {
        fontFamily: fonts.display,
        fontSize: 14,
        letterSpacing: 0.3,
        color: colors.ink,
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
    body: {
        flex: 1,
        paddingHorizontal: 14,
    },
    toggleRow: {
        flexDirection: "row",
        gap: 6,
        marginTop: 4,
    },
    toggleBtn: {
        flex: 1,
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 12,
        paddingVertical: 10,
        alignItems: "center",
        gap: 2,
    },
    toggleBtnActive: {
        backgroundColor: colors.ink,
        borderColor: colors.ink,
    },
    toggleLabel: {
        fontFamily: fonts.display,
        fontSize: 12,
        color: colors.inkSoft,
    },
    toggleLabelActive: {
        color: "#fff",
    },
    toggleCount: {
        fontFamily: fonts.mono,
        fontSize: 9,
        letterSpacing: 0.5,
        color: colors.inkSoft,
        opacity: 0.7,
    },
    toggleCountActive: {
        color: "#fff",
    },
    searchBar: {
        flexDirection: "row",
        alignItems: "center",
        gap: 9,
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 11,
        paddingVertical: 9,
        paddingHorizontal: 12,
        marginTop: 10,
    },
    searchInput: {
        flex: 1,
        fontSize: 12,
        color: colors.ink,
        padding: 0,
    },
    status: {
        marginTop: 42,
    },
    error: {
        color: colors.danger,
        fontSize: 14,
        marginTop: 42,
        textAlign: "center",
        paddingHorizontal: 24,
    },
    empty: {
        color: colors.inkSoft,
        fontSize: 14,
        marginTop: 42,
        textAlign: "center",
        paddingHorizontal: 24,
    },
    card: {
        marginTop: 10,
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 16,
        paddingVertical: 2,
        paddingHorizontal: 14,
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
        gap: 11,
        paddingVertical: 10,
    },
    rowDivider: {
        borderTopWidth: 1,
        borderTopColor: colors.line,
    },
    bust: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    bustLetter: {
        fontFamily: fonts.display,
        fontSize: 16,
        color: "#fff",
    },
    rowText: {
        flex: 1,
        minWidth: 0,
    },
    nameRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    displayName: {
        fontFamily: fonts.display,
        fontSize: 13,
        color: colors.ink,
        flexShrink: 1,
    },
    mutualChip: {
        backgroundColor: "rgba(31,157,119,0.10)",
        borderRadius: 999,
        paddingVertical: 2,
        paddingHorizontal: 6,
    },
    mutualChipText: {
        fontFamily: fonts.mono,
        fontSize: 7,
        letterSpacing: 1,
        fontWeight: "700",
        color: colors.mint,
    },
    username: {
        fontFamily: fonts.mono,
        fontSize: 8.5,
        letterSpacing: 0.7,
        color: colors.inkDim,
        marginTop: 2,
    },
    // Follow / Following pills mirror the Discover people-search results exactly:
    // accent fill + hard ink offset shadow for the primary Follow action, quiet
    // bordered pill once following.
    followBtn: {
        borderRadius: 999,
        flexShrink: 0,
    },
    followBtnFilled: {
        backgroundColor: colors.accent,
        paddingVertical: 8,
        paddingHorizontal: 15,
        shadowColor: colors.ink,
        shadowOpacity: 1,
        shadowRadius: 0,
        shadowOffset: { width: 2, height: 2 },
    },
    followBtnOutline: {
        backgroundColor: colors.bg,
        borderWidth: 1.5,
        borderColor: colors.line,
        paddingVertical: 7,
        paddingHorizontal: 14,
    },
    followBtnFilledText: {
        fontFamily: fonts.display,
        fontSize: 11.5,
        color: "#fff",
    },
    followBtnOutlineText: {
        fontFamily: fonts.display,
        fontSize: 11.5,
        color: colors.inkSoft,
    },
})
