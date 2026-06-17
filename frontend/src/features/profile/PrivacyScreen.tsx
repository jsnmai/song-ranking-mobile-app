// Privacy lets the user pick who can see their taste: Public, Friends only, or
// Only me. "Friends only" means mutual follows; "Only me" hides taste from feeds,
// compatibility, Co-Signs, and discovery. Mirrors the Bento Orbit privacy artboard.
import { ComponentType, useEffect, useState } from "react"
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { NativeStackScreenProps } from "@react-navigation/native-stack"

import { ApiError } from "../../api/client"
import { AppStackParamList } from "../../navigation/types"
import { colors, fonts } from "../../theme"
import { useAuth } from "../auth/AuthContext"
import { getMyProfile, updateMyVisibility } from "./apiRequests"
import { updateLikePrivacy } from "../activity/apiRequests"
import { BackIcon, FriendsIcon, GlobeIcon, InfoIcon, LockIcon } from "./settingsIcons"
import { ProfileVisibility } from "./types"

type PrivacyProps = NativeStackScreenProps<AppStackParamList, "Privacy">

type IconComponent = ComponentType<{ size?: number; color?: string }>

const LEVELS: readonly {
    value: ProfileVisibility;
    label: string;
    icon: IconComponent;
    description: string;
}[] = [
    {
        value: "public",
        label: "Public",
        icon: GlobeIcon,
        description: "Anyone can see your ratings, Rankings, and taste.",
    },
    {
        value: "friends_only",
        label: "Friends only",
        icon: FriendsIcon,
        description: "Only mutual follows can see your taste and compatibility.",
    },
    {
        value: "only_me",
        label: "Only me",
        icon: LockIcon,
        description: "Nothing appears in feeds, compatibility, Co-Signs, or discovery.",
    },
]

export default function PrivacyScreen({ navigation }: PrivacyProps) {
    const { token } = useAuth()
    const [visibility, setVisibility] = useState<ProfileVisibility | null>(null)
    const [hideLikeCounts, setHideLikeCounts] = useState(false)
    const [saving, setSaving] = useState<ProfileVisibility | null>(null)
    const [isSavingLikePrivacy, setIsSavingLikePrivacy] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let active = true
        async function fetchProfile() {
            if (!token) {
                return
            }
            try {
                const profile = await getMyProfile(token)
                if (active) {
                    setVisibility(profile.visibility)
                    setHideLikeCounts(profile.hide_like_counts)
                }
            } catch (err) {
                if (active) {
                    setError(errorMessage(err, "Failed to load privacy settings."))
                }
            } finally {
                if (active) {
                    setIsLoading(false)
                }
            }
        }
        fetchProfile()
        return () => {
            active = false
        }
    }, [token])

    const selectLevel = async (value: ProfileVisibility) => {
        if (!token || saving !== null || value === visibility) {
            return
        }
        setSaving(value)
        setError(null)
        try {
            const updated = await updateMyVisibility(value, token)
            setVisibility(updated.visibility)
        } catch (err) {
            setError(errorMessage(err, "Could not update privacy."))
        } finally {
            setSaving(null)
        }
    }

    const toggleLikePrivacy = async () => {
        if (!token || isSavingLikePrivacy) {
            return
        }
        const nextValue = !hideLikeCounts
        setIsSavingLikePrivacy(true)
        setError(null)
        try {
            const updated = await updateLikePrivacy(nextValue, token)
            setHideLikeCounts(updated.hide_like_counts)
        } catch (err) {
            setError(errorMessage(err, "Could not update like privacy."))
        } finally {
            setIsSavingLikePrivacy(false)
        }
    }

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
                <Text style={styles.navTitle}>Privacy</Text>
                <View style={[styles.navSide, { alignItems: "flex-end" }]} />
            </View>

            {isLoading ? (
                <ActivityIndicator color={colors.accent} style={styles.loader} />
            ) : (
                <ScrollView style={styles.body} contentContainerStyle={styles.content}>
                    <Text style={styles.sectionLabel}>WHO CAN SEE YOUR TASTE</Text>
                    <View style={styles.levels}>
                        {LEVELS.map(({ value, label, icon: Icon, description }) => {
                            const active = visibility === value
                            return (
                                <TouchableOpacity
                                    key={value}
                                    style={[styles.level, active && styles.levelActive]}
                                    onPress={() => selectLevel(value)}
                                    disabled={saving !== null}
                                    activeOpacity={0.85}
                                    accessibilityRole="radio"
                                    accessibilityState={{ selected: active }}
                                >
                                    <View style={[styles.levelIcon, active && styles.levelIconActive]}>
                                        <Icon size={17} color={active ? colors.paper : colors.inkSoft} />
                                    </View>
                                    <View style={styles.levelText}>
                                        <Text style={styles.levelTitle}>{label}</Text>
                                        <Text style={styles.levelDesc}>{description}</Text>
                                    </View>
                                    <View style={[styles.radio, active && styles.radioActive]}>
                                        {saving === value
                                            ? <ActivityIndicator size="small" color={colors.ink} />
                                            : active && <View style={styles.radioDot} />}
                                    </View>
                                </TouchableOpacity>
                            )
                        })}
                    </View>

                    <View style={styles.note}>
                        <InfoIcon size={14} color={colors.inkDim} />
                        <Text style={styles.noteText}>
                            “Friends only” means mutual follows. Private taste never appears in feeds,
                            compatibility, Co-Signs, or discovery.
                        </Text>
                    </View>

                    <Text style={styles.sectionLabel}>ACTIVITY LIKES</Text>
                    <TouchableOpacity
                        style={styles.likePrivacyRow}
                        onPress={toggleLikePrivacy}
                        disabled={isSavingLikePrivacy}
                        accessibilityRole="switch"
                        accessibilityState={{ checked: hideLikeCounts, disabled: isSavingLikePrivacy }}
                        testID="hide-like-counts-toggle"
                        activeOpacity={0.85}
                    >
                        <View style={styles.likePrivacyText}>
                            <Text style={styles.likePrivacyTitle}>Hide like counts</Text>
                            <Text style={styles.likePrivacyDesc}>
                                Other people won’t see like counts or who liked your activity. You’ll still see them.
                            </Text>
                        </View>
                        <View style={[styles.switchTrack, hideLikeCounts && styles.switchTrackOn]}>
                            {isSavingLikePrivacy ? (
                                <ActivityIndicator size="small" color={hideLikeCounts ? colors.paper : colors.inkDim} />
                            ) : (
                                <View style={[styles.switchThumb, hideLikeCounts && styles.switchThumbOn]} />
                            )}
                        </View>
                    </TouchableOpacity>

                    {error !== null && <Text style={styles.error}>{error}</Text>}
                </ScrollView>
            )}
        </View>
    )
}

function errorMessage(err: unknown, fallback: string): string {
    if (err instanceof ApiError) {
        return err.detail
    }
    if (err instanceof Error) {
        return err.message
    }
    return fallback
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
    loader: {
        marginTop: 40,
    },
    body: {
        flex: 1,
    },
    content: {
        paddingHorizontal: 14,
        paddingBottom: 40,
    },
    sectionLabel: {
        fontFamily: fonts.mono,
        fontSize: 8.5,
        letterSpacing: 1.5,
        color: colors.inkDim,
        fontWeight: "700",
        marginTop: 8,
        marginBottom: 8,
        marginLeft: 4,
    },
    levels: {
        gap: 9,
    },
    level: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
        backgroundColor: colors.paper,
        borderWidth: 1.5,
        borderColor: colors.line,
        borderRadius: 14,
        paddingVertical: 13,
        paddingHorizontal: 14,
    },
    levelActive: {
        borderColor: colors.ink,
        shadowColor: colors.ink,
        shadowOpacity: 0.08,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 3 },
        elevation: 2,
    },
    levelIcon: {
        width: 34,
        height: 34,
        borderRadius: 9,
        backgroundColor: colors.bg,
        alignItems: "center",
        justifyContent: "center",
    },
    levelIconActive: {
        backgroundColor: colors.ink,
    },
    levelText: {
        flex: 1,
        minWidth: 0,
    },
    levelTitle: {
        fontFamily: fonts.display,
        fontSize: 14,
        color: colors.ink,
    },
    levelDesc: {
        fontSize: 11,
        color: colors.inkSoft,
        lineHeight: 15,
        marginTop: 2,
    },
    radio: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: colors.line,
        alignItems: "center",
        justifyContent: "center",
    },
    radioActive: {
        borderColor: colors.ink,
    },
    radioDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: colors.ink,
    },
    note: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 8,
        marginTop: 14,
        paddingHorizontal: 4,
    },
    noteText: {
        flex: 1,
        fontSize: 10.5,
        color: colors.inkDim,
        lineHeight: 15,
    },
    likePrivacyRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor: colors.paper,
        borderWidth: 1.5,
        borderColor: colors.line,
        borderRadius: 14,
        paddingVertical: 13,
        paddingHorizontal: 14,
    },
    likePrivacyText: {
        flex: 1,
        minWidth: 0,
    },
    likePrivacyTitle: {
        fontFamily: fonts.display,
        fontSize: 14,
        color: colors.ink,
    },
    likePrivacyDesc: {
        fontSize: 11,
        color: colors.inkSoft,
        lineHeight: 15,
        marginTop: 3,
    },
    switchTrack: {
        width: 44,
        height: 26,
        borderRadius: 13,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.bg,
        padding: 3,
        justifyContent: "center",
        flexShrink: 0,
    },
    switchTrackOn: {
        borderColor: colors.ink,
        backgroundColor: colors.ink,
    },
    switchThumb: {
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: colors.inkDim,
    },
    switchThumbOn: {
        alignSelf: "flex-end",
        backgroundColor: colors.paper,
    },
    error: {
        color: colors.danger,
        fontSize: 14,
        lineHeight: 20,
        textAlign: "center",
        marginTop: 14,
    },
})
