// ProfileList shows follower and following lists for any public profile.
import { useEffect, useState } from "react"
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { NativeStackScreenProps } from "@react-navigation/native-stack"

import { ApiError } from "../../api/client"
import StarAvatar from "../../components/StarAvatar"
import { AppStackParamList } from "../../navigation/types"
import { colors, fonts } from "../../theme"
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
    const kicker = listType === "followers" ? "FOLLOWERS" : "FOLLOWING"

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
                <Text style={styles.kicker}>{kicker}</Text>
                <Text style={styles.heading}>{title}</Text>
                <Text style={styles.subheading}>@{username}</Text>
            </View>

            {isLoading ? (
                <ActivityIndicator color={colors.clay} style={styles.status} />
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
                            <StarAvatar
                                initial={(profile.display_name || profile.username).charAt(0)}
                                outerColor={colors.clay}
                                size={44}
                            />
                            <View style={styles.profileText}>
                                <Text style={styles.displayName} numberOfLines={1}>
                                    {profile.display_name}
                                </Text>
                                <Text style={styles.username} numberOfLines={1}>
                                    @{profile.username}
                                </Text>
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
        backgroundColor: colors.bg,
    },
    header: {
        paddingTop: 60,
        paddingHorizontal: 18,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
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
        marginBottom: 4,
    },
    heading: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 28,
        lineHeight: 32,
        marginBottom: 4,
    },
    subheading: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 14,
    },
    status: {
        marginTop: 42,
    },
    error: {
        color: colors.dislike,
        fontSize: 15,
        marginTop: 42,
        textAlign: "center",
        paddingHorizontal: 24,
    },
    empty: {
        color: colors.inkDim,
        fontSize: 15,
        marginTop: 42,
        textAlign: "center",
        paddingHorizontal: 24,
    },
    list: {
        flex: 1,
    },
    listContent: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 24,
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.paper,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.line,
        padding: 14,
        marginBottom: 8,
        gap: 12,
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    profileText: {
        flex: 1,
        minWidth: 0,
    },
    displayName: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 16,
        lineHeight: 20,
        marginBottom: 3,
    },
    username: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 13,
    },
})
