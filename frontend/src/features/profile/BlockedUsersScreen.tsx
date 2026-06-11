// Blocked users management. Blocked people can't follow you, see your taste, or
// appear in your feed, compatibility, or discovery. Mirrors the Bento Orbit
// "Blocked users" artboard.
import { useEffect, useState } from "react"
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { NativeStackScreenProps } from "@react-navigation/native-stack"

import { ApiError } from "../../api/client"
import { AppStackParamList } from "../../navigation/types"
import { colors, fonts } from "../../theme"
import { useAuth } from "../auth/AuthContext"
import { getBlockedProfiles, unblockUser } from "./apiRequests"
import { BackIcon, InfoIcon } from "./settingsIcons"
import { Profile } from "./types"

type BlockedUsersProps = NativeStackScreenProps<AppStackParamList, "BlockedUsers">

// Deterministic avatar background per user, cycling the Bento accent palette.
const AVATAR_COLORS = [colors.accent, colors.sky, colors.plum, colors.mint, colors.gold]

function avatarColor(username: string): string {
    let hash = 0
    for (let i = 0; i < username.length; i++) {
        hash = (hash * 31 + username.charCodeAt(i)) % 997
    }
    return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

export default function BlockedUsersScreen({ navigation }: BlockedUsersProps) {
    const { token } = useAuth()
    const [blocked, setBlocked] = useState<Profile[]>([])
    const [busyUsernames, setBusyUsernames] = useState<Set<string>>(new Set())
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let active = true
        async function fetchBlocked() {
            if (!token) {
                return
            }
            try {
                const data = await getBlockedProfiles(token)
                if (active) {
                    setBlocked(data.profiles)
                }
            } catch (err) {
                if (active) {
                    setError(errorMessage(err, "Failed to load blocked users."))
                }
            } finally {
                if (active) {
                    setIsLoading(false)
                }
            }
        }
        fetchBlocked()
        return () => {
            active = false
        }
    }, [token])

    const unblock = async (username: string) => {
        if (!token || busyUsernames.has(username)) {
            return
        }
        setBusyUsernames((set) => new Set(set).add(username))
        setError(null)
        try {
            await unblockUser(username, token)
            setBlocked((profiles) => profiles.filter((item) => item.username !== username))
        } catch (err) {
            setError(errorMessage(err, "Could not unblock user."))
        } finally {
            setBusyUsernames((set) => {
                const next = new Set(set)
                next.delete(username)
                return next
            })
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
                <Text style={styles.navTitle}>Blocked users</Text>
                <View style={[styles.navSide, { alignItems: "flex-end" }]} />
            </View>

            {isLoading ? (
                <ActivityIndicator color={colors.accent} style={styles.loader} />
            ) : (
                <ScrollView style={styles.body} contentContainerStyle={styles.content}>
                    <View style={styles.note}>
                        <InfoIcon size={14} color={colors.inkDim} />
                        <Text style={styles.noteText}>
                            Blocked people can’t follow you, see your taste, or appear in your feed,
                            compatibility, or discovery.
                        </Text>
                    </View>

                    {blocked.length === 0 ? (
                        <Text style={styles.empty}>You haven’t blocked anyone.</Text>
                    ) : (
                        <>
                            <View style={styles.card}>
                                {blocked.map((user, index) => {
                                    const busy = busyUsernames.has(user.username)
                                    return (
                                        <View
                                            key={user.id}
                                            style={[styles.row, index > 0 && styles.rowDivider]}
                                        >
                                            <View
                                                style={[
                                                    styles.bust,
                                                    { backgroundColor: avatarColor(user.username) },
                                                ]}
                                            >
                                                <Text style={styles.bustLetter}>
                                                    {(user.display_name || user.username).charAt(0).toUpperCase()}
                                                </Text>
                                            </View>
                                            <View style={styles.rowText}>
                                                <Text style={styles.displayName} numberOfLines={1}>
                                                    {user.display_name}
                                                </Text>
                                                <Text style={styles.username} numberOfLines={1}>
                                                    @{user.username}
                                                </Text>
                                            </View>
                                            <TouchableOpacity
                                                style={[styles.unblockBtn, busy && { opacity: 0.5 }]}
                                                onPress={() => unblock(user.username)}
                                                disabled={busy}
                                            >
                                                <Text style={styles.unblockText}>Unblock</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )
                                })}
                            </View>
                            <Text style={styles.count}>
                                {blocked.length} BLOCKED
                            </Text>
                        </>
                    )}

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
    note: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 8,
        marginTop: 8,
        marginBottom: 10,
        paddingHorizontal: 4,
    },
    noteText: {
        flex: 1,
        fontSize: 10.5,
        color: colors.inkDim,
        lineHeight: 15,
    },
    card: {
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 14,
        paddingHorizontal: 14,
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
        gap: 11,
        paddingVertical: 11,
    },
    rowDivider: {
        borderTopWidth: 1,
        borderTopColor: colors.line,
    },
    bust: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: "center",
        justifyContent: "center",
    },
    bustLetter: {
        fontFamily: fonts.display,
        fontSize: 16,
        color: "#fff",
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
        fontSize: 8.5,
        color: colors.inkDim,
        letterSpacing: 0.7,
        marginTop: 2,
    },
    unblockBtn: {
        borderWidth: 1.5,
        borderColor: colors.line,
        borderRadius: 999,
        backgroundColor: colors.bg,
        paddingVertical: 8,
        paddingHorizontal: 14,
    },
    unblockText: {
        fontFamily: fonts.display,
        fontSize: 11,
        color: colors.ink,
    },
    count: {
        fontFamily: fonts.mono,
        fontSize: 8.5,
        color: colors.inkDim,
        letterSpacing: 1,
        textAlign: "center",
        marginTop: 14,
    },
    empty: {
        color: colors.inkSoft,
        fontSize: 14,
        textAlign: "center",
        marginTop: 24,
    },
    error: {
        color: colors.danger,
        fontSize: 14,
        lineHeight: 20,
        textAlign: "center",
        marginTop: 14,
    },
})
