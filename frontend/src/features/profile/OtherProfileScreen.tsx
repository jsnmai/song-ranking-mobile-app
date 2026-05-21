// OtherProfile shows another user's public profile and the follow/unfollow action.
import { useEffect, useState } from "react"
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { NativeStackScreenProps } from "@react-navigation/native-stack"

import { ApiError } from "../../api/client"
import { AppStackParamList } from "../../navigation/types"
import { useAuth } from "../auth/AuthContext"
import { followUser, getProfileByUsername, unfollowUser } from "./apiRequests"
import { Profile } from "./types"

type OtherProfileProps = NativeStackScreenProps<AppStackParamList, "OtherProfile">

export default function OtherProfileScreen({ navigation, route }: OtherProfileProps) {
    const { token } = useAuth()
    const { username } = route.params
    const [profile, setProfile] = useState<Profile | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

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
        setError(null)
        try {
            const updatedProfile = profile.is_following
                ? await unfollowUser(profile.username, token)
                : await followUser(profile.username, token)
            setProfile(updatedProfile)
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.detail)
            } else if (err instanceof Error) {
                setError(err.message)
            } else {
                setError("Could not update follow state.")
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
            setError(null)
            try {
                const data = await getProfileByUsername(username, token)
                setProfile(data)
            } catch (err) {
                if (err instanceof ApiError) {
                    setError(err.detail)
                } else if (err instanceof Error) {
                    setError(err.message)
                } else {
                    setError("Failed to load profile.")
                }
            } finally {
                setIsLoading(false)
            }
        }
        fetchProfile()
    }, [token, username])

    return (
        <View style={styles.container}>
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
                <Text style={styles.error}>{error ?? "Profile not found."}</Text>
            )}

            {error !== null && profile !== null && <Text style={styles.error}>{error}</Text>}
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
    backButton: {
        position: "absolute",
        top: 58,
        left: 18,
        paddingVertical: 8,
        paddingHorizontal: 10,
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
})
