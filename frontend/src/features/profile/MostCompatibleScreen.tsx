import { useEffect, useState } from "react"
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { NativeStackScreenProps } from "@react-navigation/native-stack"

import { ApiError } from "../../api/client"
import { AppStackParamList } from "../../navigation/types"
import { colors, fonts } from "../../theme"
import { useAuth } from "../auth/AuthContext"
import { getMostCompatible } from "./apiRequests"
import { MostCompatibleItem } from "./types"

type Props = NativeStackScreenProps<AppStackParamList, "MostCompatible">

export default function MostCompatibleScreen({ navigation }: Props) {
    const { token } = useAuth()
    const [users, setUsers] = useState<MostCompatibleItem[] | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        async function fetch() {
            if (!token) {
                return
            }
            try {
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

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>
                <Text style={styles.kicker}>TASTE COMPATIBILITY</Text>
                <Text style={styles.title}>Most Compatible</Text>
            </View>

            {users === null && error === null && (
                <ActivityIndicator color={colors.clay} style={styles.loader} />
            )}
            {error !== null && (
                <Text style={styles.error}>{error}</Text>
            )}
            {users !== null && users.length === 0 && (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>Rate more songs to find compatible listeners.</Text>
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
    kicker: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 10,
        letterSpacing: 1.8,
        marginBottom: 6,
    },
    title: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 28,
        lineHeight: 32,
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
})
