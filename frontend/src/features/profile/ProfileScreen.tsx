// Profile tab — shows the logged-in user's display name, social counts, and logout button.
import { useEffect, useState } from "react"
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useNavigation } from "@react-navigation/native"

import { ApiError } from "../../api/client"
import { AppStackParamList } from "../../navigation/types"
import { useAuth } from "../auth/AuthContext"
import { getMyProfile } from "./apiRequests"
import { Profile } from "./types"

type ProfileNavigationProp = NativeStackNavigationProp<AppStackParamList, "MainTabs">

export default function ProfileScreen() {
    const navigation = useNavigation<ProfileNavigationProp>()
    const { token, logout } = useAuth()
    const [profile, setProfile] = useState<Profile | null>(null)
    const [error, setError] = useState<string | null>(null)

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
                    setError(err.detail)
                } else if (err instanceof Error) {
                    setError(err.message)
                } else {
                    setError("Failed to load profile.")
                }
            }
        }
        fetchProfile()
    }, [token])

    return (
        <View style={styles.container}>
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
            ) : error ? (
                <Text style={styles.error}>{error}</Text>
            ) : (
                <ActivityIndicator color="#fff" />
            )}
            <TouchableOpacity style={styles.logoutButton} onPress={logout}>
                <Text style={styles.logoutText}>Log Out</Text>
            </TouchableOpacity>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#000",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 24,
    },
    info: {
        alignItems: "center",
        marginBottom: 40,
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
        marginBottom: 40,
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
})
