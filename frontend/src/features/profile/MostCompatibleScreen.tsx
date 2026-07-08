import { useEffect, useState } from "react"
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { NativeStackScreenProps } from "@react-navigation/native-stack"

import { ApiError } from "../../api/client"
import { LockIcon } from "../../components/LockIcon"
import { AppStackParamList } from "../../navigation/types"
import { colors, fonts } from "../../theme"
import { useAuth } from "../auth/AuthContext"
import { getMostCompatible } from "./apiRequests"
import { MostCompatibleItem } from "./types"

type Props = NativeStackScreenProps<AppStackParamList, "MostCompatible">
type Tab = "friends" | "global"

export default function MostCompatibleScreen({ navigation }: Props) {
    const { token } = useAuth()
    const [tab, setTab] = useState<Tab>("friends")
    const [users, setUsers] = useState<MostCompatibleItem[] | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        async function fetch() {
            if (!token) {
                return
            }
            try {
                // Free tier = friends (the mutual-follow circle, the endpoint default). The global
                // scope is premium-gated server-side; we only fetch friends here.
                const data = await getMostCompatible(token)
                setUsers(data.users)
            } catch (err) {
                if (err instanceof ApiError) {
                    setError(err.detail)
                } else if (err instanceof Error) {
                    setError(err.message)
                } else {
                    setError("Failed to load compatible listeners.")
                }
            }
        }
        fetch()
    }, [token])

    // PAYWALL: the global "taste twins" view is premium-only and there's no payment flow yet, so the
    // locked state shows a quiet COMING SOON chip instead of an upgrade button. A CTA that only opened
    // an OS "coming soon" alert would be a dead-end affordance. When in-app purchases ship, the chip
    // becomes the real upgrade button and the Global tab fetches getMostCompatible(token, "global").
    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>
                <Text style={styles.title}>Taste Compatibility</Text>
                <View style={styles.tabs}>
                    <TouchableOpacity
                        style={[styles.tab, tab === "friends" && styles.tabActive]}
                        onPress={() => setTab("friends")}
                        testID="compat-tab-friends"
                    >
                        <Text style={[styles.tabText, tab === "friends" && styles.tabTextActive]}>YOUR CIRCLE</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.tab, tab === "global" && styles.tabActive]}
                        onPress={() => setTab("global")}
                        testID="compat-tab-global"
                    >
                        <LockIcon color={tab === "global" ? "#fff" : colors.inkDim} size={11} />
                        <Text style={[styles.tabText, tab === "global" && styles.tabTextActive]}>GLOBAL</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {tab === "friends" ? (
                <>
                    {users === null && error === null && (
                        <ActivityIndicator color={colors.clay} style={styles.loader} />
                    )}
                    {error !== null && (
                        <Text style={styles.error}>{error}</Text>
                    )}
                    {users !== null && users.length === 0 && (
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                                Follow friends and rate more songs to see taste matches.
                            </Text>
                        </View>
                    )}
                    {users !== null && users.length > 0 && (
                        <FlatList
                            data={users}
                            keyExtractor={(item) => item.username}
                            contentContainerStyle={styles.listContent}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={styles.row}
                                    onPress={() => navigation.navigate("OtherProfile", { username: item.username })}
                                    testID={`most-compatible-row-${item.username}`}
                                >
                                    <View style={styles.userInfo}>
                                        <Text style={styles.displayName} numberOfLines={1}>{item.display_name}</Text>
                                        <Text style={styles.username} numberOfLines={1}>@{item.username}</Text>
                                        <Text style={styles.explanation} numberOfLines={1}>{item.explanation}</Text>
                                    </View>
                                    <View style={styles.scoreInfo}>
                                        <Text style={styles.percent}>{Math.round(item.similarity_score * 100)}% match</Text>
                                        <Text style={styles.sharedCount}>Based on {item.shared_song_count} shared ratings</Text>
                                    </View>
                                </TouchableOpacity>
                            )}
                        />
                    )}
                </>
            ) : (
                <View style={styles.lockedGlobal} testID="compat-global-locked">
                    <View style={styles.lockedGlobalIcon}>
                        <LockIcon color={colors.gold} size={26} />
                    </View>
                    <View style={styles.premiumTag}>
                        <Text style={styles.premiumTagText}>PREMIUM</Text>
                    </View>
                    <Text style={styles.lockedGlobalTitle}>Global taste twins</Text>
                    <Text style={styles.lockedGlobalBody}>
                        Your circle shows friends who match your taste. Go global to find listeners across
                        all of LISTn who share it, even people you don't follow.
                    </Text>
                    <View style={styles.comingSoonChip} testID="compat-global-coming-soon">
                        <Text style={styles.comingSoonChipText}>COMING SOON</Text>
                    </View>
                </View>
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
        paddingHorizontal: 18,
        paddingTop: 60,
        paddingBottom: 16,
    },
    backButton: {
        paddingVertical: 8,
        marginBottom: 16,
        alignSelf: "flex-start",
    },
    backText: {
        fontFamily: fonts.mono,
        color: colors.ink,
        fontSize: 14,
        letterSpacing: 0.4,
    },
    title: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 28,
        lineHeight: 32,
    },
    tabs: {
        flexDirection: "row",
        gap: 8,
        marginTop: 16,
    },
    tab: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.line,
    },
    tabActive: {
        backgroundColor: colors.ink,
        borderColor: colors.ink,
    },
    tabText: {
        fontFamily: fonts.mono,
        fontSize: 11,
        letterSpacing: 1,
        fontWeight: "700",
        color: colors.inkDim,
    },
    tabTextActive: {
        color: "#fff",
    },
    loader: {
        marginTop: 40,
    },
    error: {
        color: colors.dislike,
        fontSize: 14,
        marginTop: 24,
        textAlign: "center",
        paddingHorizontal: 18,
    },
    emptyContainer: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 32,
    },
    emptyText: {
        color: colors.inkSoft,
        fontSize: 15,
        lineHeight: 22,
        textAlign: "center",
    },
    listContent: {
        paddingHorizontal: 18,
        paddingBottom: 32,
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
        gap: 12,
    },
    userInfo: {
        flex: 1,
        minWidth: 0,
    },
    displayName: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 16,
        lineHeight: 20,
    },
    username: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 12,
        marginTop: 2,
    },
    explanation: {
        color: colors.inkDim,
        fontSize: 12,
        lineHeight: 16,
        marginTop: 4,
    },
    scoreInfo: {
        alignItems: "flex-end",
    },
    percent: {
        fontFamily: fonts.mono,
        color: colors.like,
        fontSize: 14,
        letterSpacing: 0.2,
    },
    sharedCount: {
        fontFamily: fonts.mono,
        color: colors.inkDim,
        fontSize: 10,
        marginTop: 3,
        letterSpacing: 0.2,
    },
    // Global tab — premium locked state (see PAYWALL note above)
    lockedGlobal: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 32,
        gap: 12,
    },
    lockedGlobalIcon: {
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(245,184,64,0.16)",
    },
    premiumTag: {
        backgroundColor: colors.gold,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
    },
    premiumTagText: {
        fontFamily: fonts.mono,
        fontSize: 10,
        letterSpacing: 1.5,
        fontWeight: "700",
        color: colors.ink,
    },
    lockedGlobalTitle: {
        fontFamily: fonts.serif,
        fontSize: 22,
        color: colors.ink,
    },
    lockedGlobalBody: {
        color: colors.inkSoft,
        fontSize: 14,
        lineHeight: 20,
        textAlign: "center",
    },
    // Quiet, non-interactive replacement for an upgrade button until a real payment flow exists.
    comingSoonChip: {
        marginTop: 8,
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.line,
    },
    comingSoonChipText: {
        fontFamily: fonts.mono,
        fontSize: 11,
        letterSpacing: 1.5,
        fontWeight: "700",
        color: colors.inkDim,
    },
})
