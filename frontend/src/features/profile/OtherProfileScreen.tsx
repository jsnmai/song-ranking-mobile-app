// OtherProfile shows another user's public profile and the follow/unfollow action.
import { useEffect, useState } from "react"
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { NativeStackScreenProps } from "@react-navigation/native-stack"

import { ApiError } from "../../api/client"
import { AppStackParamList } from "../../navigation/types"
import { useAuth } from "../auth/AuthContext"
import { followUser, getCompatibility, getProfileByUsername, getUserTasteProfile, unfollowUser } from "./apiRequests"
import { CompatibilityResponse, Profile, TasteProfileResponse } from "./types"
import TasteTabContent from "./TasteTabContent"

type OtherProfileProps = NativeStackScreenProps<AppStackParamList, "OtherProfile">
type ProfileTab = "profile" | "taste"

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

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>

                {isLoading ? (
                    <ActivityIndicator color="#fff" />
                ) : profile ? (
                    <View style={styles.info}>
                        <Text style={styles.displayName}>{profile.display_name}</Text>
                        <Text style={styles.username}>@{profile.username}</Text>
                        <View style={styles.countRow}>
                            <TouchableOpacity style={styles.countButton} onPress={openFollowers}>
                                <Text style={styles.countValue}>{profile.follower_count}</Text>
                                <Text style={styles.countLabel}>Followers</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.countButton} onPress={openFollowing}>
                                <Text style={styles.countValue}>{profile.following_count}</Text>
                                <Text style={styles.countLabel}>Following</Text>
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
                        <View style={styles.compatCard}>
                            {compatibility.has_overlap ? (
                                <Text style={styles.compatText}>
                                    {Math.round(compatibility.similarity_score! * 100)}% taste match · {compatibility.explanation}
                                </Text>
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
        backgroundColor: "#000",
    },
    header: {
        alignItems: "center",
        paddingHorizontal: 24,
        paddingTop: 60,
        paddingBottom: 16,
    },
    backButton: {
        alignSelf: "flex-start",
        paddingVertical: 8,
        paddingHorizontal: 0,
        marginBottom: 16,
    },
    backText: {
        color: "#fff",
        fontSize: 16,
    },
    info: {
        alignItems: "center",
    },
    displayName: {
        color: "#fff",
        fontSize: 24,
        fontWeight: "700",
        marginBottom: 6,
    },
    username: {
        color: "#888",
        fontSize: 16,
    },
    countRow: {
        flexDirection: "row",
        marginTop: 24,
        marginBottom: 24,
    },
    countButton: {
        minWidth: 110,
        alignItems: "center",
        paddingVertical: 10,
    },
    countValue: {
        color: "#fff",
        fontSize: 20,
        fontWeight: "700",
        marginBottom: 4,
    },
    countLabel: {
        color: "#888",
        fontSize: 13,
    },
    followButton: {
        minWidth: 140,
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 8,
        backgroundColor: "#fff",
    },
    followingButton: {
        backgroundColor: "#2a2a2a",
        borderWidth: 1,
        borderColor: "#555",
    },
    followText: {
        color: "#000",
        fontSize: 16,
        fontWeight: "700",
    },
    followingText: {
        color: "#fff",
    },
    error: {
        color: "#ff6b6b",
        fontSize: 14,
        marginTop: 20,
        textAlign: "center",
    },
    compatCard: {
        marginHorizontal: 24,
        marginBottom: 12,
        paddingVertical: 10,
        paddingHorizontal: 14,
        backgroundColor: "#1a1a1a",
        borderRadius: 8,
        alignItems: "center",
    },
    compatText: {
        color: "#fff",
        fontSize: 13,
        textAlign: "center",
    },
    compatTextMuted: {
        color: "#888",
        fontSize: 13,
        textAlign: "center",
    },
    tabBar: {
        flexDirection: "row",
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: "#333",
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: "#333",
    },
    tabBtn: {
        flex: 1,
        paddingVertical: 12,
        alignItems: "center",
    },
    tabBtnActive: {
        borderBottomWidth: 2,
        borderBottomColor: "#fff",
    },
    tabText: {
        color: "#888",
        fontSize: 14,
        fontWeight: "600",
    },
    tabTextActive: {
        color: "#fff",
    },
})
