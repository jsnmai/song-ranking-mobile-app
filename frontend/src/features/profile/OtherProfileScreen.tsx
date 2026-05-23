// OtherProfile shows another user's public profile and the follow/unfollow action.
import { useEffect, useState } from "react"
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { NativeStackScreenProps } from "@react-navigation/native-stack"

import { ApiError } from "../../api/client"
import DiamondScore from "../../components/DiamondScore"
import StarAvatar from "../../components/StarAvatar"
import { AppStackParamList } from "../../navigation/types"
import { colors, fonts } from "../../theme"
import { useAuth } from "../auth/AuthContext"
import { followUser, getCompatibility, getProfileByUsername, getUserTasteProfile, unfollowUser } from "./apiRequests"
import { CompatibilityResponse, Profile, TasteProfileResponse } from "./types"
import TasteTabContent from "./TasteTabContent"

type OtherProfileProps = NativeStackScreenProps<AppStackParamList, "OtherProfile">
type ProfileTab = "profile" | "taste"

function compatibilityAccent(similarityScore: number): string {
    const percent = Math.round(similarityScore * 100)
    if (percent >= 70) {
        return colors.like
    }
    if (percent < 50) {
        return colors.dislike
    }
    return colors.okay
}

export default function OtherProfileScreen({ navigation, route }: OtherProfileProps) {
    const { token } = useAuth()
    const { username } = route.params
    const [profile, setProfile] = useState<Profile | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [profileError, setProfileError] = useState<string | null>(null)
    const [taste, setTaste] = useState<TasteProfileResponse | null>(null)
    const [tasteLoading, setTasteLoading] = useState(false)
    const [tasteError, setTasteError] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState<ProfileTab>("profile")
    const [compatibility, setCompatibility] = useState<CompatibilityResponse | null>(null)
    const [compatLoading, setCompatLoading] = useState(false)

    const openFollowers = () => {
        navigation.navigate("ProfileList", {
            username,
            listType: "followers",
        })
    }

    const openFollowing = () => {
        navigation.navigate("ProfileList", {
            username,
            listType: "following",
        })
    }

    const toggleFollow = async () => {
        if (!token || !profile || profile.is_own_profile || isSaving) {
            return
        }

        setIsSaving(true)
        setProfileError(null)
        try {
            const updatedProfile = profile.is_following
                ? await unfollowUser(profile.username, token)
                : await followUser(profile.username, token)
            setProfile(updatedProfile)
        } catch (err) {
            if (err instanceof ApiError) {
                setProfileError(err.detail)
            } else if (err instanceof Error) {
                setProfileError(err.message)
            } else {
                setProfileError("Could not update follow state.")
            }
        } finally {
            setIsSaving(false)
        }
    }

    useEffect(() => {
        async function fetchProfile() {
            if (!token) {
                return
            }
            setIsLoading(true)
            setProfileError(null)
            try {
                const data = await getProfileByUsername(username, token)
                setProfile(data)
            } catch (err) {
                if (err instanceof ApiError) {
                    setProfileError(err.detail)
                } else if (err instanceof Error) {
                    setProfileError(err.message)
                } else {
                    setProfileError("Failed to load profile.")
                }
            } finally {
                setIsLoading(false)
            }
        }
        fetchProfile()
    }, [token, username])

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
                const data = await getUserTasteProfile(username, token)
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
    }, [activeTab, token, username])

    useEffect(() => {
        if (!token) {
            return
        }
        async function fetchCompatibility() {
            if (!token) {
                return
            }
            setCompatLoading(true)
            try {
                const data = await getCompatibility(username, token)
                setCompatibility(data)
            } catch {
                // 404 (private profile) or network error — silently hide the card
                setCompatibility(null)
            } finally {
                setCompatLoading(false)
            }
        }
        fetchCompatibility()
    }, [token, username])

    const profileInitial = profile
        ? (profile.display_name || profile.username).charAt(0).toUpperCase()
        : "?"

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>

                {isLoading ? (
                    <ActivityIndicator color={colors.clay} style={styles.loader} />
                ) : profile ? (
                    <View style={styles.info}>
                        <Text style={styles.kicker}>LISTn MEMBER</Text>
                        <StarAvatar
                            initial={profileInitial}
                            outerColor={colors.clay}
                            size={56}
                            testID="other-profile-star-avatar"
                        />
                        <Text style={styles.displayName}>{profile.display_name}</Text>
                        <Text style={styles.username}>@{profile.username}</Text>
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
                        {!profile.is_own_profile && (
                            <TouchableOpacity
                                style={[
                                    styles.followButton,
                                    profile.is_following ? styles.followingButton : null,
                                ]}
                                onPress={toggleFollow}
                                disabled={isSaving}
                            >
                                <Text style={[styles.followText, profile.is_following ? styles.followingText : null]}>
                                    {isSaving ? "Saving..." : profile.is_following ? "Following" : "Follow"}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                ) : (
                    <Text style={styles.error}>{profileError ?? "Profile not found."}</Text>
                )}

                {profileError !== null && profile !== null && <Text style={styles.error}>{profileError}</Text>}
            </View>

            {profile && (
                <>
                    {!compatLoading && compatibility && (
                        <View style={styles.compatCard} testID="compatibility-card">
                            {compatibility.has_overlap ? (
                                <>
                                    <Text style={styles.compatKicker}>TASTE MATCH</Text>
                                    <View style={styles.compatScoreRow}>
                                        <Text
                                            style={[
                                                styles.compatPercent,
                                                { color: compatibilityAccent(compatibility.similarity_score!) },
                                            ]}
                                        >
                                            {Math.round(compatibility.similarity_score! * 100)}%
                                        </Text>
                                        <DiamondScore
                                            score={compatibility.similarity_score! * 10}
                                            total={10}
                                            size={8}
                                            color={compatibilityAccent(compatibility.similarity_score!)}
                                            testID="compatibility-diamonds"
                                        />
                                    </View>
                                    <Text style={styles.compatText}>
                                        {Math.round(compatibility.similarity_score! * 100)}% taste match · {compatibility.explanation}
                                    </Text>
                                    {compatibility.shared_song_count > 0 && (
                                        <Text style={styles.compatMeta}>
                                            {compatibility.shared_song_count} shared songs
                                        </Text>
                                    )}
                                </>
                            ) : (
                                <Text style={styles.compatTextMuted}>
                                    {compatibility.explanation}
                                </Text>
                            )}
                        </View>
                    )}

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

                    {activeTab === "taste" && (
                        <TasteTabContent
                            taste={taste}
                            isLoading={tasteLoading}
                            error={tasteError}
                        />
                    )}
                </>
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
        alignItems: "center",
        paddingHorizontal: 18,
        paddingTop: 60,
        paddingBottom: 16,
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
        letterSpacing: 0.4,
    },
    kicker: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 10,
        letterSpacing: 1.8,
        marginBottom: 12,
    },
    loader: {
        marginVertical: 24,
    },
    info: {
        alignItems: "center",
        width: "100%",
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
        marginBottom: 16,
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
        marginBottom: 16,
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
    followButton: {
        minWidth: 140,
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 8,
        backgroundColor: colors.clay,
    },
    followingButton: {
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
    },
    followText: {
        fontFamily: fonts.mono,
        color: colors.paper,
        fontSize: 13,
        letterSpacing: 0.4,
    },
    followingText: {
        color: colors.ink,
    },
    error: {
        color: colors.dislike,
        fontSize: 14,
        marginTop: 12,
        textAlign: "center",
    },
    compatCard: {
        marginHorizontal: 16,
        marginBottom: 12,
        paddingVertical: 16,
        paddingHorizontal: 16,
        backgroundColor: colors.paper,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.line,
        alignItems: "center",
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    compatKicker: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 10,
        letterSpacing: 1.8,
        marginBottom: 8,
    },
    compatScoreRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginBottom: 8,
    },
    compatPercent: {
        fontFamily: fonts.serif,
        fontSize: 36,
        lineHeight: 40,
    },
    compatText: {
        color: colors.ink,
        fontSize: 13,
        textAlign: "center",
        lineHeight: 20,
    },
    compatTextMuted: {
        color: colors.inkDim,
        fontSize: 13,
        textAlign: "center",
        lineHeight: 20,
    },
    compatMeta: {
        fontFamily: fonts.mono,
        color: colors.inkDim,
        fontSize: 11,
        letterSpacing: 0.4,
        marginTop: 8,
    },
    tabBar: {
        flexDirection: "row",
        borderTopWidth: 1,
        borderTopColor: colors.line,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
        backgroundColor: colors.bg,
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
