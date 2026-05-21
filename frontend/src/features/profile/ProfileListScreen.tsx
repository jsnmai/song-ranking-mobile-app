// ProfileList shows follower and following lists for any public profile.
import { useEffect, useState } from "react"
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { NativeStackScreenProps } from "@react-navigation/native-stack"

import { ApiError } from "../../api/client"
import { AppStackParamList } from "../../navigation/types"
import { useAuth } from "../auth/AuthContext"
import { getFollowers, getFollowing } from "./apiRequests"
import { Profile } from "./types"

type ProfileListProps = NativeStackScreenProps<AppStackParamList, "ProfileList">

export default function ProfileListScreen({ navigation, route }: ProfileListProps) {
    const { token } = useAuth()
    const { username, listType } = route.params
    const [profiles, setProfiles] = useState<Profile[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const title = listType === "followers" ? "Followers" : "Following"

    const openProfile = (profile: Profile) => {
        if (profile.is_own_profile) {
            navigation.navigate("MainTabs", { screen: "Profile" })
            return
        }
        navigation.navigate("OtherProfile", { username: profile.username })
    }

    useEffect(() => {
        async function fetchProfiles() {
            if (!token) {
                return
            }
            setIsLoading(true)
            setError(null)
            try {
                const response = listType === "followers"
                    ? await getFollowers(username, token)
                    : await getFollowing(username, token)
                setProfiles(response.profiles)
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
        fetchProfiles()
    }, [listType, token, username])

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>
                <Text style={styles.heading}>{title}</Text>
                <Text style={styles.subheading}>@{username}</Text>
            </View>

            {isLoading ? (
                <ActivityIndicator color="#fff" style={styles.status} />
            ) : error ? (
                <Text style={styles.error}>{error}</Text>
            ) : profiles.length === 0 ? (
                <Text style={styles.empty}>No profiles yet.</Text>
            ) : (
                <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
                    {profiles.map((profile) => (
                        <TouchableOpacity
                            key={profile.id}
                            style={styles.row}
                            onPress={() => openProfile(profile)}
                            activeOpacity={0.75}
                        >
                            <View style={styles.avatar}>
                                <Text style={styles.avatarText}>{profile.display_name.slice(0, 1).toUpperCase()}</Text>
                            </View>
                            <View style={styles.profileText}>
                                <Text style={styles.displayName} numberOfLines={1}>{profile.display_name}</Text>
                                <Text style={styles.username} numberOfLines={1}>@{profile.username}</Text>
                            </View>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
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
        paddingTop: 58,
        paddingHorizontal: 18,
        paddingBottom: 18,
        borderBottomWidth: 1,
        borderBottomColor: "#1f1f1f",
    },
    backButton: {
        alignSelf: "flex-start",
        paddingVertical: 8,
        marginBottom: 12,
    },
    backText: {
        color: "#fff",
        fontSize: 16,
    },
    heading: {
        color: "#fff",
        fontSize: 26,
        fontWeight: "700",
        marginBottom: 4,
    },
    subheading: {
        color: "#888",
        fontSize: 15,
    },
    status: {
        marginTop: 42,
    },
    error: {
        color: "#ff6b6b",
        fontSize: 15,
        marginTop: 42,
        textAlign: "center",
    },
    empty: {
        color: "#777",
        fontSize: 15,
        marginTop: 42,
        textAlign: "center",
    },
    list: {
        flex: 1,
    },
    listContent: {
        paddingHorizontal: 18,
        paddingBottom: 24,
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: "#1f1f1f",
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: "#1f1f1f",
        alignItems: "center",
        justifyContent: "center",
        marginRight: 12,
    },
    avatarText: {
        color: "#fff",
        fontSize: 18,
        fontWeight: "700",
    },
    profileText: {
        flex: 1,
    },
    displayName: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "600",
        marginBottom: 3,
    },
    username: {
        color: "#888",
        fontSize: 14,
    },
})
