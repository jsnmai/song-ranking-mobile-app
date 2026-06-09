// Profile tab — shows the logged-in user's display name, social counts, logout, and taste profile.
import { useCallback, useEffect, useState } from "react"
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useFocusEffect, useNavigation } from "@react-navigation/native"

import { ApiError } from "../../api/client"
import StarAvatar from "../../components/StarAvatar"
import { RankingResponse } from "../comparison/types"
import { listMyRankings } from "../rankings/apiRequests"
import { AppStackParamList } from "../../navigation/types"
import { colors, fonts } from "../../theme"
import { useAuth } from "../auth/AuthContext"
import { getMostCompatible, getMyProfile, getMyRecentVerdicts, getMyTasteProfile } from "./apiRequests"
import { MostCompatibleItem, Profile, RecentVerdictItem, TasteProfileResponse } from "./types"
import TasteTabContent from "./TasteTabContent"
import MostCompatibleModule from "./MostCompatibleModule"
import RankingsPreviewModule from "./RankingsPreviewModule"
import RecentVerdictsModule from "./RecentVerdictsModule"

type ProfileNavigationProp = NativeStackNavigationProp<AppStackParamList, "MainTabs">
type ProfileTab = "profile" | "taste"

export default function ProfileScreen() {
    const navigation = useNavigation<ProfileNavigationProp>()
    const { token } = useAuth()
    const [profile, setProfile] = useState<Profile | null>(null)
    const [profileError, setProfileError] = useState<string | null>(null)
    const [taste, setTaste] = useState<TasteProfileResponse | null>(null)
    const [tasteLoading, setTasteLoading] = useState(false)
    const [tasteError, setTasteError] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState<ProfileTab>("profile")
    const [verdicts, setVerdicts] = useState<RecentVerdictItem[] | null>(null)
    const [rankingsPreview, setRankingsPreview] = useState<RankingResponse[] | null>(null)
    const [mostCompatible, setMostCompatible] = useState<MostCompatibleItem[] | null>(null)

    const openFollowers = () => {
        if (!profile) {
            return
        }
        navigation.navigate("ProfileList", {
            username: profile.username,
            listType: "followers",
        })
    }

    const openFollowing = () => {
        if (!profile) {
            return
        }
        navigation.navigate("ProfileList", {
            username: profile.username,
            listType: "following",
        })
    }

    const openSettings = () => {
        navigation.navigate("Settings")
    }

    const openBookmarks = () => {
        navigation.navigate("Bookmarks")
    }

    useFocusEffect(
        useCallback(() => {
            if (!token) {
                return
            }
            async function fetchProfile() {
                try {
                    const data = await getMyProfile(token!)
                    setProfile(data)
                } catch (err) {
                    if (err instanceof ApiError) {
                        setProfileError(err.detail)
                    } else if (err instanceof Error) {
                        setProfileError(err.message)
                    } else {
                        setProfileError("Failed to load profile.")
                    }
                }
            }
            async function fetchModules() {
                try {
                    const [vData, rData, mcData] = await Promise.all([
                        getMyRecentVerdicts(token!),
                        listMyRankings(token!),
                        getMostCompatible(token!),
                    ])
                    setVerdicts(vData.items)
                    setRankingsPreview(rData.rankings.slice(0, 5))
                    setMostCompatible(mcData.users)
                } catch {
                    // silently degrade — modules show empty state
                    setVerdicts([])
                    setRankingsPreview([])
                    setMostCompatible([])
                }
            }
            fetchProfile()
            fetchModules()
        }, [token])
    )

    useEffect(() => {
        if (activeTab !== "taste" || !token) {
            return
        }
        async function fetchTaste() {
            if (!token) {
                return
            }
            setTasteLoading(true)
            setTasteError(null)
            try {
                const data = await getMyTasteProfile(token)
                setTaste(data)
            } catch (err) {
                if (err instanceof ApiError) {
                    setTasteError(err.detail)
                } else if (err instanceof Error) {
                    setTasteError(err.message)
                } else {
                    setTasteError("Failed to load taste profile.")
                }
            } finally {
                setTasteLoading(false)
            }
        }
        fetchTaste()
    }, [activeTab, token])

    const profileInitial = profile
        ? (profile.display_name || profile.username).charAt(0).toUpperCase()
        : "?"

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
        >
            <View style={styles.header}>
                <View style={styles.headerRow}>
                    <Text style={styles.kicker}>YOUR PROFILE</Text>
                    <TouchableOpacity style={styles.settingsButton} onPress={openSettings}>
                        <Text style={styles.settingsText}>Settings</Text>
                    </TouchableOpacity>
                </View>

                {profile ? (
                    <View style={styles.info}>
                        <StarAvatar
                            initial={profileInitial}
                            outerColor={colors.clay}
                            size={56}
                            testID="profile-star-avatar"
                        />
                        <Text style={styles.displayName}>{profile.display_name}</Text>
                        <Text style={styles.username}>@{profile.username}</Text>
                        <View style={styles.visibilityPill}>
                            <Text style={styles.visibilityText}>
                                Visibility: {visibilityLabel(profile.visibility)}
                            </Text>
                        </View>
                        <View style={styles.countCard}>
                            <TouchableOpacity style={styles.countButton} onPress={openFollowers}>
                                <Text style={styles.countValue}>{profile.follower_count}</Text>
                                <Text style={styles.countLabel}>FOLLOWERS</Text>
                            </TouchableOpacity>
                            <View style={styles.countDivider} />
                            <TouchableOpacity style={styles.countButton} onPress={openFollowing}>
                                <Text style={styles.countValue}>{profile.following_count}</Text>
                                <Text style={styles.countLabel}>FOLLOWING</Text>
                            </TouchableOpacity>
                        </View>
                        {profile.user_stats && (
                            <View style={styles.statsCard}>
                                <TouchableOpacity
                                    style={styles.statButton}
                                    onPress={() => navigation.navigate("MainTabs", { screen: "Rankings", params: { screen: "FullRankings" } })}
                                    testID="stats-rated"
                                >
                                    <Text style={styles.statValue}>{profile.user_stats.rated_count}</Text>
                                    <Text style={styles.statLabel}>RATED</Text>
                                </TouchableOpacity>
                                <View style={styles.statDivider} />
                                <TouchableOpacity
                                    style={styles.statButton}
                                    onPress={openBookmarks}
                                    testID="stats-bookmarked"
                                >
                                    <Text style={styles.statValue}>{profile.user_stats.bookmarked_count}</Text>
                                    <Text style={styles.statLabel}>BOOKMARKS</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                ) : profileError ? (
                    <Text style={styles.error}>{profileError}</Text>
                ) : (
                    <ActivityIndicator color={colors.clay} style={styles.loader} />
                )}
            </View>

            <View style={styles.tabBar}>
                <TouchableOpacity
                    style={[styles.tabBtn, activeTab === "profile" && styles.tabBtnActive]}
                    onPress={() => setActiveTab("profile")}
                >
                    <Text style={[styles.tabText, activeTab === "profile" && styles.tabTextActive]}>
                        Profile
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tabBtn, activeTab === "taste" && styles.tabBtnActive]}
                    onPress={() => setActiveTab("taste")}
                >
                    <Text style={[styles.tabText, activeTab === "taste" && styles.tabTextActive]}>
                        Taste
                    </Text>
                </TouchableOpacity>
            </View>

            <View style={styles.tabContent}>
                {activeTab === "profile" && (
                    <View style={styles.profilePanel}>
                        <RecentVerdictsModule
                            verdicts={verdicts}
                            isLoading={verdicts === null}
                            onItemPress={(item) => {
                                navigation.navigate("SongDetail", { song: item.song as never })
                            }}
                        />
                        <RankingsPreviewModule
                            rankings={rankingsPreview}
                            isLoading={rankingsPreview === null}
                            onItemPress={(ranking) => navigation.navigate("SongDetail", { ranking })}
                            onViewAll={() => navigation.navigate("MainTabs", { screen: "Rankings", params: { screen: "FullRankings" } })}
                        />
                    </View>
                )}
                {activeTab === "taste" && (
                    <>
                        <TasteTabContent
                            taste={taste}
                            isLoading={tasteLoading}
                            error={tasteError}
                        />
                        <MostCompatibleModule
                            users={mostCompatible}
                            isLoading={mostCompatible === null}
                            onUserPress={(username) => navigation.navigate("OtherProfile", { username })}
                            onViewAll={() => navigation.navigate("MostCompatible")}
                        />
                    </>
                )}
            </View>
        </ScrollView>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.bg,
    },
    contentContainer: {
        flexGrow: 1,
    },
    tabContent: {
        paddingBottom: 32,
    },
    header: {
        alignItems: "center",
        paddingHorizontal: 18,
        paddingTop: 60,
        paddingBottom: 16,
    },
    headerRow: {
        alignItems: "center",
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 16,
        width: "100%",
    },
    kicker: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 10,
        letterSpacing: 1.8,
    },
    settingsButton: {
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 8,
        backgroundColor: colors.paper,
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    settingsText: {
        fontFamily: fonts.mono,
        color: colors.ink,
        fontSize: 11,
        letterSpacing: 0.4,
    },
    info: {
        alignItems: "center",
        marginBottom: 20,
        width: "100%",
    },
    loader: {
        marginBottom: 24,
    },
    displayName: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 28,
        lineHeight: 32,
        marginTop: 12,
        marginBottom: 4,
        textAlign: "center",
    },
    username: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 14,
        marginBottom: 8,
    },
    visibilityPill: {
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 999,
        backgroundColor: colors.paper,
        paddingVertical: 5,
        paddingHorizontal: 10,
        marginBottom: 16,
    },
    visibilityText: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 9,
        letterSpacing: 0.6,
    },
    countCard: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.paper,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.line,
        paddingVertical: 14,
        paddingHorizontal: 8,
        width: "100%",
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    countDivider: {
        width: 1,
        height: 36,
        backgroundColor: colors.line,
    },
    countButton: {
        flex: 1,
        alignItems: "center",
        paddingVertical: 4,
    },
    countValue: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 22,
        lineHeight: 26,
        marginBottom: 4,
    },
    countLabel: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 9,
        letterSpacing: 1.4,
    },
    error: {
        color: colors.dislike,
        fontSize: 14,
        marginBottom: 24,
        textAlign: "center",
    },
    tabBar: {
        width: "100%",
        flexDirection: "row",
        borderTopWidth: 1,
        borderTopColor: colors.line,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
        backgroundColor: colors.bg,
    },
    profilePanel: {
        paddingHorizontal: 18,
        paddingTop: 18,
    },
    statsCard: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.paper,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.line,
        paddingVertical: 14,
        paddingHorizontal: 8,
        marginTop: 12,
        width: "100%",
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    statDivider: {
        width: 1,
        height: 36,
        backgroundColor: colors.line,
    },
    statButton: {
        flex: 1,
        alignItems: "center",
        paddingVertical: 4,
    },
    statValue: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 22,
        lineHeight: 26,
        marginBottom: 4,
    },
    statLabel: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 9,
        letterSpacing: 1.4,
    },
    tabBtn: {
        flex: 1,
        paddingVertical: 12,
        alignItems: "center",
    },
    tabBtnActive: {
        borderBottomWidth: 2,
        borderBottomColor: colors.ink,
    },
    tabText: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 12,
        letterSpacing: 0.6,
    },
    tabTextActive: {
        color: colors.ink,
    },
})

function visibilityLabel(visibility: Profile["visibility"]): string {
    if (visibility === "friends_only") {
        return "Friends only"
    }
    if (visibility === "only_me") {
        return "Only me"
    }
    return "Public"
}
