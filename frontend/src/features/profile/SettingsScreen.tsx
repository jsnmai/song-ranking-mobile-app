// Settings holds account-level controls that should not crowd the Profile identity surface.
import { useEffect, useState } from "react"
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native"
import { NativeStackScreenProps } from "@react-navigation/native-stack"

import { ApiError } from "../../api/client"
import { AppStackParamList } from "../../navigation/types"
import { colors, fonts } from "../../theme"
import { useAuth } from "../auth/AuthContext"
import { getBlockedProfiles, getMyProfile, unblockUser, updateMyVisibility } from "./apiRequests"
import { Profile, ProfileVisibility } from "./types"

type SettingsProps = NativeStackScreenProps<AppStackParamList, "Settings">

const VISIBILITY_OPTIONS: readonly [ProfileVisibility, string][] = [
    ["public", "Public"],
    ["friends_only", "Friends only"],
    ["only_me", "Only me"],
]

export default function SettingsScreen({ navigation }: SettingsProps) {
    const { token, deleteAccount, logout } = useAuth()
    const [profile, setProfile] = useState<Profile | null>(null)
    const [blockedProfiles, setBlockedProfiles] = useState<Profile[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [visibilitySaving, setVisibilitySaving] = useState<ProfileVisibility | null>(null)
    const [deleteConfirmation, setDeleteConfirmation] = useState("")
    const [isDeleteOpen, setIsDeleteOpen] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const changeVisibility = async (visibility: ProfileVisibility) => {
        if (!token || visibilitySaving !== null) {
            return
        }
        setVisibilitySaving(visibility)
        setError(null)
        try {
            const updated = await updateMyVisibility(visibility, token)
            setProfile(updated)
        } catch (err) {
            setError(errorMessage(err, "Could not update visibility."))
        } finally {
            setVisibilitySaving(null)
        }
    }

    const unblockProfile = async (username: string) => {
        if (!token) {
            return
        }
        setError(null)
        try {
            await unblockUser(username, token)
            setBlockedProfiles((profiles) => profiles.filter((item) => item.username !== username))
        } catch (err) {
            setError(errorMessage(err, "Could not unblock user."))
        }
    }

    const closeDeleteAccount = () => {
        if (isDeleting) {
            return
        }
        setIsDeleteOpen(false)
        setDeleteConfirmation("")
    }

    const confirmDeleteAccount = async () => {
        if (deleteConfirmation !== "DELETE" || isDeleting) {
            return
        }
        setIsDeleting(true)
        setError(null)
        try {
            await deleteAccount()
        } catch (err) {
            setError(errorMessage(err, "Could not delete account."))
            setIsDeleting(false)
        }
    }

    useEffect(() => {
        async function fetchSettings() {
            if (!token) {
                return
            }
            setIsLoading(true)
            setError(null)
            try {
                const [profileData, blockedData] = await Promise.all([
                    getMyProfile(token),
                    getBlockedProfiles(token),
                ])
                setProfile(profileData)
                setBlockedProfiles(blockedData.profiles)
            } catch (err) {
                setError(errorMessage(err, "Failed to load settings."))
            } finally {
                setIsLoading(false)
            }
        }
        fetchSettings()
    }, [token])

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.headerRow}>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>
                <Text style={styles.kicker}>SETTINGS</Text>
            </View>

            <Text style={styles.title}>Settings</Text>

            {isLoading ? (
                <ActivityIndicator color={colors.clay} style={styles.loader} />
            ) : (
                <>
                    <View style={styles.section}>
                        <Text style={styles.sectionKicker}>PRIVACY</Text>
                        <Text style={styles.sectionCopy}>
                            Controls who can see your ratings, rankings, profile taste stats, and social music activity.
                        </Text>
                        <View style={styles.visibilityGroup}>
                            {VISIBILITY_OPTIONS.map(([value, label]) => (
                                <TouchableOpacity
                                    key={value}
                                    style={[
                                        styles.visibilityButton,
                                        profile?.visibility === value && styles.visibilityButtonActive,
                                    ]}
                                    onPress={() => changeVisibility(value)}
                                    disabled={visibilitySaving !== null}
                                >
                                    <Text
                                        style={[
                                            styles.visibilityText,
                                            profile?.visibility === value && styles.visibilityTextActive,
                                        ]}
                                    >
                                        {visibilitySaving === value ? "Saving..." : label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionKicker}>BLOCKED USERS</Text>
                        {blockedProfiles.length === 0 ? (
                            <Text style={styles.emptyText}>No blocked users.</Text>
                        ) : blockedProfiles.map((blocked) => (
                            <View key={blocked.username} style={styles.blockedRow}>
                                <View>
                                    <Text style={styles.blockedName}>{blocked.display_name}</Text>
                                    <Text style={styles.blockedUsername}>@{blocked.username}</Text>
                                </View>
                                <TouchableOpacity
                                    style={styles.unblockButton}
                                    onPress={() => unblockProfile(blocked.username)}
                                >
                                    <Text style={styles.unblockText}>Unblock</Text>
                                </TouchableOpacity>
                            </View>
                        ))}
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionKicker}>ACCOUNT</Text>
                        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
                            <Text style={styles.logoutText}>Log Out</Text>
                        </TouchableOpacity>
                        <View style={styles.deleteBlock}>
                            <TouchableOpacity
                                style={styles.deleteOpenButton}
                                onPress={() => {
                                    setError(null)
                                    setIsDeleteOpen(true)
                                }}
                            >
                                <Text style={styles.deleteOpenText}>Delete account</Text>
                            </TouchableOpacity>

                            {isDeleteOpen && (
                                <View style={styles.deletePanel}>
                                    <Text style={styles.deleteTitle}>Delete account?</Text>
                                    <Text style={styles.deleteCopy}>
                                        This removes your profile, rankings, ratings, comparisons, follows, blocks,
                                        and feed activity. Songs remain in LISTn only as catalog metadata.
                                    </Text>
                                    <Text style={styles.deleteInstruction}>Type DELETE to confirm.</Text>
                                    <TextInput
                                        value={deleteConfirmation}
                                        onChangeText={setDeleteConfirmation}
                                        autoCapitalize="characters"
                                        autoCorrect={false}
                                        editable={!isDeleting}
                                        placeholder="DELETE"
                                        placeholderTextColor={colors.inkSoft}
                                        style={styles.deleteInput}
                                    />
                                    <View style={styles.deleteActions}>
                                        <TouchableOpacity
                                            style={styles.cancelDeleteButton}
                                            onPress={closeDeleteAccount}
                                            disabled={isDeleting}
                                        >
                                            <Text style={styles.cancelDeleteText}>Cancel</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            accessibilityState={{ disabled: deleteConfirmation !== "DELETE" || isDeleting }}
                                            style={[
                                                styles.confirmDeleteButton,
                                                (deleteConfirmation !== "DELETE" || isDeleting)
                                                    && styles.confirmDeleteButtonDisabled,
                                            ]}
                                            onPress={confirmDeleteAccount}
                                            disabled={deleteConfirmation !== "DELETE" || isDeleting}
                                        >
                                            <Text style={styles.confirmDeleteText}>
                                                {isDeleting ? "Deleting..." : "Delete"}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}
                        </View>
                    </View>
                </>
            )}

            {error !== null && <Text style={styles.error}>{error}</Text>}
        </ScrollView>
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
    content: {
        paddingHorizontal: 18,
        paddingTop: 58,
        paddingBottom: 36,
    },
    headerRow: {
        alignItems: "center",
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 24,
    },
    backButton: {
        paddingVertical: 8,
        paddingRight: 12,
    },
    backText: {
        fontFamily: fonts.mono,
        color: colors.ink,
        fontSize: 13,
        letterSpacing: 0.4,
    },
    kicker: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 10,
        letterSpacing: 1.8,
    },
    title: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 34,
        lineHeight: 38,
        marginBottom: 20,
    },
    loader: {
        marginTop: 32,
    },
    section: {
        borderTopWidth: 1,
        borderTopColor: colors.line,
        paddingTop: 16,
        marginBottom: 24,
    },
    sectionKicker: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 10,
        letterSpacing: 1.6,
        marginBottom: 8,
    },
    sectionCopy: {
        color: colors.inkSoft,
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 12,
    },
    visibilityGroup: {
        gap: 8,
    },
    visibilityButton: {
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 8,
        backgroundColor: colors.paper,
        paddingVertical: 12,
        paddingHorizontal: 14,
    },
    visibilityButtonActive: {
        borderColor: colors.ink,
        backgroundColor: colors.ink,
    },
    visibilityText: {
        fontFamily: fonts.mono,
        color: colors.ink,
        fontSize: 12,
        letterSpacing: 0.4,
    },
    visibilityTextActive: {
        color: colors.paper,
    },
    emptyText: {
        color: colors.inkSoft,
        fontSize: 14,
    },
    blockedRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
        paddingVertical: 12,
    },
    blockedName: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 18,
    },
    blockedUsername: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 11,
    },
    unblockButton: {
        borderWidth: 1,
        borderColor: colors.ink,
        borderRadius: 8,
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    unblockText: {
        fontFamily: fonts.mono,
        color: colors.ink,
        fontSize: 11,
    },
    logoutButton: {
        alignItems: "center",
        borderWidth: 1,
        borderColor: colors.ink,
        borderRadius: 8,
        backgroundColor: colors.paper,
        paddingVertical: 12,
        paddingHorizontal: 32,
    },
    logoutText: {
        fontFamily: fonts.mono,
        color: colors.ink,
        fontSize: 13,
        letterSpacing: 0.4,
    },
    deleteBlock: {
        marginTop: 12,
    },
    deleteOpenButton: {
        alignItems: "center",
        borderWidth: 1,
        borderColor: colors.dislike,
        borderRadius: 8,
        backgroundColor: colors.paper,
        paddingVertical: 12,
        paddingHorizontal: 32,
    },
    deleteOpenText: {
        fontFamily: fonts.mono,
        color: colors.dislike,
        fontSize: 13,
        letterSpacing: 0.4,
    },
    deletePanel: {
        borderWidth: 1,
        borderColor: colors.dislike,
        borderRadius: 8,
        backgroundColor: colors.paper,
        marginTop: 12,
        padding: 14,
    },
    deleteTitle: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 22,
        lineHeight: 26,
        marginBottom: 8,
    },
    deleteCopy: {
        color: colors.inkSoft,
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 12,
    },
    deleteInstruction: {
        fontFamily: fonts.mono,
        color: colors.ink,
        fontSize: 11,
        letterSpacing: 0.6,
        marginBottom: 8,
    },
    deleteInput: {
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 8,
        color: colors.ink,
        fontFamily: fonts.mono,
        fontSize: 14,
        paddingVertical: 10,
        paddingHorizontal: 12,
        marginBottom: 12,
    },
    deleteActions: {
        flexDirection: "row",
        gap: 10,
    },
    cancelDeleteButton: {
        alignItems: "center",
        borderWidth: 1,
        borderColor: colors.ink,
        borderRadius: 8,
        flex: 1,
        paddingVertical: 10,
    },
    cancelDeleteText: {
        fontFamily: fonts.mono,
        color: colors.ink,
        fontSize: 12,
    },
    confirmDeleteButton: {
        alignItems: "center",
        borderRadius: 8,
        backgroundColor: colors.dislike,
        flex: 1,
        paddingVertical: 10,
    },
    confirmDeleteButtonDisabled: {
        opacity: 0.45,
    },
    confirmDeleteText: {
        fontFamily: fonts.mono,
        color: colors.paper,
        fontSize: 12,
    },
    error: {
        color: colors.dislike,
        fontSize: 14,
        lineHeight: 20,
        textAlign: "center",
    },
})
