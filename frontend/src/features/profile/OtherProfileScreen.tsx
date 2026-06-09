// OtherProfile shows another user's public profile and the follow/unfollow action.
import { useEffect, useState } from "react"
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native"
import { NativeStackScreenProps } from "@react-navigation/native-stack"

import { ApiError } from "../../api/client"
import DiamondScore from "../../components/DiamondScore"
import StarAvatar from "../../components/StarAvatar"
import { RankingResponse } from "../comparison/types"
import { AppStackParamList } from "../../navigation/types"
import { colors, fonts } from "../../theme"
import { useAuth } from "../auth/AuthContext"
import {
    blockUser,
    followUser,
    getCompatibility,
    getProfileBookmarked,
    getProfileByUsername,
    getProfileRankings,
    getProfileRecentVerdicts,
    getUserTasteProfile,
    reportUser,
    unblockUser,
    unfollowUser,
} from "./apiRequests"
import { CompatibilityResponse, Profile, RecentVerdictItem, ReportReason, TasteProfileResponse } from "./types"
import TasteTabContent from "./TasteTabContent"
import RankingsPreviewModule from "./RankingsPreviewModule"
import RecentVerdictsModule from "./RecentVerdictsModule"

type OtherProfileProps = NativeStackScreenProps<AppStackParamList, "OtherProfile">
type ProfileTab = "profile" | "taste"

const REPORT_REASONS: readonly { value: ReportReason; label: string }[] = [
    { value: "harassment", label: "Harassment" },
    { value: "hate_or_abuse", label: "Hate or abuse" },
    { value: "impersonation", label: "Impersonation" },
    { value: "inappropriate_content", label: "Inappropriate content" },
    { value: "spam", label: "Spam" },
    { value: "under_13", label: "Under 13" },
    { value: "other", label: "Other" },
]

function compatibilityAccent(similarityScore: number): string {
    const percent = Math.round(similarityScore * 100)
    if (percent >= 70) {
        return colors.like
    }
    if (percent < 50) {
        return colors.dislike
    }
    return colors.okay
}

export default function OtherProfileScreen({ navigation, route }: OtherProfileProps) {
    const { token } = useAuth()
    const { username } = route.params
    const [profile, setProfile] = useState<Profile | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [profileError, setProfileError] = useState<string | null>(null)
    const [taste, setTaste] = useState<TasteProfileResponse | null>(null)
    const [tasteLoading, setTasteLoading] = useState(false)
    const [tasteError, setTasteError] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState<ProfileTab>("profile")
    const [compatibility, setCompatibility] = useState<CompatibilityResponse | null>(null)
    const [compatLoading, setCompatLoading] = useState(false)
    const [isReportOpen, setIsReportOpen] = useState(false)
    const [reportReason, setReportReason] = useState<ReportReason | null>(null)
    const [reportDetails, setReportDetails] = useState("")
    const [isReporting, setIsReporting] = useState(false)
    const [reportError, setReportError] = useState<string | null>(null)
    const [reportSuccess, setReportSuccess] = useState(false)
    const [verdicts, setVerdicts] = useState<RecentVerdictItem[] | null>(null)
    const [rankingsPreview, setRankingsPreview] = useState<RankingResponse[] | null>(null)

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
        setProfileError(null)
        try {
            const updatedProfile = profile.is_following
                ? await unfollowUser(profile.username, token)
                : await followUser(profile.username, token)
            setProfile(updatedProfile)
        } catch (err) {
            if (err instanceof ApiError) {
                setProfileError(err.detail)
            } else if (err instanceof Error) {
                setProfileError(err.message)
            } else {
                setProfileError("Could not update follow state.")
            }
        } finally {
            setIsSaving(false)
        }
    }

    const toggleBlock = async () => {
        if (!token || !profile || profile.is_own_profile || isSaving) {
            return
        }

        setIsSaving(true)
        setProfileError(null)
        try {
            const updatedProfile = profile.is_blocked
                ? await unblockUser(profile.username, token)
                : await blockUser(profile.username, token)
            setProfile(updatedProfile)
            setCompatibility(null)
            setTaste(null)
        } catch (err) {
            if (err instanceof ApiError) {
                setProfileError(err.detail)
            } else if (err instanceof Error) {
                setProfileError(err.message)
            } else {
                setProfileError("Could not update block state.")
            }
        } finally {
            setIsSaving(false)
        }
    }

    const openReport = () => {
        setIsReportOpen(true)
        setReportSuccess(false)
        setReportError(null)
    }

    const closeReport = () => {
        if (isReporting) {
            return
        }
        setIsReportOpen(false)
        setReportReason(null)
        setReportDetails("")
        setReportError(null)
    }

    const submitReport = async () => {
        if (!token || !profile || reportReason === null || isReporting) {
            return
        }

        setIsReporting(true)
        setReportError(null)
        try {
            await reportUser(
                profile.username,
                {
                    target_type: "profile",
                    reason: reportReason,
                    details: reportDetails,
                },
                token,
            )
            setReportSuccess(true)
            setIsReportOpen(false)
            setReportReason(null)
            setReportDetails("")
        } catch (err) {
            if (err instanceof ApiError) {
                setReportError(err.detail)
            } else if (err instanceof Error) {
                setReportError(err.message)
            } else {
                setReportError("Could not submit report.")
            }
        } finally {
            setIsReporting(false)
        }
    }

    useEffect(() => {
        async function fetchProfile() {
            if (!token) {
                return
            }
            setIsLoading(true)
            setProfileError(null)
            try {
                const data = await getProfileByUsername(username, token)
                setProfile(data)
            } catch (err) {
                if (err instanceof ApiError) {
                    setProfileError(err.detail)
                } else if (err instanceof Error) {
                    setProfileError(err.message)
                } else {
                    setProfileError("Failed to load profile.")
                }
            } finally {
                setIsLoading(false)
            }
        }
        fetchProfile()
    }, [token, username])

    useEffect(() => {
        if (activeTab !== "taste" || !token || !profile || !profile.can_view_taste) {
            return
        }
        async function fetchTaste() {
            if (!token) {
                return
            }
            setTasteLoading(true)
            setTasteError(null)
            try {
                const data = await getUserTasteProfile(username, token)
                setTaste(data)
            } catch (err) {
                if (err instanceof ApiError) {
                    setTasteError(err.detail)
                } else if (err instanceof Error) {
                    setTasteError(err.message)
                } else {
                    setTasteError("Failed to load taste profile.")
                }
            } finally {
                setTasteLoading(false)
            }
        }
        fetchTaste()
    }, [activeTab, profile, token, username])

    useEffect(() => {
        if (!token || !profile || !profile.can_view_taste) {
            return
        }
        async function fetchCompatibility() {
            if (!token) {
                return
            }
            setCompatLoading(true)
            try {
                const data = await getCompatibility(username, token)
                setCompatibility(data)
            } catch {
                // 404 (private profile) or network error — silently hide the card
                setCompatibility(null)
            } finally {
                setCompatLoading(false)
            }
        }
        fetchCompatibility()
    }, [profile, token, username])

    useEffect(() => {
        if (!token || !profile || !profile.can_view_taste) {
            return
        }
        async function fetchModules() {
            if (!token) {
                return
            }
            try {
                const [vData, rData] = await Promise.all([
                    getProfileRecentVerdicts(username, token),
                    getProfileRankings(username, token),
                ])
                setVerdicts(vData.items)
                setRankingsPreview(rData.rankings.slice(0, 5))
            } catch {
                // silently degrade — modules show empty state
                setVerdicts([])
                setRankingsPreview([])
            }
        }
        fetchModules()
    }, [profile, token, username])

    const profileInitial = profile
        ? (profile.display_name || profile.username).charAt(0).toUpperCase()
        : "?"

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>

                {isLoading ? (
                    <ActivityIndicator color={colors.clay} style={styles.loader} />
                ) : profile ? (
                    <View style={styles.info}>
                        <Text style={styles.kicker}>LISTn MEMBER</Text>
                        <StarAvatar
                            initial={profileInitial}
                            outerColor={colors.clay}
                            size={56}
                            testID="other-profile-star-avatar"
                        />
                        <Text style={styles.displayName}>{profile.display_name}</Text>
                        <Text style={styles.username}>@{profile.username}</Text>
                        <View style={styles.countCard}>
                            <TouchableOpacity style={styles.countButton} onPress={openFollowers}>
                                <Text style={styles.countValue}>{profile.follower_count}</Text>
                                <Text style={styles.countLabel}>FOLLOWERS</Text>
                            </TouchableOpacity>
                            <View style={styles.countDivider} />
                            <TouchableOpacity style={styles.countButton} onPress={openFollowing}>
                                <Text style={styles.countValue}>{profile.following_count}</Text>
                                <Text style={styles.countLabel}>FOLLOWING</Text>
                            </TouchableOpacity>
                        </View>
                        {profile.user_stats && (
                            <View style={styles.statsCard} testID="other-profile-stats">
                                <TouchableOpacity
                                    style={styles.statButton}
                                    onPress={() => navigation.navigate("UserRankings", { username })}
                                    testID="stats-rated"
                                >
                                    <Text style={styles.statValue}>{profile.user_stats.rated_count}</Text>
                                    <Text style={styles.statLabel}>RATED</Text>
                                </TouchableOpacity>
                                <View style={styles.statDivider} />
                                <TouchableOpacity
                                    style={styles.statButton}
                                    onPress={() => navigation.navigate("UserBookmarked", { username })}
                                    testID="stats-bookmarked"
                                >
                                    <Text style={styles.statValue}>{profile.user_stats.bookmarked_count}</Text>
                                    <Text style={styles.statLabel}>BOOKMARKED</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                        {!profile.is_own_profile && (
                            <View style={styles.actions}>
                                <View style={styles.actionRow}>
                                    <TouchableOpacity
                                        style={[
                                            styles.followButton,
                                            profile.is_following ? styles.followingButton : null,
                                        ]}
                                        onPress={toggleFollow}
                                        disabled={isSaving}
                                    >
                                        <Text style={[
                                            styles.followText,
                                            profile.is_following ? styles.followingText : null,
                                        ]}>
                                            {isSaving ? "Saving..." : profile.is_following ? "Following" : "Follow"}
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.blockButton, profile.is_blocked ? styles.unblockButton : null]}
                                        onPress={toggleBlock}
                                        disabled={isSaving}
                                    >
                                        <Text style={[styles.blockText, profile.is_blocked ? styles.unblockText : null]}>
                                            {profile.is_blocked ? "Unblock" : "Block"}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                                <TouchableOpacity
                                    style={styles.reportButton}
                                    onPress={openReport}
                                    disabled={isReporting}
                                >
                                    <Text style={styles.reportButtonText}>Report user</Text>
                                </TouchableOpacity>
                                {reportSuccess && (
                                    <Text style={styles.reportSuccess}>Thanks. We'll review this report.</Text>
                                )}
                                {isReportOpen && (
                                    <View style={styles.reportPanel}>
                                        <Text style={styles.reportTitle}>Report user</Text>
                                        <Text style={styles.reportLabel}>Why are you reporting this user?</Text>
                                        <View style={styles.reasonGrid}>
                                            {REPORT_REASONS.map((reason) => (
                                                <TouchableOpacity
                                                    key={reason.value}
                                                    style={[
                                                        styles.reasonButton,
                                                        reportReason === reason.value && styles.reasonButtonActive,
                                                    ]}
                                                    onPress={() => setReportReason(reason.value)}
                                                    disabled={isReporting}
                                                >
                                                    <Text style={[
                                                        styles.reasonText,
                                                        reportReason === reason.value && styles.reasonTextActive,
                                                    ]}>
                                                        {reason.label}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                        <Text style={styles.reportLabel}>Add details, optional</Text>
                                        <TextInput
                                            value={reportDetails}
                                            onChangeText={setReportDetails}
                                            editable={!isReporting}
                                            multiline
                                            maxLength={1000}
                                            placeholder="Add context for review."
                                            placeholderTextColor={colors.inkSoft}
                                            style={styles.reportInput}
                                        />
                                        {reportError !== null && (
                                            <Text style={styles.reportError}>{reportError}</Text>
                                        )}
                                        <View style={styles.reportActions}>
                                            <TouchableOpacity
                                                style={styles.cancelReportButton}
                                                onPress={closeReport}
                                                disabled={isReporting}
                                            >
                                                <Text style={styles.cancelReportText}>Cancel</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                accessibilityState={{ disabled: reportReason === null || isReporting }}
                                                style={[
                                                    styles.submitReportButton,
                                                    (reportReason === null || isReporting)
                                                        && styles.submitReportButtonDisabled,
                                                ]}
                                                onPress={submitReport}
                                                disabled={reportReason === null || isReporting}
                                            >
                                                <Text style={styles.submitReportText}>
                                                    {isReporting ? "Submitting..." : "Submit report"}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                )}
                            </View>
                        )}
                    </View>
                ) : (
                    <Text style={styles.error}>{profileError ?? "Profile not found."}</Text>
                )}

                {profileError !== null && profile !== null && <Text style={styles.error}>{profileError}</Text>}
            </View>

            {profile && (
                <>
                    {!profile.can_view_taste && (
                        <View style={styles.privateCard}>
                            <Text style={styles.privateTitle}>
                                {profile.visibility === "friends_only"
                                    ? "This user shares taste with friends only."
                                    : "This profile is private."
                                }
                            </Text>
                            <Text style={styles.privateText}>
                                {profile.visibility === "friends_only"
                                    ? "Follow each other to compare taste."
                                    : "No visible ratings yet."
                                }
                            </Text>
                        </View>
                    )}

                    {profile.can_view_taste && !compatLoading && compatibility && (
                        <View style={styles.compatCard} testID="compatibility-card">
                            {compatibility.has_overlap ? (
                                <>
                                    <Text style={styles.compatKicker}>TASTE MATCH</Text>
                                    <View style={styles.compatScoreRow}>
                                        <Text
                                            style={[
                                                styles.compatPercent,
                                                { color: compatibilityAccent(compatibility.similarity_score!) },
                                            ]}
                                        >
                                            {Math.round(compatibility.similarity_score! * 100)}%
                                        </Text>
                                        <DiamondScore
                                            score={compatibility.similarity_score! * 10}
                                            total={10}
                                            size={8}
                                            color={compatibilityAccent(compatibility.similarity_score!)}
                                            testID="compatibility-diamonds"
                                        />
                                    </View>
                                    <Text style={styles.compatText}>
                                        {Math.round(compatibility.similarity_score! * 100)}% taste match · {compatibility.explanation}
                                    </Text>
                                    {compatibility.shared_song_count > 0 && (
                                        <Text style={styles.compatMeta}>
                                            {compatibility.shared_song_count} shared songs
                                        </Text>
                                    )}
                                </>
                            ) : (
                                <Text style={styles.compatTextMuted}>
                                    {compatibility.explanation}
                                </Text>
                            )}
                        </View>
                    )}

                    <View style={styles.tabBar}>
                        <TouchableOpacity
                            style={[styles.tabBtn, activeTab === "profile" && styles.tabBtnActive]}
                            onPress={() => setActiveTab("profile")}
                        >
                            <Text style={[styles.tabText, activeTab === "profile" && styles.tabTextActive]}>
                                Profile
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.tabBtn, activeTab === "taste" && styles.tabBtnActive]}
                            onPress={() => setActiveTab("taste")}
                        >
                            <Text style={[styles.tabText, activeTab === "taste" && styles.tabTextActive]}>
                                Taste
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {activeTab === "profile" && profile.can_view_taste && (
                        <ScrollView
                            style={styles.profilePanel}
                            contentContainerStyle={styles.profilePanelContent}
                        >
                            <RecentVerdictsModule
                                verdicts={verdicts}
                                isLoading={verdicts === null}
                                onItemPress={(item) => {
                                    navigation.navigate("SongDetail", { song: item.song as never })
                                }}
                            />
                            <RankingsPreviewModule
                                rankings={rankingsPreview}
                                isLoading={rankingsPreview === null}
                                onItemPress={(ranking) => navigation.navigate("SongDetail", { ranking })}
                                onViewAll={() => navigation.navigate("UserRankings", { username })}
                            />
                        </ScrollView>
                    )}

                    {activeTab === "taste" && (
                        profile.can_view_taste ? (
                            <TasteTabContent
                                taste={taste}
                                isLoading={tasteLoading}
                                error={tasteError}
                            />
                        ) : (
                            <View style={styles.privateCard}>
                                <Text style={styles.privateTitle}>
                                    {profile.visibility === "friends_only"
                                        ? "This user shares taste with friends only."
                                        : "This profile is private."
                                    }
                                </Text>
                                <Text style={styles.privateText}>
                                    {profile.visibility === "friends_only"
                                        ? "Follow each other to compare taste."
                                        : "No visible ratings yet."
                                    }
                                </Text>
                            </View>
                        )
                    )}
                </>
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
        alignItems: "center",
        paddingHorizontal: 18,
        paddingTop: 60,
        paddingBottom: 16,
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
        marginBottom: 12,
    },
    loader: {
        marginVertical: 24,
    },
    info: {
        alignItems: "center",
        width: "100%",
    },
    displayName: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 28,
        lineHeight: 32,
        marginTop: 12,
        marginBottom: 4,
        textAlign: "center",
    },
    username: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 14,
        marginBottom: 16,
    },
    countCard: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.paper,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.line,
        paddingVertical: 14,
        paddingHorizontal: 8,
        width: "100%",
        marginBottom: 16,
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    countDivider: {
        width: 1,
        height: 36,
        backgroundColor: colors.line,
    },
    countButton: {
        flex: 1,
        alignItems: "center",
        paddingVertical: 4,
    },
    countValue: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 22,
        lineHeight: 26,
        marginBottom: 4,
    },
    countLabel: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 9,
        letterSpacing: 1.4,
    },
    statsCard: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.paper,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.line,
        paddingVertical: 14,
        paddingHorizontal: 8,
        width: "100%",
        marginBottom: 16,
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    statDivider: {
        width: 1,
        height: 36,
        backgroundColor: colors.line,
    },
    statButton: {
        flex: 1,
        alignItems: "center",
        paddingVertical: 4,
    },
    statValue: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 22,
        lineHeight: 26,
        marginBottom: 4,
    },
    statLabel: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 9,
        letterSpacing: 1.4,
    },
    followButton: {
        minWidth: 140,
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 8,
        backgroundColor: colors.clay,
    },
    followingButton: {
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
    },
    followText: {
        fontFamily: fonts.mono,
        color: colors.paper,
        fontSize: 13,
        letterSpacing: 0.4,
    },
    followingText: {
        color: colors.ink,
    },
    actions: {
        alignItems: "center",
        width: "100%",
    },
    actionRow: {
        flexDirection: "row",
        gap: 8,
    },
    blockButton: {
        minWidth: 96,
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 18,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.dislike,
        backgroundColor: colors.paper,
    },
    unblockButton: {
        borderColor: colors.ink,
    },
    blockText: {
        fontFamily: fonts.mono,
        color: colors.dislike,
        fontSize: 13,
        letterSpacing: 0.4,
    },
    unblockText: {
        color: colors.ink,
    },
    reportButton: {
        marginTop: 10,
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    reportButtonText: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 11,
        letterSpacing: 0.6,
    },
    reportSuccess: {
        color: colors.like,
        fontSize: 13,
        marginTop: 8,
        textAlign: "center",
    },
    reportPanel: {
        width: "100%",
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 8,
        marginTop: 12,
        padding: 14,
    },
    reportTitle: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 22,
        lineHeight: 26,
        marginBottom: 10,
    },
    reportLabel: {
        fontFamily: fonts.mono,
        color: colors.ink,
        fontSize: 11,
        letterSpacing: 0.6,
        marginBottom: 8,
    },
    reasonGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        marginBottom: 14,
    },
    reasonButton: {
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 8,
        backgroundColor: colors.bg,
        paddingVertical: 8,
        paddingHorizontal: 10,
    },
    reasonButtonActive: {
        borderColor: colors.ink,
        backgroundColor: colors.ink,
    },
    reasonText: {
        fontFamily: fonts.mono,
        color: colors.ink,
        fontSize: 11,
    },
    reasonTextActive: {
        color: colors.paper,
    },
    reportInput: {
        minHeight: 88,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 8,
        color: colors.ink,
        fontSize: 14,
        lineHeight: 20,
        paddingVertical: 10,
        paddingHorizontal: 12,
        textAlignVertical: "top",
        marginBottom: 10,
    },
    reportError: {
        color: colors.dislike,
        fontSize: 13,
        lineHeight: 18,
        marginBottom: 10,
        textAlign: "center",
    },
    reportActions: {
        flexDirection: "row",
        gap: 10,
    },
    cancelReportButton: {
        alignItems: "center",
        borderWidth: 1,
        borderColor: colors.ink,
        borderRadius: 8,
        flex: 1,
        paddingVertical: 10,
    },
    cancelReportText: {
        fontFamily: fonts.mono,
        color: colors.ink,
        fontSize: 12,
    },
    submitReportButton: {
        alignItems: "center",
        borderRadius: 8,
        backgroundColor: colors.clay,
        flex: 1,
        paddingVertical: 10,
    },
    submitReportButtonDisabled: {
        opacity: 0.45,
    },
    submitReportText: {
        fontFamily: fonts.mono,
        color: colors.paper,
        fontSize: 12,
    },
    error: {
        color: colors.dislike,
        fontSize: 14,
        marginTop: 12,
        textAlign: "center",
    },
    compatCard: {
        marginHorizontal: 16,
        marginBottom: 12,
        paddingVertical: 16,
        paddingHorizontal: 16,
        backgroundColor: colors.paper,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.line,
        alignItems: "center",
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    privateCard: {
        marginHorizontal: 16,
        marginBottom: 12,
        paddingVertical: 16,
        paddingHorizontal: 16,
        backgroundColor: colors.paper,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.line,
    },
    privateTitle: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 20,
        lineHeight: 24,
        marginBottom: 6,
    },
    privateText: {
        color: colors.inkSoft,
        fontSize: 14,
        lineHeight: 20,
    },
    compatKicker: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 10,
        letterSpacing: 1.8,
        marginBottom: 8,
    },
    compatScoreRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginBottom: 8,
    },
    compatPercent: {
        fontFamily: fonts.serif,
        fontSize: 36,
        lineHeight: 40,
    },
    compatText: {
        color: colors.ink,
        fontSize: 13,
        textAlign: "center",
        lineHeight: 20,
    },
    compatTextMuted: {
        color: colors.inkDim,
        fontSize: 13,
        textAlign: "center",
        lineHeight: 20,
    },
    compatMeta: {
        fontFamily: fonts.mono,
        color: colors.inkDim,
        fontSize: 11,
        letterSpacing: 0.4,
        marginTop: 8,
    },
    profilePanel: {
        flex: 1,
    },
    profilePanelContent: {
        paddingHorizontal: 18,
        paddingVertical: 18,
        paddingBottom: 32,
    },
    tabBar: {
        flexDirection: "row",
        borderTopWidth: 1,
        borderTopColor: colors.line,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
        backgroundColor: colors.bg,
    },
    tabBtn: {
        flex: 1,
        paddingVertical: 12,
        alignItems: "center",
    },
    tabBtnActive: {
        borderBottomWidth: 2,
        borderBottomColor: colors.ink,
    },
    tabText: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 12,
        letterSpacing: 0.6,
    },
    tabTextActive: {
        color: colors.ink,
    },
})
