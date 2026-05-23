// Profile tab — shows the logged-in user's display name, social counts, logout, and taste profile.
import { useCallback, useEffect, useState } from "react"
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useFocusEffect, useNavigation } from "@react-navigation/native"

import { ApiError } from "../../api/client"
import StarAvatar from "../../components/StarAvatar"
import { AppStackParamList } from "../../navigation/types"
import { colors, fonts } from "../../theme"
import { useAuth } from "../auth/AuthContext"
import { getMyProfile, getMyTasteProfile } from "./apiRequests"
import { Profile, TasteProfileResponse } from "./types"
import TasteTabContent from "./TasteTabContent"

type ProfileNavigationProp = NativeStackNavigationProp<AppStackParamList, "MainTabs">
type ProfileTab = "profile" | "taste"

export default function ProfileScreen() {
    const navigation = useNavigation<ProfileNavigationProp>()
    const { token, logout } = useAuth()
    const [profile, setProfile] = useState<Profile | null>(null)
    const [profileError, setProfileError] = useState<string | null>(null)
    const [taste, setTaste] = useState<TasteProfileResponse | null>(null)
    const [tasteLoading, setTasteLoading] = useState(false)
    const [tasteError, setTasteError] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState<ProfileTab>("profile")

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

    useFocusEffect(
        useCallback(() => {
            async function fetchProfile() {
                if (!token) {
                    return
                }
                try {
                    const data = await getMyProfile(token)
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
            fetchProfile()
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
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.kicker}>YOUR PROFILE</Text>

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
                    </View>
                ) : profileError ? (
                    <Text style={styles.error}>{profileError}</Text>
                ) : (
                    <ActivityIndicator color={colors.clay} style={styles.loader} />
                )}

                <TouchableOpacity style={styles.logoutButton} onPress={logout}>
                    <Text style={styles.logoutText}>Log Out</Text>
                </TouchableOpacity>
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

            {activeTab === "taste" && (
                <TasteTabContent
                    taste={taste}
                    isLoading={tasteLoading}
                    error={tasteError}
                />
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
    kicker: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 10,
        letterSpacing: 1.8,
        marginBottom: 16,
        alignSelf: "flex-start",
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
    logoutButton: {
        paddingVertical: 12,
        paddingHorizontal: 32,
        borderWidth: 1,
        borderColor: colors.ink,
        borderRadius: 8,
        backgroundColor: colors.paper,
    },
    logoutText: {
        fontFamily: fonts.mono,
        color: colors.ink,
        fontSize: 13,
        letterSpacing: 0.4,
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
