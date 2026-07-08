// Settings is the home for privacy, blocking, account controls, and legal links.
// It presents grouped menu rows (Bento Orbit design); privacy levels and the
// blocked list live on their own dedicated sub-screens.
import { ComponentType, ReactNode, useCallback, useEffect, useState } from "react"
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native"
import { useFocusEffect } from "@react-navigation/native"
import { NativeStackScreenProps } from "@react-navigation/native-stack"

import { ApiError } from "../../api/client"
import { AppStackParamList } from "../../navigation/types"
import { AVATAR_COLOR_TOKENS, avatarColorToken, colors, fonts } from "../../theme"
import { useAuth } from "../auth/AuthContext"
import { getBlockedProfiles, getMyProfile, updateMyProfile } from "./apiRequests"
import {
    BackIcon,
    BlockIcon,
    ChevronIcon,
    InfoIcon,
    LockIcon,
    LogoutIcon,
    TrashIcon,
} from "./settingsIcons"
import { AvatarColor, Profile, ProfileEditRequest, ProfileVisibility } from "./types"

type SettingsProps = NativeStackScreenProps<AppStackParamList, "Settings">

type IconComponent = ComponentType<{ size?: number; color?: string }>

const VISIBILITY_LABELS: Record<ProfileVisibility, string> = {
    public: "Public",
    friends_only: "Friends only",
    only_me: "Only me",
}

const ABOUT_ROWS: readonly {
    label: string;
    kind: AppStackParamList["LegalPlaceholder"]["kind"];
}[] = [
    { label: "Support", kind: "support" },
    { label: "Privacy Policy", kind: "privacy" },
    { label: "Terms", kind: "terms" },
    { label: "Community Guidelines", kind: "guidelines" },
]

export default function SettingsScreen({ navigation }: SettingsProps) {
    const { token, deleteAccount, logout, refreshProfile } = useAuth()
    const [profile, setProfile] = useState<Profile | null>(null)
    const [blockedCount, setBlockedCount] = useState(0)
    const [isLoading, setIsLoading] = useState(true)
    const [deleteConfirmation, setDeleteConfirmation] = useState("")
    const [isDeleteOpen, setIsDeleteOpen] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Edit-profile form state, seeded from the loaded profile.
    const [name, setName] = useState("")
    const [username, setUsername] = useState("")
    const [color, setColor] = useState<AvatarColor | null>(null)
    const [isSaving, setIsSaving] = useState(false)
    const [editError, setEditError] = useState<string | null>(null)
    const [savedOk, setSavedOk] = useState(false)

    // Seed the form whenever the profile (re)loads.
    useEffect(() => {
        if (profile) {
            setName(profile.display_name)
            setUsername(profile.username)
            setColor(profile.avatar_color)
        }
    }, [profile])

    const trimmedName = name.trim()
    const normUsername = username.trim().toLowerCase()
    const usernameValid = normUsername.length >= 3
        && normUsername.length <= 20
        && /^[a-z0-9_]+$/.test(normUsername)
    const nameValid = trimmedName.length >= 1 && trimmedName.length <= 30
    const dirty = profile !== null && (
        trimmedName !== profile.display_name
        || normUsername !== profile.username
        || (color ?? null) !== (profile.avatar_color ?? null)
    )
    const canSave = dirty && nameValid && usernameValid && !isSaving

    const saveProfile = async () => {
        if (!token || !profile || !canSave) {
            return
        }
        setIsSaving(true)
        setEditError(null)
        setSavedOk(false)
        const patch: ProfileEditRequest = {}
        if (trimmedName !== profile.display_name) {
            patch.display_name = trimmedName
        }
        if (normUsername !== profile.username) {
            patch.username = normUsername
        }
        if ((color ?? null) !== (profile.avatar_color ?? null)) {
            patch.avatar_color = color
        }
        try {
            const updated = await updateMyProfile(patch, token)
            setProfile(updated)
            // Keep the global auth profile in sync so the user's avatar updates everywhere.
            await refreshProfile()
            setSavedOk(true)
        } catch (err) {
            setEditError(errorMessage(err, "Could not save profile."))
        } finally {
            setIsSaving(false)
        }
    }

    // Re-fetch whenever Settings regains focus so visibility + blocked count
    // stay current after the user edits them on the sub-screens.
    useFocusEffect(
        useCallback(() => {
            let active = true
            async function fetchSettings() {
                if (!token) {
                    return
                }
                setError(null)
                try {
                    const [profileData, blockedData] = await Promise.all([
                        getMyProfile(token),
                        getBlockedProfiles(token),
                    ])
                    if (!active) {
                        return
                    }
                    setProfile(profileData)
                    setBlockedCount(blockedData.profiles.length)
                } catch (err) {
                    if (active) {
                        setError(errorMessage(err, "Failed to load settings."))
                    }
                } finally {
                    if (active) {
                        setIsLoading(false)
                    }
                }
            }
            fetchSettings()
            return () => {
                active = false
            }
        }, [token]),
    )

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
            await deleteAccount(deleteConfirmation)
        } catch (err) {
            setError(errorMessage(err, "Could not delete account."))
            setIsDeleting(false)
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
                <Text style={styles.navTitle}>Settings</Text>
                <View style={[styles.navSide, { alignItems: "flex-end" }]} />
            </View>

            {isLoading ? (
                <ActivityIndicator color={colors.accent} style={styles.loader} />
            ) : (
                <ScrollView style={styles.body} contentContainerStyle={styles.content}>
                    <View style={styles.group}>
                        <Text style={styles.groupLabel}>PROFILE</Text>
                        <View style={styles.card}>
                            <View style={styles.editRow}>
                                <View
                                    style={[styles.avatarPreview, { backgroundColor: avatarColorToken(color, colors.ink) }]}
                                    testID="edit-avatar-preview"
                                >
                                    <Text style={styles.avatarPreviewLetter}>
                                        {(trimmedName || normUsername || "?").charAt(0).toUpperCase()}
                                    </Text>
                                </View>
                                <View style={styles.editField}>
                                    <Text style={styles.editFieldLabel}>DISPLAY NAME</Text>
                                    <TextInput
                                        value={name}
                                        onChangeText={(t) => { setName(t); setSavedOk(false) }}
                                        placeholder="Your name"
                                        placeholderTextColor={colors.inkDim}
                                        maxLength={30}
                                        style={styles.editInput}
                                        testID="edit-display-name"
                                    />
                                </View>
                            </View>

                            <View style={[styles.editField, styles.editFieldDivider]}>
                                <Text style={styles.editFieldLabel}>USERNAME</Text>
                                <View style={styles.usernameWrap}>
                                    <Text style={styles.usernameAt}>@</Text>
                                    <TextInput
                                        value={username}
                                        onChangeText={(t) => { setUsername(t.toLowerCase()); setSavedOk(false) }}
                                        placeholder="username"
                                        placeholderTextColor={colors.inkDim}
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        maxLength={20}
                                        style={[styles.editInput, styles.usernameInput]}
                                        testID="edit-username"
                                    />
                                </View>
                                {username.length > 0 && !usernameValid && (
                                    <Text style={styles.fieldHint}>
                                        3 to 20 characters · letters, numbers, and underscores only.
                                    </Text>
                                )}
                            </View>

                            <View style={[styles.editField, styles.editFieldDivider]}>
                                <Text style={styles.editFieldLabel}>ICON COLOR</Text>
                                <View style={styles.swatchRow}>
                                    {AVATAR_COLOR_TOKENS.map((token) => (
                                        <TouchableOpacity
                                            key={token}
                                            onPress={() => { setColor(token); setSavedOk(false) }}
                                            // The selected ring sits OUTSIDE the color dot with a gap, so it
                                            // stays visible even on the dark "ink" swatch (a ring on the
                                            // fill would vanish against black).
                                            style={[styles.swatch, color === token && styles.swatchSelected]}
                                            accessibilityLabel={`Icon color ${token}`}
                                            testID={`edit-color-${token}`}
                                        >
                                            <View style={[styles.swatchDot, { backgroundColor: avatarColorToken(token, colors.ink) }]} />
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>

                            <TouchableOpacity
                                style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
                                onPress={saveProfile}
                                disabled={!canSave}
                                testID="edit-save"
                            >
                                <Text style={styles.saveButtonText}>
                                    {isSaving ? "Saving…" : savedOk ? "Saved ✓" : "Save changes"}
                                </Text>
                            </TouchableOpacity>
                            {editError !== null && <Text style={styles.editErrorText}>{editError}</Text>}
                        </View>
                    </View>

                    <Group label="PRIVACY & SAFETY">
                        <Row
                            icon={LockIcon}
                            label="Privacy"
                            meta={profile ? VISIBILITY_LABELS[profile.visibility] : undefined}
                            onPress={() => navigation.navigate("Privacy")}
                            isFirst
                        />
                        <Row
                            icon={BlockIcon}
                            label="Blocked users"
                            meta={blockedCount > 0 ? String(blockedCount) : undefined}
                            onPress={() => navigation.navigate("BlockedUsers")}
                        />
                    </Group>

                    <Group label="ABOUT">
                        {ABOUT_ROWS.map((row, index) => (
                            <Row
                                key={row.kind}
                                icon={InfoIcon}
                                label={row.label}
                                onPress={() => navigation.navigate("LegalPlaceholder", { kind: row.kind })}
                                isFirst={index === 0}
                            />
                        ))}
                    </Group>

                    <Group>
                        <Row icon={LogoutIcon} label="Log out" onPress={logout} isFirst />
                    </Group>

                    {/* Delete account is isolated far below the rest so it can't be
                        fat-fingered next to Log out; opening it still requires typing DELETE. */}
                    <View style={styles.dangerZone}>
                        <Text style={styles.dangerLabel}>DANGER ZONE</Text>
                        <View style={styles.card}>
                            <Row
                                icon={TrashIcon}
                                label="Delete account"
                                onPress={() => {
                                    setError(null)
                                    setIsDeleteOpen((open) => !open)
                                }}
                                danger
                                isFirst
                            />
                        </View>
                    </View>

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
                                placeholderTextColor={colors.inkDim}
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
                                    accessibilityState={{
                                        disabled: deleteConfirmation !== "DELETE" || isDeleting,
                                    }}
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

                    {error !== null && <Text style={styles.error}>{error}</Text>}

                    <Text style={styles.footer}>LISTn v1.0 · MADE FOR LISTENERS</Text>
                </ScrollView>
            )}
        </View>
    )
}

function Group({ label, children }: { label?: string; children: ReactNode }) {
    return (
        <View style={styles.group}>
            {label && <Text style={styles.groupLabel}>{label}</Text>}
            <View style={styles.card}>{children}</View>
        </View>
    )
}

function Row({
    icon: Icon,
    label,
    meta,
    onPress,
    danger,
    isFirst,
}: {
    icon: IconComponent;
    label: string;
    meta?: string;
    onPress: () => void;
    danger?: boolean;
    isFirst?: boolean;
}) {
    const tint = danger ? colors.danger : colors.ink
    return (
        <TouchableOpacity
            style={[styles.row, !isFirst && styles.rowDivider]}
            onPress={onPress}
            activeOpacity={0.7}
        >
            <View style={[styles.iconTile, danger && styles.iconTileDanger]}>
                <Icon size={16} color={danger ? colors.danger : colors.inkSoft} />
            </View>
            <Text style={[styles.rowLabel, { color: tint }]}>{label}</Text>
            {meta && <Text style={styles.rowMeta}>{meta}</Text>}
            {!danger && <ChevronIcon size={14} color={colors.inkDim} />}
        </TouchableOpacity>
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
    group: {
        marginTop: 18,
    },
    groupLabel: {
        fontFamily: fonts.mono,
        fontSize: 8.5,
        letterSpacing: 1.5,
        color: colors.inkDim,
        fontWeight: "700",
        marginBottom: 7,
        marginLeft: 4,
    },
    card: {
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 14,
        paddingHorizontal: 14,
    },
    editRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 14,
    },
    avatarPreview: {
        width: 52,
        height: 52,
        borderRadius: 26,
        alignItems: "center",
        justifyContent: "center",
    },
    avatarPreviewLetter: {
        fontFamily: fonts.display,
        color: "#fff",
        fontSize: 22,
    },
    editField: {
        flex: 1,
    },
    editFieldDivider: {
        borderTopWidth: 1,
        borderTopColor: colors.line,
        paddingVertical: 14,
    },
    editFieldLabel: {
        fontFamily: fonts.mono,
        fontSize: 8.5,
        letterSpacing: 1.5,
        color: colors.inkDim,
        fontWeight: "700",
        marginBottom: 6,
    },
    editInput: {
        fontFamily: fonts.display,
        fontSize: 15,
        color: colors.ink,
        paddingVertical: 0,
    },
    usernameWrap: {
        flexDirection: "row",
        alignItems: "center",
    },
    usernameAt: {
        fontFamily: fonts.display,
        fontSize: 15,
        color: colors.inkDim,
        marginRight: 2,
    },
    usernameInput: {
        flex: 1,
    },
    fieldHint: {
        fontFamily: fonts.mono,
        fontSize: 9,
        color: colors.danger,
        marginTop: 6,
        letterSpacing: 0.2,
    },
    swatchRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 12,
    },
    swatch: {
        width: 34,
        height: 34,
        borderRadius: 17,
        borderWidth: 2,
        borderColor: "transparent",
        alignItems: "center",
        justifyContent: "center",
    },
    swatchSelected: {
        borderColor: colors.ink,
    },
    swatchDot: {
        width: 26,
        height: 26,
        borderRadius: 13,
    },
    saveButton: {
        backgroundColor: colors.ink,
        borderRadius: 10,
        alignItems: "center",
        paddingVertical: 12,
        marginVertical: 14,
    },
    saveButtonDisabled: {
        opacity: 0.4,
    },
    saveButtonText: {
        fontFamily: fonts.display,
        fontSize: 13,
        color: colors.paper,
        letterSpacing: 0.3,
    },
    editErrorText: {
        color: colors.danger,
        fontFamily: fonts.mono,
        fontSize: 10,
        marginBottom: 12,
        letterSpacing: 0.2,
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 12,
    },
    rowDivider: {
        borderTopWidth: 1,
        borderTopColor: colors.line,
    },
    iconTile: {
        width: 30,
        height: 30,
        borderRadius: 8,
        backgroundColor: colors.bg,
        alignItems: "center",
        justifyContent: "center",
    },
    iconTileDanger: {
        backgroundColor: "rgba(224,73,46,0.1)",
    },
    rowLabel: {
        flex: 1,
        fontFamily: fonts.display,
        fontSize: 13,
    },
    rowMeta: {
        fontFamily: fonts.mono,
        fontSize: 9,
        color: colors.inkDim,
        letterSpacing: 0.5,
    },
    dangerZone: {
        marginTop: 44,
    },
    dangerLabel: {
        fontFamily: fonts.mono,
        fontSize: 8.5,
        letterSpacing: 1.5,
        color: colors.danger,
        fontWeight: "700",
        marginBottom: 7,
        marginLeft: 4,
    },
    deletePanel: {
        borderWidth: 1,
        borderColor: colors.danger,
        borderRadius: 14,
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
        backgroundColor: colors.danger,
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
        color: colors.danger,
        fontSize: 14,
        lineHeight: 20,
        textAlign: "center",
        marginTop: 14,
    },
    footer: {
        fontFamily: fonts.mono,
        fontSize: 8.5,
        color: colors.inkDim,
        letterSpacing: 1,
        textAlign: "center",
        marginTop: 22,
    },
})
