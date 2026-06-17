import { useEffect, useState } from "react"
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { NativeStackScreenProps } from "@react-navigation/native-stack"
import Svg, { Path } from "react-native-svg"

import { ApiError } from "../../api/client"
import { AppStackParamList } from "../../navigation/types"
import { colors, fonts } from "../../theme"
import { useAuth } from "../auth/AuthContext"
import { Profile } from "../profile/types"
import { getActivityLikers } from "./apiRequests"

type ActivityLikersProps = NativeStackScreenProps<AppStackParamList, "ActivityLikers">

const AVATAR_COLORS = [colors.accent, colors.sky, colors.plum, colors.mint, colors.gold]

function avatarColor(username: string): string {
    let hash = 0
    for (let i = 0; i < username.length; i++) {
        hash = (hash * 31 + username.charCodeAt(i)) % 997
    }
    return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function BackIcon() {
    return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"
            stroke={colors.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
        </Svg>
    )
}

export default function ActivityLikersScreen({ navigation, route }: ActivityLikersProps) {
    const { token } = useAuth()
    const { ratingEventId } = route.params
    const [profiles, setProfiles] = useState<Profile[] | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const openProfile = (profile: Profile) => {
        if (profile.is_own_profile) {
            navigation.navigate("MainTabs", { screen: "Profile" })
            return
        }
        navigation.navigate("OtherProfile", { username: profile.username })
    }

    useEffect(() => {
        let active = true
        async function fetchLikers() {
            if (!token) {
                return
            }
            setIsLoading(true)
            setError(null)
            try {
                const response = await getActivityLikers(ratingEventId, token)
                if (active) {
                    setProfiles(response.profiles)
                }
            } catch (err) {
                if (!active) {
                    return
                }
                if (err instanceof ApiError) {
                    setError(err.detail)
                } else if (err instanceof Error) {
                    setError(err.message)
                } else {
                    setError("Failed to load likes.")
                }
            } finally {
                if (active) {
                    setIsLoading(false)
                }
            }
        }
        fetchLikers()
        return () => {
            active = false
        }
    }, [ratingEventId, token])

    return (
        <View style={styles.container}>
            <View style={styles.navBar}>
                <View style={styles.navSide}>
                    <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={() => navigation.goBack()}
                        accessibilityLabel="Back"
                    >
                        <BackIcon />
                    </TouchableOpacity>
                </View>
                <Text style={styles.navTitle}>Likes</Text>
                <View style={[styles.navSide, { alignItems: "flex-end" }]} />
            </View>

            <ScrollView style={styles.body} contentContainerStyle={styles.content}>
                {isLoading ? (
                    <ActivityIndicator color={colors.accent} style={styles.status} />
                ) : error !== null ? (
                    <Text style={styles.error}>{error}</Text>
                ) : profiles === null || profiles.length === 0 ? (
                    <Text style={styles.empty}>No likes yet.</Text>
                ) : (
                    <View style={styles.card}>
                        {profiles.map((profile, index) => (
                            <TouchableOpacity
                                key={profile.id}
                                style={[styles.row, index > 0 && styles.rowDivider]}
                                onPress={() => openProfile(profile)}
                                activeOpacity={0.75}
                                testID={`activity-liker-${profile.username}`}
                            >
                                <View style={[styles.bust, { backgroundColor: avatarColor(profile.username) }]}>
                                    <Text style={styles.bustLetter}>
                                        {(profile.display_name || profile.username).charAt(0).toUpperCase()}
                                    </Text>
                                </View>
                                <View style={styles.rowText}>
                                    <Text style={styles.displayName} numberOfLines={1}>
                                        {profile.display_name}
                                    </Text>
                                    <Text style={styles.username} numberOfLines={1}>
                                        @{profile.username}
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}
            </ScrollView>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.bg,
    },
    navBar: {
        paddingTop: 58,
        paddingHorizontal: 14,
        paddingBottom: 8,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    navSide: {
        width: 60,
        flexDirection: "row",
    },
    navTitle: {
        fontFamily: fonts.display,
        fontSize: 14,
        letterSpacing: 0.3,
        color: colors.ink,
    },
    iconBtn: {
        width: 32,
        height: 32,
        borderRadius: 9,
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        alignItems: "center",
        justifyContent: "center",
    },
    body: {
        flex: 1,
    },
    content: {
        paddingHorizontal: 14,
        paddingBottom: 96,
    },
    status: {
        marginTop: 32,
    },
    error: {
        color: colors.danger,
        fontSize: 13,
        lineHeight: 19,
        textAlign: "center",
        marginTop: 32,
    },
    empty: {
        color: colors.inkDim,
        fontSize: 12,
        lineHeight: 18,
        textAlign: "center",
        marginTop: 32,
    },
    card: {
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 14,
        marginTop: 8,
        paddingHorizontal: 12,
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 12,
    },
    rowDivider: {
        borderTopWidth: 1,
        borderTopColor: colors.line,
    },
    bust: {
        width: 38,
        height: 38,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
    },
    bustLetter: {
        fontFamily: fonts.display,
        color: colors.paper,
        fontSize: 15,
    },
    rowText: {
        flex: 1,
        minWidth: 0,
    },
    displayName: {
        fontFamily: fonts.display,
        fontSize: 13,
        color: colors.ink,
    },
    username: {
        fontFamily: fonts.mono,
        fontSize: 9,
        color: colors.inkDim,
        marginTop: 2,
    },
})
