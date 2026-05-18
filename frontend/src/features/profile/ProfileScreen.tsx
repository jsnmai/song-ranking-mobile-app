// Profile tab — shows the logged-in user's display name, username, and logout button.
// Phase 9a will add follower/following counts and the taste profile tab.
import { useEffect, useState } from "react"
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native"

import { useAuth } from "../auth/AuthContext"
import { getMyProfile } from "./apiRequests"
import { Profile } from "./types"

export default function ProfileScreen() {
    const { token, logout } = useAuth()
    const [profile, setProfile] = useState<Profile | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        async function fetchProfile() {
            if (!token) {
                return
            }
            try {
                const data = await getMyProfile(token)
                setProfile(data)
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to load profile.")
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
