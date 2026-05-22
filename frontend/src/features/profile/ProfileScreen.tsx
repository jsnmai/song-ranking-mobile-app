// Profile tab — shows the logged-in user's display name, social counts, logout, and taste profile.
import { useEffect, useState } from "react"
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useNavigation } from "@react-navigation/native"

import { ApiError } from "../../api/client"
import { AppStackParamList } from "../../navigation/types"
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

    useEffect(() => {
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

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                {profile ? (
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
                    </View>
                ) : profileError ? (
                    <Text style={styles.error}>{profileError}</Text>
                ) : (
                    <ActivityIndicator color="#fff" />
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
        backgroundColor: "#000",
    },
    header: {
        alignItems: "center",
        paddingHorizontal: 24,
        paddingTop: 60,
        paddingBottom: 16,
    },
    info: {
        alignItems: "center",
        marginBottom: 24,
    },
    displayName: {
        color: "#fff",
        fontSize: 22,
        fontWeight: "600",
        marginBottom: 6,
    },
    username: {
        color: "#888",
        fontSize: 16,
    },
    countRow: {
        flexDirection: "row",
        marginTop: 24,
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
    error: {
        color: "#f55",
        fontSize: 14,
        marginBottom: 24,
    },
    logoutButton: {
        paddingVertical: 12,
        paddingHorizontal: 32,
        borderWidth: 1,
        borderColor: "#fff",
        borderRadius: 8,
    },
    logoutText: {
        color: "#fff",
        fontSize: 16,
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
