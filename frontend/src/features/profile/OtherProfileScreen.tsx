// OtherProfile — another user's public profile with follow/unfollow, compat card, report.
import { useEffect, useState } from "react"
import {
    ActivityIndicator,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native"
import { NativeStackScreenProps } from "@react-navigation/native-stack"
import Svg, { Path } from "react-native-svg"

import { ApiError } from "../../api/client"
import { RankingAnchorsResponse, RankingResponse } from "../comparison/types"
import { AppStackParamList } from "../../navigation/types"
import { colors, fonts, bucketColor } from "../../theme"
import { useAuth } from "../auth/AuthContext"
import {
    blockUser,
    followUser,
    getCompatibility,
    getProfileAnchors,
    getProfileBookmarks,
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

function compatAccent(score: number): string {
    const pct = Math.round(score * 100)
    if (pct >= 70) return colors.like
    if (pct < 50) return colors.dislike
    return colors.okay
}

function BackIcon() {
    return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"
            stroke={colors.ink} strokeWidth={1.9} strokeLinecap="round">
            <Path d="M15 19 8 12l7-7" />
        </Svg>
    )
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
    const [profileAnchors, setProfileAnchors] = useState<RankingAnchorsResponse | null>(null)

    const openFollowers = () => navigation.navigate("ProfileList", { username, listType: "followers" })
    const openFollowing = () => navigation.navigate("ProfileList", { username, listType: "following" })

    const toggleFollow = async () => {
        if (!token || !profile || profile.is_own_profile || isSaving) return
        setIsSaving(true)
        setProfileError(null)
        try {
            const updated = profile.is_following
                ? await unfollowUser(profile.username, token)
                : await followUser(profile.username, token)
            setProfile(updated)
        } catch (err) {
            if (err instanceof ApiError) setProfileError(err.detail)
            else if (err instanceof Error) setProfileError(err.message)
            else setProfileError("Could not update follow state.")
        } finally {
            setIsSaving(false)
        }
    }

    const toggleBlock = async () => {
        if (!token || !profile || profile.is_own_profile || isSaving) return
        setIsSaving(true)
        setProfileError(null)
        try {
            const updated = profile.is_blocked
                ? await unblockUser(profile.username, token)
                : await blockUser(profile.username, token)
            setProfile(updated)
            setCompatibility(null)
            setTaste(null)
        } catch (err) {
            if (err instanceof ApiError) setProfileError(err.detail)
            else if (err instanceof Error) setProfileError(err.message)
            else setProfileError("Could not update block state.")
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
        if (isReporting) return
        setIsReportOpen(false)
        setReportReason(null)
        setReportDetails("")
        setReportError(null)
    }

    const submitReport = async () => {
        if (!token || !profile || reportReason === null || isReporting) return
        setIsReporting(true)
        setReportError(null)
        try {
            await reportUser(
                profile.username,
                { target_type: "profile", reason: reportReason, details: reportDetails },
                token,
            )
            setReportSuccess(true)
            setIsReportOpen(false)
            setReportReason(null)
            setReportDetails("")
        } catch (err) {
            if (err instanceof ApiError) setReportError(err.detail)
            else if (err instanceof Error) setReportError(err.message)
            else setReportError("Could not submit report.")
        } finally {
            setIsReporting(false)
        }
    }

    useEffect(() => {
        async function fetchProfile() {
            if (!token) return
            setIsLoading(true)
            setProfileError(null)
            try {
                const data = await getProfileByUsername(username, token)
                setProfile(data)
            } catch (err) {
                if (err instanceof ApiError) setProfileError(err.detail)
                else if (err instanceof Error) setProfileError(err.message)
                else setProfileError("Failed to load profile.")
            } finally {
                setIsLoading(false)
            }
        }
        fetchProfile()
    }, [token, username])

    useEffect(() => {
        if (activeTab !== "taste" || !token || !profile || !profile.can_view_taste) return
        async function fetchTaste() {
            if (!token) return
            setTasteLoading(true)
            setTasteError(null)
            try {
                const [tasteData, anchorsData] = await Promise.all([
                    getUserTasteProfile(username, token),
                    getProfileAnchors(username, token),
                ])
                setTaste(tasteData)
                setProfileAnchors(anchorsData)
            } catch (err) {
                if (err instanceof ApiError) setTasteError(err.detail)
                else if (err instanceof Error) setTasteError(err.message)
                else setTasteError("Failed to load taste profile.")
            } finally {
                setTasteLoading(false)
            }
        }
        fetchTaste()
    }, [activeTab, profile, token, username])

    useEffect(() => {
        if (!token || !profile || !profile.can_view_taste) return
        async function fetchCompatibility() {
            if (!token) return
            setCompatLoading(true)
            try {
                const data = await getCompatibility(username, token)
                setCompatibility(data)
            } catch {
                setCompatibility(null)
            } finally {
                setCompatLoading(false)
            }
        }
        fetchCompatibility()
    }, [profile, token, username])

    useEffect(() => {
        if (!token || !profile || !profile.can_view_taste) return
        async function fetchModules() {
            if (!token) return
            try {
                const [vData, rData] = await Promise.all([
                    getProfileRecentVerdicts(username, token),
                    getProfileRankings(username, token),
                ])
                setVerdicts(vData.items)
                setRankingsPreview(rData.rankings.slice(0, 5))
            } catch {
                setVerdicts([])
                setRankingsPreview([])
            }
        }
        fetchModules()
    }, [profile, token, username])

    const profileInitial = profile
        ? (profile.display_name || profile.username).charAt(0).toUpperCase()
        : "?"

    function anchorsUnlocked(t: TasteProfileResponse): boolean {
        return (
            t.bucket_breakdown.like >= 1 &&
            t.bucket_breakdown.okay >= 3 &&
            t.bucket_breakdown.dislike >= 1
        )
    }

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
        >
            {/* Nav bar */}
            <View style={styles.navBar}>
                <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                    <BackIcon />
                </TouchableOpacity>
            </View>

            <View style={styles.header}>
                {isLoading ? (
                    <ActivityIndicator color={colors.accent} style={styles.loader} />
                ) : profile ? (
                    <View style={styles.identity}>
                        <Text style={styles.kicker}>LISTn MEMBER</Text>

                        {/* Avatar */}
                        <View style={styles.avatar} testID="other-profile-star-avatar">
                            <Text style={styles.avatarLetter}>{profileInitial}</Text>
                        </View>

                        <Text style={styles.displayName}>{profile.display_name}</Text>
                        <Text style={styles.username}>@{profile.username}</Text>

                        {/* Social counts */}
                        <View style={styles.paperCard}>
                            <TouchableOpacity style={styles.statBtn} onPress={openFollowers}>
                                <Text style={styles.statNum}>{profile.follower_count}</Text>
                                <Text style={styles.statLbl}>FOLLOWERS</Text>
                            </TouchableOpacity>
                            <View style={styles.statDivider} />
                            <TouchableOpacity style={styles.statBtn} onPress={openFollowing}>
                                <Text style={styles.statNum}>{profile.following_count}</Text>
                                <Text style={styles.statLbl}>FOLLOWING</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Rated / Bookmarks */}
                        {profile.user_stats && (
                            <View style={styles.paperCard} testID="other-profile-stats">
                                <TouchableOpacity
                                    style={styles.statBtn}
                                    onPress={() => navigation.navigate("UserRankings", { username })}
                                    testID="stats-rated"
                                >
                                    <Text style={styles.statNum}>{profile.user_stats.rated_count}</Text>
                                    <Text style={styles.statLbl}>RATED</Text>
                                </TouchableOpacity>
                                <View style={styles.statDivider} />
                                <TouchableOpacity
                                    style={styles.statBtn}
                                    onPress={() => navigation.navigate("UserBookmarks", { username })}
                                    testID="stats-bookmarked"
                                >
                                    <Text style={styles.statNum}>{profile.user_stats.bookmarked_count}</Text>
                                    <Text style={styles.statLbl}>BOOKMARKS</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* Follow / Block / Report */}
                        {!profile.is_own_profile && (
                            <View style={styles.actions}>
                                <View style={styles.actionRow}>
                                    <TouchableOpacity
                                        style={[
                                            styles.followBtn,
                                            profile.is_following && styles.followingBtn,
                                        ]}
                                        onPress={toggleFollow}
                                        disabled={isSaving}
                                    >
                                        <Text style={[
                                            styles.followText,
                                            profile.is_following && styles.followingText,
                                        ]}>
                                            {isSaving ? "Saving..." : profile.is_following ? "Following" : "Follow"}
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.blockBtn, profile.is_blocked && styles.unblockBtn]}
                                        onPress={toggleBlock}
                                        disabled={isSaving}
                                    >
                                        <Text style={[styles.blockText, profile.is_blocked && styles.unblockText]}>
                                            {profile.is_blocked ? "Unblock" : "Block"}
                                        </Text>
                                    </TouchableOpacity>
                                </View>

                                <TouchableOpacity
                                    style={styles.reportLinkBtn}
                                    onPress={openReport}
                                    disabled={isReporting}
                                >
                                    <Text style={styles.reportLinkText}>Report user</Text>
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
                                                        styles.reasonBtn,
                                                        reportReason === reason.value && styles.reasonBtnActive,
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
                                                style={styles.cancelBtn}
                                                onPress={closeReport}
                                                disabled={isReporting}
                                            >
                                                <Text style={styles.cancelText}>Cancel</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                accessibilityState={{ disabled: reportReason === null || isReporting }}
                                                style={[
                                                    styles.submitBtn,
                                                    (reportReason === null || isReporting) && styles.submitBtnDisabled,
                                                ]}
                                                onPress={submitReport}
                                                disabled={reportReason === null || isReporting}
                                            >
                                                <Text style={styles.submitText}>
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

                {profileError !== null && profile !== null && (
                    <Text style={styles.error}>{profileError}</Text>
                )}

                {/* Private / locked state */}
                {profile && !profile.can_view_taste && (
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

                {/* Compatibility card */}
                {profile && profile.can_view_taste && !compatLoading && compatibility && (
                    <View style={styles.compatCard} testID="compatibility-card">
                        {compatibility.has_overlap ? (
                            <>
                                <Text style={styles.compatKicker}>TASTE COMPATIBILITY</Text>
                                <Text style={[
                                    styles.compatPercent,
                                    { color: compatAccent(compatibility.similarity_score!) },
                                ]}>
                                    {Math.round(compatibility.similarity_score! * 100)}%
                                </Text>
                                <Text style={styles.compatText}>
                                    {Math.round(compatibility.similarity_score! * 100)}% match · {compatibility.explanation}
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
            </View>

            {/* Segmented tab toggle */}
            {profile && (
                <View style={styles.tabToggleWrap}>
                    <View style={styles.tabToggle}>
                        {(["profile", "taste"] as ProfileTab[]).map((tab) => (
                            <TouchableOpacity
                                key={tab}
                                style={[styles.tabPill, activeTab === tab && styles.tabPillActive]}
                                onPress={() => setActiveTab(tab)}
                            >
                                <Text style={[styles.tabPillText, activeTab === tab && styles.tabPillTextActive]}>
                                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            )}

            {/* Tab content */}
            <View style={styles.tabContent}>
                {profile && activeTab === "profile" && profile.can_view_taste && (
                    <View style={styles.profilePanel}>
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
                    </View>
                )}
                {profile && activeTab === "taste" && (
                    profile.can_view_taste ? (
                        <>
                            <TasteTabContent
                                taste={taste}
                                isLoading={tasteLoading}
                                error={tasteError}
                            />
                            {taste && profileAnchors && anchorsUnlocked(taste) && (
                                <View style={styles.otherAnchorsWrap} testID="other-profile-anchors">
                                    <Text style={styles.otherAnchorsKicker}>TASTE ANCHORS</Text>
                                    <View style={styles.otherAnchorGrid}>
                                        {([
                                            { key: "top_like" as const, label: "TOP · LIKE", bucketKey: "like" as const },
                                            { key: "median_okay" as const, label: "MEDIAN · OKAY", bucketKey: "alright" as const },
                                            { key: "lowest_dislike" as const, label: "FLOOR · DISLIKE", bucketKey: "dislike" as const },
                                        ]).map(({ key, label, bucketKey }) => {
                                            const anchor = profileAnchors[key]
                                            const color = bucketColor(bucketKey)
                                            return (
                                                <View key={key} style={styles.otherAnchorItem}>
                                                    <View style={styles.otherAnchorCard}>
                                                        <View style={[styles.otherAnchorTopBar, { backgroundColor: color }]} />
                                                        <View style={styles.otherAnchorBody}>
                                                            <Text style={[styles.otherAnchorLabel, { color }]} numberOfLines={1}>
                                                                {label}
                                                            </Text>
                                                            {anchor ? (
                                                                <>
                                                                    <View style={styles.otherAnchorCover}>
                                                                        {anchor.song.cover_url ? (
                                                                            <Image
                                                                                source={{ uri: anchor.song.cover_url }}
                                                                                style={styles.otherAnchorCoverImg}
                                                                            />
                                                                        ) : null}
                                                                    </View>
                                                                    <Text style={styles.otherAnchorTitle} numberOfLines={1}>
                                                                        {anchor.song.title}
                                                                    </Text>
                                                                    <Text style={[styles.otherAnchorScore, { color }]}>
                                                                        {anchor.score.toFixed(1)}
                                                                    </Text>
                                                                </>
                                                            ) : null}
                                                        </View>
                                                    </View>
                                                </View>
                                            )
                                        })}
                                    </View>
                                </View>
                            )}
                        </>
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
            </View>
        </ScrollView>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.bg,
    },
    contentContainer: {
        flexGrow: 1,
        paddingBottom: 32,
    },
    // ── Nav bar ───────────────────────────────────────────────────────
    navBar: {
        paddingTop: 54,
        paddingHorizontal: 14,
        paddingBottom: 4,
    },
    backBtn: {
        width: 32,
        height: 32,
        borderRadius: 9,
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        alignItems: "center",
        justifyContent: "center",
    },
    // ── Header ────────────────────────────────────────────────────────
    header: {
        paddingHorizontal: 16,
        paddingBottom: 8,
    },
    loader: {
        marginVertical: 24,
    },
    kicker: {
        fontFamily: fonts.mono,
        color: colors.inkDim,
        fontSize: 8.5,
        letterSpacing: 2,
        fontWeight: "700",
        marginBottom: 12,
        textAlign: "center",
    },
    // ── Identity block ────────────────────────────────────────────────
    identity: {
        alignItems: "center",
        width: "100%",
    },
    avatar: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: colors.inkSoft,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 12,
    },
    avatarLetter: {
        fontFamily: fonts.display,
        fontSize: 26,
        color: "#fff",
        lineHeight: 30,
    },
    displayName: {
        fontFamily: fonts.display,
        fontSize: 24,
        letterSpacing: -0.4,
        lineHeight: 26,
        color: colors.ink,
        marginBottom: 4,
        textAlign: "center",
    },
    username: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 13,
        letterSpacing: 0.3,
        marginBottom: 16,
    },
    // ── Paper stat cards ──────────────────────────────────────────────
    paperCard: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.paper,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.line,
        paddingVertical: 14,
        paddingHorizontal: 8,
        width: "100%",
        marginBottom: 10,
        shadowColor: colors.ink,
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
    },
    statDivider: {
        width: 1,
        height: 36,
        backgroundColor: colors.line,
    },
    statBtn: {
        flex: 1,
        alignItems: "center",
        paddingVertical: 4,
    },
    statNum: {
        fontFamily: fonts.display,
        fontSize: 22,
        letterSpacing: -0.3,
        lineHeight: 26,
        color: colors.ink,
        marginBottom: 3,
    },
    statLbl: {
        fontFamily: fonts.mono,
        color: colors.inkDim,
        fontSize: 8.5,
        letterSpacing: 1.4,
    },
    // ── Follow / Block actions ────────────────────────────────────────
    actions: {
        alignItems: "center",
        width: "100%",
        marginTop: 2,
    },
    actionRow: {
        flexDirection: "row",
        gap: 8,
        width: "100%",
        marginBottom: 8,
    },
    followBtn: {
        flex: 1,
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 13,
        backgroundColor: colors.accent,
        shadowColor: colors.accent,
        shadowOpacity: 0.25,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
    },
    followingBtn: {
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        shadowOpacity: 0,
    },
    followText: {
        fontWeight: "700",
        fontSize: 13,
        color: "#fff",
        letterSpacing: 0.2,
    },
    followingText: {
        color: colors.ink,
    },
    blockBtn: {
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 13,
        borderWidth: 1.5,
        borderColor: colors.danger,
        backgroundColor: "transparent",
    },
    unblockBtn: {
        borderColor: colors.line,
    },
    blockText: {
        fontWeight: "600",
        fontSize: 13,
        color: colors.danger,
    },
    unblockText: {
        color: colors.ink,
    },
    reportLinkBtn: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        marginBottom: 6,
    },
    reportLinkText: {
        fontFamily: fonts.mono,
        color: colors.inkDim,
        fontSize: 11,
        letterSpacing: 0.6,
    },
    reportSuccess: {
        color: colors.mint,
        fontFamily: fonts.mono,
        fontSize: 12,
        textAlign: "center",
        marginTop: 4,
    },
    // ── Report panel ──────────────────────────────────────────────────
    reportPanel: {
        width: "100%",
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 16,
        marginTop: 8,
        padding: 14,
    },
    reportTitle: {
        fontFamily: fonts.display,
        fontSize: 18,
        color: colors.ink,
        marginBottom: 10,
    },
    reportLabel: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 10,
        letterSpacing: 0.8,
        marginBottom: 8,
    },
    reasonGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        marginBottom: 14,
    },
    reasonBtn: {
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 999,
        backgroundColor: colors.bg,
        paddingVertical: 7,
        paddingHorizontal: 12,
    },
    reasonBtnActive: {
        borderColor: colors.ink,
        backgroundColor: colors.ink,
    },
    reasonText: {
        fontWeight: "600",
        fontSize: 12,
        color: colors.ink,
    },
    reasonTextActive: {
        color: "#fff",
    },
    reportInput: {
        minHeight: 88,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 13,
        color: colors.ink,
        fontSize: 14,
        lineHeight: 20,
        paddingVertical: 10,
        paddingHorizontal: 12,
        textAlignVertical: "top",
        marginBottom: 10,
        backgroundColor: colors.bg,
    },
    reportError: {
        color: colors.danger,
        fontSize: 13,
        lineHeight: 18,
        marginBottom: 10,
        textAlign: "center",
    },
    reportActions: {
        flexDirection: "row",
        gap: 10,
    },
    cancelBtn: {
        alignItems: "center",
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 13,
        flex: 1,
        paddingVertical: 10,
    },
    cancelText: {
        fontWeight: "600",
        fontSize: 13,
        color: colors.ink,
    },
    submitBtn: {
        alignItems: "center",
        borderRadius: 13,
        backgroundColor: colors.accent,
        flex: 1,
        paddingVertical: 10,
    },
    submitBtnDisabled: {
        opacity: 0.45,
    },
    submitText: {
        fontWeight: "700",
        fontSize: 13,
        color: "#fff",
    },
    error: {
        color: colors.danger,
        fontSize: 14,
        marginTop: 12,
        textAlign: "center",
    },
    // ── Private card ──────────────────────────────────────────────────
    privateCard: {
        marginBottom: 12,
        paddingVertical: 16,
        paddingHorizontal: 16,
        backgroundColor: colors.paper,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.line,
    },
    privateTitle: {
        fontWeight: "700",
        fontSize: 15,
        color: colors.ink,
        marginBottom: 6,
        lineHeight: 20,
    },
    privateText: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 12,
        lineHeight: 18,
        letterSpacing: 0.2,
    },
    // ── Compatibility card ────────────────────────────────────────────
    compatCard: {
        marginBottom: 12,
        paddingVertical: 16,
        paddingHorizontal: 16,
        backgroundColor: colors.paper,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.line,
        alignItems: "center",
        shadowColor: colors.ink,
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
    },
    compatKicker: {
        fontFamily: fonts.mono,
        color: colors.inkDim,
        fontSize: 9,
        letterSpacing: 2,
        fontWeight: "700",
        marginBottom: 6,
    },
    compatPercent: {
        fontFamily: fonts.display,
        fontSize: 40,
        letterSpacing: -1,
        lineHeight: 44,
        marginBottom: 8,
    },
    compatText: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 11,
        textAlign: "center",
        lineHeight: 17,
        letterSpacing: 0.2,
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
        fontSize: 10,
        letterSpacing: 0.4,
        marginTop: 8,
    },
    // ── Segmented tab toggle ──────────────────────────────────────────
    tabToggleWrap: {
        paddingHorizontal: 16,
        paddingBottom: 4,
        paddingTop: 8,
    },
    tabToggle: {
        flexDirection: "row",
        backgroundColor: colors.bg,
        borderRadius: 999,
        padding: 4,
        gap: 4,
        borderWidth: 1,
        borderColor: colors.line,
    },
    tabPill: {
        flex: 1,
        paddingVertical: 9,
        borderRadius: 999,
        alignItems: "center",
    },
    tabPillActive: {
        backgroundColor: colors.ink,
    },
    tabPillText: {
        fontWeight: "600",
        fontSize: 12,
        color: colors.inkSoft,
    },
    tabPillTextActive: {
        color: "#fff",
    },
    // ── Tab content ───────────────────────────────────────────────────
    tabContent: {
        paddingBottom: 32,
    },
    profilePanel: {
        paddingHorizontal: 14,
        paddingTop: 14,
    },
    // ── Other profile anchors ─────────────────────────────────────────
    otherAnchorsWrap: {
        paddingHorizontal: 14,
        paddingTop: 4,
        paddingBottom: 14,
    },
    otherAnchorsKicker: {
        fontFamily: fonts.mono,
        fontSize: 9,
        letterSpacing: 1.6,
        color: colors.inkDim,
        fontWeight: "700",
        marginBottom: 9,
        paddingHorizontal: 2,
    },
    otherAnchorGrid: {
        flexDirection: "row",
        gap: 8,
    },
    otherAnchorItem: {
        flex: 1,
        minWidth: 0,
    },
    otherAnchorCard: {
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 12,
        overflow: "hidden",
        shadowColor: colors.ink,
        shadowOpacity: 0.04,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
    },
    otherAnchorTopBar: {
        height: 4,
    },
    otherAnchorBody: {
        padding: 9,
    },
    otherAnchorLabel: {
        fontFamily: fonts.mono,
        fontSize: 6.5,
        letterSpacing: 0.9,
        fontWeight: "700",
        marginBottom: 7,
    },
    otherAnchorCover: {
        width: "100%",
        aspectRatio: 1,
        borderRadius: 7,
        overflow: "hidden",
        backgroundColor: colors.paper2,
        marginBottom: 6,
    },
    otherAnchorCoverImg: { width: "100%", height: "100%" },
    otherAnchorTitle: {
        fontWeight: "700",
        fontSize: 11,
        color: colors.ink,
        lineHeight: 13,
        marginBottom: 4,
    },
    otherAnchorScore: {
        fontFamily: fonts.display,
        fontSize: 17,
        letterSpacing: -0.4,
    },
})
