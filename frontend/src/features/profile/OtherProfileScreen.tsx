// OtherProfile — another user's profile per the Bento Orbit design: identity card
// mirroring the You profile (no inline buttons), Follow + To LISTn side by side,
// Compatibility + Top Artist tiles, Their Top Songs (uniform rows), Top Genres,
// their Auxstrology signature, and Recent Ratings. Report/block live under the
// nav flag button; privacy states are kept.
import { Fragment, useEffect, useState } from "react"
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
import Svg, { Circle, Line, Path } from "react-native-svg"

import { ApiError } from "../../api/client"
import { RankingResponse } from "../comparison/types"
import { AppStackParamList } from "../../navigation/types"
import { avatarColorToken, bucketColor, colors, fonts } from "../../theme"
import { useAuth } from "../auth/AuthContext"
import {
    blockUser,
    followUser,
    getCompatibility,
    getProfileByUsername,
    getProfileRankings,
    getProfileRecentRatings,
    getUserAuxstrology,
    getUserTasteProfile,
    reportUser,
    unblockUser,
    unfollowUser,
} from "./apiRequests"
import {
    AuxstrologyResponse, CompatibilityResponse, Profile, RecentRatingItem, ReportReason,
    TasteProfileResponse,
} from "./types"
import RecentRatingsModule from "./RecentRatingsModule"
import { StreakBadge } from "./StreakBadge"

type OtherProfileProps = NativeStackScreenProps<AppStackParamList, "OtherProfile">

const REPORT_REASONS: readonly { value: ReportReason; label: string }[] = [
    { value: "harassment", label: "Harassment" },
    { value: "hate_or_abuse", label: "Hate or abuse" },
    { value: "impersonation", label: "Impersonation" },
    { value: "inappropriate_content", label: "Inappropriate content" },
    { value: "spam", label: "Spam" },
    { value: "under_13", label: "Under 13" },
    { value: "other", label: "Other" },
]

// Deterministic avatar background per user, matching follow lists and search.
const AVATAR_COLORS = [colors.accent, colors.sky, colors.plum, colors.mint, colors.gold]

function avatarColor(username: string): string {
    let hash = 0
    for (let i = 0; i < username.length; i++) {
        hash = (hash * 31 + username.charCodeAt(i)) % 997
    }
    return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

// Constellation nodes + edges for the Auxstrology SVG (gold, in 80×80 viewBox)
const CONST_NODES: [number, number][] = [
    [18, 58], [36, 22], [52, 42], [68, 18], [62, 52], [30, 46], [52, 8],
]
const CONST_EDGES: [number, number][] = [[0, 1], [1, 2], [2, 3], [2, 4], [0, 4], [1, 5], [3, 6]]

// Star dot positions for the dark navy card backdrop (in 0–100 viewBox space)
const STAR_DOTS = Array.from({ length: 20 }, (_, i) => ({
    key: i,
    x: ((i * 37 + 13) * 941) % 100,
    y: ((i * 53 + 7) * 613) % 100,
    r: i % 3 === 0 ? 1 : 0.6,
    op: 0.2 + (i % 4) * 0.08,
}))

const GENRE_COLORS = [colors.accent, colors.plum, colors.mint]

function BackIcon() {
    return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"
            stroke={colors.ink} strokeWidth={1.9} strokeLinecap="round">
            <Path d="M15 19 8 12l7-7" />
        </Svg>
    )
}

function FlagIcon() {
    return (
        <Svg width={15} height={15} viewBox="0 0 24 24" fill="none"
            stroke={colors.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
            <Line x1={4} y1={22} x2={4} y2={15} />
        </Svg>
    )
}

function BlockIcon({ color = colors.ink }: { color?: string }) {
    return (
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none"
            stroke={color} strokeWidth={2} strokeLinecap="round">
            <Circle cx={12} cy={12} r={9} />
            <Line x1={5.6} y1={5.6} x2={18.4} y2={18.4} />
        </Svg>
    )
}

function BookmarkIcon() {
    return (
        <Svg width={16} height={16} viewBox="0 0 24 24">
            <Path
                d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"
                fill="#c8c2b4"
                stroke={colors.ink}
                strokeWidth="2"
                strokeLinejoin="round"
            />
        </Svg>
    )
}

function ChevronIcon() {
    return (
        <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
            <Path d="M9 18l6-6-6-6" stroke={colors.inkDim} strokeWidth="2" strokeLinecap="round" />
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
    const [aux, setAux] = useState<AuxstrologyResponse | null>(null)
    const [compatibility, setCompatibility] = useState<CompatibilityResponse | null>(null)
    const [compatLoading, setCompatLoading] = useState(false)
    const [isReportOpen, setIsReportOpen] = useState(false)
    const [reportReason, setReportReason] = useState<ReportReason | null>(null)
    const [reportDetails, setReportDetails] = useState("")
    const [isReporting, setIsReporting] = useState(false)
    const [reportError, setReportError] = useState<string | null>(null)
    const [reportSuccess, setReportSuccess] = useState(false)
    const [ratings, setRatings] = useState<RecentRatingItem[] | null>(null)
    const [topSongs, setTopSongs] = useState<RankingResponse[] | null>(null)

    const openFollowers = () => navigation.navigate("ProfileList", { username, listType: "followers" })
    const openFollowing = () => navigation.navigate("ProfileList", { username, listType: "following" })
    const openActivityLikers = (ratingEventId: number) => {
        navigation.navigate("ActivityLikers", { ratingEventId })
    }

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
            setAux(null)
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

    // Gate the taste-dependent sections on whether we can view this user's taste,
    // not on the whole profile object. Following/unfollowing replaces `profile`
    // but does not change their taste data; depending on `profile` here would
    // refetch (and flicker) every section on each follow toggle. `can_view_taste`
    // is the only profile field that should re-trigger these — e.g. when a
    // friends-only profile becomes viewable after a mutual follow.
    const canViewTaste = profile?.can_view_taste ?? false

    useEffect(() => {
        if (!token || !canViewTaste) return
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
    }, [canViewTaste, token, username])

    useEffect(() => {
        if (!token || !canViewTaste) return
        async function fetchTasteSections() {
            if (!token) return
            try {
                const [tasteData, vData, rData] = await Promise.all([
                    getUserTasteProfile(username, token),
                    getProfileRecentRatings(username, token),
                    getProfileRankings(username, token),
                ])
                setTaste(tasteData)
                setRatings(vData.items)
                setTopSongs(rData.rankings.slice(0, 3))
            } catch {
                setRatings([])
                setTopSongs([])
            }
        }
        async function fetchAuxstrology() {
            if (!token) return
            try {
                const data = await getUserAuxstrology(username, token)
                setAux(data)
            } catch {
                // non-critical — the Auxstrology card simply doesn't render
            }
        }
        fetchTasteSections()
        fetchAuxstrology()
    }, [canViewTaste, token, username])

    const profileInitial = profile
        ? (profile.display_name || profile.username).charAt(0).toUpperCase()
        : "?"

    // Streak rides on the taste-gated user_stats, so the badge only appears when
    // this viewer can see the profile's taste and there is an active streak.
    const streakWeeks = profile?.user_stats?.current_streak ?? 0

    const topArtist = taste && taste.overall.top_artists.length > 0
        ? taste.overall.top_artists[0]
        : null
    const topGenres = taste ? taste.overall.genres.slice(0, 3) : []
    const maxGenrePct = topGenres.length > 0 ? Math.max(...topGenres.map((g) => g.percentage)) : 0

    const auxActive = aux !== null && aux.status === "active" && aux.sign !== null

    const sectionLabel = (label: string, right?: { label: string; onPress: () => void }) => (
        <View style={styles.sectionLabelRow}>
            <Text style={styles.sectionLabelText}>{label}</Text>
            {right && (
                <TouchableOpacity onPress={right.onPress}>
                    <Text style={styles.sectionLabelLink}>{right.label}</Text>
                </TouchableOpacity>
            )}
        </View>
    )

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
        >
            {/* Nav bar: back + report flag (report/block both live here) */}
            <View style={styles.navBar}>
                <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()} accessibilityLabel="Back">
                    <BackIcon />
                </TouchableOpacity>
                {profile && !profile.is_own_profile && (
                    <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={openReport}
                        disabled={isReporting}
                        accessibilityLabel="Report user"
                    >
                        <FlagIcon />
                    </TouchableOpacity>
                )}
            </View>

            <View style={styles.body}>
                {isLoading ? (
                    <ActivityIndicator color={colors.accent} style={styles.loader} />
                ) : profile ? (
                    <>
                        {/* Identity card — mirrors the You profile exactly */}
                        <View style={styles.identityCard}>
                            {profile.user_stats && (
                                <StreakBadge weeks={streakWeeks} name={profile.display_name || profile.username} />
                            )}
                            <View style={styles.identityRow}>
                                <View
                                    style={[
                                        styles.bust,
                                        { backgroundColor: avatarColorToken(profile.avatar_color, avatarColor(profile.username)) },
                                    ]}
                                    testID="other-profile-star-avatar"
                                >
                                    <Text style={styles.bustLetter}>{profileInitial}</Text>
                                </View>
                                <View style={[styles.identityText, profile.user_stats && styles.identityTextWithBadge]}>
                                    <Text style={styles.displayName} numberOfLines={1}>{profile.display_name}</Text>
                                    <Text style={styles.username} numberOfLines={1}>
                                        @{profile.username}
                                        {profile.is_followed_by && !profile.is_own_profile
                                            ? (profile.is_following ? " · FRIENDS" : " · FOLLOWS YOU")
                                            : ""}
                                    </Text>
                                    <View style={styles.statsRow} testID="other-profile-stats">
                                        {([
                                            ...(profile.user_stats
                                                ? [[profile.user_stats.rated_count, "rated",
                                                    () => navigation.navigate("UserRankings", { username }),
                                                    "stats-rated"]]
                                                : []),
                                            [profile.follower_count, "followers", openFollowers, undefined],
                                            [profile.following_count, "following", openFollowing, undefined],
                                        ] as [number, string, () => void, string | undefined][]).map(([val, label, onPress, tid], i) => (
                                            <Fragment key={label}>
                                                {i > 0 && <View style={styles.statDivider} />}
                                                <TouchableOpacity style={styles.statItem} onPress={onPress} testID={tid}>
                                                    <Text style={styles.statNum}>{val}</Text>
                                                    <Text style={styles.statLbl}>{label}</Text>
                                                </TouchableOpacity>
                                            </Fragment>
                                        ))}
                                    </View>
                                </View>
                            </View>
                        </View>

                        {/* Follow + their To LISTn, side by side below the card. The flex:1
                            lives on two empty column wrappers (exactly like the Compatibility /
                            Top Artist tile grid below), so the 50/50 split is independent of each
                            button's content and lines up edge-for-edge with the tiles. Each button
                            fills its column at width 100%. The Follow button's 3px hard shadow sits
                            inside the gap and never reaches the To LISTn button. */}
                        {!profile.is_own_profile && (
                            <View style={styles.actionRow}>
                                <View style={styles.actionCol}>
                                    <TouchableOpacity
                                        style={[styles.followBtn, profile.is_following && styles.followingBtn]}
                                        onPress={toggleFollow}
                                        disabled={isSaving}
                                    >
                                        <Text style={[styles.followText, profile.is_following && styles.followingText]}>
                                            {isSaving ? "Saving..." : profile.is_following ? "Following" : "Follow"}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                                <View style={styles.actionCol}>
                                    <TouchableOpacity
                                        style={styles.toListnBtn}
                                        onPress={() => navigation.navigate("UserBookmarks", { username })}
                                        testID="stats-bookmarked"
                                    >
                                        <BookmarkIcon />
                                        <Text style={styles.toListnTitle}>To LISTn</Text>
                                        {profile.user_stats && (
                                            <Text style={styles.toListnCount}>{profile.user_stats.bookmarked_count}</Text>
                                        )}
                                        <View style={{ flex: 1 }} />
                                        <ChevronIcon />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}

                        {profileError !== null && (
                            <Text style={styles.error}>{profileError}</Text>
                        )}
                        {reportSuccess && (
                            <Text style={styles.reportSuccess}>Thanks. We'll review this report.</Text>
                        )}

                        {/* Report panel — also carries the block action */}
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
                                <TouchableOpacity
                                    style={styles.blockRow}
                                    onPress={toggleBlock}
                                    disabled={isSaving}
                                    accessibilityLabel={profile.is_blocked ? "Unblock" : "Block"}
                                >
                                    <BlockIcon color={colors.danger} />
                                    <Text style={styles.blockRowText}>
                                        {profile.is_blocked ? `Unblock @${profile.username}` : `Block @${profile.username}`}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* Private / locked state */}
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

                        {/* Compatibility + Top Artist tiles */}
                        {profile.can_view_taste && !compatLoading && compatibility && (
                            <View style={styles.tileGrid}>
                                <View style={styles.compatTile} testID="compatibility-card">
                                    <View style={styles.compatPill}>
                                        <Text style={styles.compatPillText}>Compatibility</Text>
                                    </View>
                                    {compatibility.has_overlap ? (
                                        <>
                                            <View style={styles.compatPctRow}>
                                                <Text
                                                    style={styles.compatPct}
                                                    numberOfLines={1}
                                                    adjustsFontSizeToFit
                                                >
                                                    {Math.round(compatibility.similarity_score! * 100)}%
                                                </Text>
                                                <Text style={styles.compatAligned} numberOfLines={1}>ALIGNED</Text>
                                            </View>
                                            <View style={{ flex: 1 }} />
                                            <Text style={styles.compatMeta}>
                                                FROM {compatibility.shared_song_count} SHARED RATINGS
                                            </Text>
                                        </>
                                    ) : (
                                        <Text style={styles.compatMuted}>{compatibility.explanation}</Text>
                                    )}
                                </View>
                                <View style={styles.artistTile}>
                                    <Text style={styles.artistTileLabel}>TOP ARTIST</Text>
                                    {topArtist ? (
                                        <>
                                            <View style={styles.artistRow}>
                                                <View style={styles.artistDisc}>
                                                    <Text style={styles.artistDiscLetter}>
                                                        {topArtist.name.charAt(0).toUpperCase()}
                                                    </Text>
                                                </View>
                                                <View style={{ flex: 1, minWidth: 0 }}>
                                                    <Text style={styles.artistName} numberOfLines={1}>{topArtist.name}</Text>
                                                    <Text style={styles.artistCount}>
                                                        {topArtist.count} {topArtist.count === 1 ? "SONG" : "SONGS"}
                                                    </Text>
                                                </View>
                                            </View>
                                            <View style={{ flex: 1 }} />
                                            {taste && (
                                                <Text style={styles.artistMeta}>OF {taste.total_rated} SONGS RATED</Text>
                                            )}
                                        </>
                                    ) : (
                                        <Text style={styles.artistEmpty}>Not enough ratings yet</Text>
                                    )}
                                </View>
                            </View>
                        )}

                        {/* Their top songs — three uniform rows, no emphasis */}
                        {profile.can_view_taste && topSongs !== null && topSongs.length > 0 && (
                            <>
                                {sectionLabel("THEIR TOP SONGS", {
                                    label: "VIEW ALL →",
                                    onPress: () => navigation.navigate("UserRankings", { username }),
                                })}
                                <View style={styles.topSongsCard}>
                                    {topSongs.map((ranking, i) => (
                                        <TouchableOpacity
                                            key={ranking.song.id}
                                            style={[styles.songRow, i > 0 && styles.songRowBorder]}
                                            onPress={() => navigation.navigate("SongDetail", { ranking })}
                                            activeOpacity={0.75}
                                        >
                                            <Text style={styles.songRank}>{i + 1}</Text>
                                            <View style={styles.songCover}>
                                                {ranking.song.cover_url ? (
                                                    <Image source={{ uri: ranking.song.cover_url }} style={styles.coverImg} />
                                                ) : null}
                                            </View>
                                            <View style={{ flex: 1, minWidth: 0 }}>
                                                <Text style={styles.songTitle} numberOfLines={1}>{ranking.song.title}</Text>
                                                <Text style={styles.songArtist} numberOfLines={1}>
                                                    {ranking.song.artist.toUpperCase()}
                                                </Text>
                                            </View>
                                            <Text style={[styles.songScore, { color: bucketColor(ranking.bucket) }]}>
                                                {ranking.score.toFixed(1)}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </>
                        )}

                        {/* Top genres */}
                        {profile.can_view_taste && topGenres.length > 0 && (
                            <>
                                {sectionLabel("TOP GENRES")}
                                <View style={styles.genresCard}>
                                    {topGenres.map((genre, i) => {
                                        const color = GENRE_COLORS[i] ?? colors.accent
                                        return (
                                            <View key={genre.name} style={styles.genreRow}>
                                                <Text style={styles.genreName} numberOfLines={1}>{genre.name}</Text>
                                                <View style={styles.genreBarTrack}>
                                                    <View
                                                        style={[
                                                            styles.genreBarFill,
                                                            {
                                                                width: `${maxGenrePct > 0 ? (genre.percentage / maxGenrePct) * 100 : 0}%`,
                                                                backgroundColor: color,
                                                            },
                                                        ]}
                                                    />
                                                </View>
                                                <Text style={[styles.genrePct, { color }]}>
                                                    {Math.round(genre.percentage)}%
                                                </Text>
                                            </View>
                                        )
                                    })}
                                </View>
                            </>
                        )}

                        {/* Auxstrology — their taste signature */}
                        {profile.can_view_taste && auxActive && (
                            <View style={styles.auxCard} testID="other-profile-auxstrology">
                                <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
                                    <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
                                        {STAR_DOTS.map((s) => (
                                            <Circle key={s.key} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={s.op * 0.8} />
                                        ))}
                                    </Svg>
                                </View>
                                <View style={styles.auxInner}>
                                    <View style={styles.auxTextBlock}>
                                        <View style={styles.auxPill}>
                                            <Text style={styles.auxPillText}>AUXSTROLOGY</Text>
                                        </View>
                                        <Text style={styles.auxTitle}>
                                            {aux!.sign!.name.replace(/^The /, "The\n")}
                                        </Text>
                                        <Text style={styles.auxBody}>
                                            {aux!.caption ?? aux!.sign!.summary}
                                        </Text>
                                    </View>
                                    <Svg width={72} height={72} viewBox="0 0 80 80" opacity={0.9}>
                                        {CONST_EDGES.map(([a, b], i) => (
                                            <Line
                                                key={i}
                                                x1={CONST_NODES[a][0]}
                                                y1={CONST_NODES[a][1]}
                                                x2={CONST_NODES[b][0]}
                                                y2={CONST_NODES[b][1]}
                                                stroke={colors.gold}
                                                strokeWidth={0.9}
                                                opacity={0.55}
                                            />
                                        ))}
                                        {CONST_NODES.map(([x, y], i) => (
                                            <Circle
                                                key={i}
                                                cx={x}
                                                cy={y}
                                                r={i === 1 ? 3 : 2}
                                                fill={colors.gold}
                                                opacity={0.9}
                                            />
                                        ))}
                                    </Svg>
                                </View>
                            </View>
                        )}

                        {/* Recent ratings — their freshest written takes */}
                        {profile.can_view_taste && ratings !== null && ratings.length > 0 && (
                            <View style={styles.ratingsWrap}>
                                <RecentRatingsModule
                                    ratings={ratings}
                                    isLoading={false}
                                    title="Recent Ratings"
                                    onItemPress={(item) => {
                                        navigation.navigate("SongDetail", { song: item.song as never })
                                    }}
                                    onOpenLikers={openActivityLikers}
                                />
                            </View>
                        )}
                    </>
                ) : (
                    <Text style={styles.error}>{profileError ?? "Profile not found."}</Text>
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
        paddingBottom: 96,
    },
    navBar: {
        paddingTop: 54,
        paddingHorizontal: 14,
        paddingBottom: 8,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
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
        paddingHorizontal: 14,
    },
    loader: {
        marginVertical: 24,
    },
    // ── Identity card (mirrors the You profile) ─────────────────────
    identityCard: {
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 16,
        padding: 14,
    },
    identityRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 13,
    },
    bust: {
        width: 50,
        height: 50,
        borderRadius: 25,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    bustLetter: {
        fontFamily: fonts.display,
        fontSize: 21,
        color: "#fff",
        lineHeight: 25,
    },
    identityText: {
        flex: 1,
        minWidth: 0,
    },
    // Keep the display name clear of the absolute streak badge in the top-right.
    identityTextWithBadge: {
        paddingRight: 30,
    },
    displayName: {
        fontFamily: fonts.display,
        fontSize: 20,
        letterSpacing: -0.3,
        lineHeight: 22,
        color: colors.ink,
        marginBottom: 2,
    },
    username: {
        fontFamily: fonts.mono,
        fontSize: 9,
        letterSpacing: 0.3,
        color: colors.inkDim,
    },
    statsRow: {
        flexDirection: "row",
        alignItems: "center",
        marginTop: 9,
    },
    statItem: {
        alignItems: "flex-start",
    },
    statNum: {
        fontFamily: fonts.display,
        fontSize: 15,
        letterSpacing: -0.2,
        lineHeight: 17,
        color: colors.ink,
    },
    statLbl: {
        fontFamily: fonts.mono,
        fontSize: 9,
        letterSpacing: 0.2,
        color: colors.inkDim,
    },
    statDivider: {
        width: 1,
        height: 22,
        backgroundColor: colors.line,
        marginHorizontal: 10,
    },
    // ── Follow + To LISTn row ────────────────────────────────────────
    // The 50/50 split lives on two empty flex:1 columns (same as the
    // Compatibility / Top Artist tile grid), so button content can't shift the
    // divider. Each button fills its column at width 100%.
    actionRow: {
        flexDirection: "row",
        gap: 10,
        marginTop: 10,
    },
    actionCol: {
        flex: 1,
    },
    followBtn: {
        // Fill the column, but inset 3px on the right so the hard shadow (offset
        // +3) ends on the column edge instead of poking past it. The shadow
        // visually fills that 3px, so body+shadow == a full column and lines up
        // with the To LISTn button and the tiles below.
        alignSelf: "stretch",
        marginRight: 3,
        backgroundColor: colors.accent,
        borderRadius: 14,
        paddingVertical: 12,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: colors.ink,
        shadowOpacity: 1,
        shadowRadius: 0,
        shadowOffset: { width: 3, height: 3 },
    },
    followingBtn: {
        // Pressed/Following: no shadow, so fill the column edge-to-edge (no inset).
        marginRight: 0,
        backgroundColor: colors.paper,
        borderWidth: 1.5,
        borderColor: colors.line,
        shadowOpacity: 0,
    },
    followText: {
        fontFamily: fonts.display,
        fontSize: 13,
        color: "#fff",
    },
    followingText: {
        color: colors.inkSoft,
    },
    toListnBtn: {
        alignSelf: "stretch",
        flexDirection: "row",
        alignItems: "center",
        gap: 9,
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 14,
        paddingVertical: 12,
        paddingHorizontal: 14,
        minWidth: 0,
    },
    toListnTitle: {
        fontFamily: fonts.display,
        fontSize: 13,
        color: colors.ink,
    },
    toListnCount: {
        fontFamily: fonts.display,
        fontSize: 13,
        color: colors.inkDim,
    },
    error: {
        color: colors.danger,
        fontSize: 14,
        marginTop: 16,
        textAlign: "center",
        paddingHorizontal: 24,
    },
    reportSuccess: {
        color: colors.mint,
        fontSize: 13,
        marginTop: 12,
        textAlign: "center",
    },
    // ── Private state ────────────────────────────────────────────────
    privateCard: {
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 16,
        padding: 20,
        marginTop: 10,
        alignItems: "center",
    },
    privateTitle: {
        fontFamily: fonts.display,
        fontSize: 14,
        color: colors.ink,
        textAlign: "center",
    },
    privateText: {
        fontSize: 12,
        color: colors.inkSoft,
        marginTop: 6,
        textAlign: "center",
    },
    // ── Tiles grid ───────────────────────────────────────────────────
    tileGrid: {
        flexDirection: "row",
        gap: 10,
        marginTop: 10,
    },
    compatTile: {
        flex: 1,
        backgroundColor: colors.teal,
        borderRadius: 14,
        paddingVertical: 11,
        paddingHorizontal: 12,
    },
    compatPill: {
        backgroundColor: "rgba(255,255,255,0.22)",
        borderRadius: 999,
        paddingVertical: 3,
        paddingHorizontal: 8,
        alignSelf: "flex-start",
    },
    compatPillText: {
        fontFamily: fonts.mono,
        fontSize: 8.5,
        letterSpacing: 0.8,
        fontWeight: "700",
        color: "#fff",
        textTransform: "uppercase",
    },
    compatPctRow: {
        flexDirection: "row",
        alignItems: "flex-end",
        gap: 6,
        marginTop: 9,
    },
    compatPct: {
        fontFamily: fonts.display,
        fontSize: 38,
        lineHeight: 34,
        color: "#fff",
        flexShrink: 1,
    },
    compatAligned: {
        fontFamily: fonts.mono,
        fontSize: 7.5,
        letterSpacing: 1,
        color: "rgba(255,255,255,0.9)",
        paddingBottom: 4,
        flexShrink: 0,
    },
    compatMeta: {
        fontFamily: fonts.mono,
        fontSize: 7,
        letterSpacing: 0.7,
        color: "rgba(255,255,255,0.85)",
        marginTop: 10,
    },
    compatMuted: {
        fontSize: 11,
        lineHeight: 15,
        color: "rgba(255,255,255,0.92)",
        marginTop: 9,
    },
    artistTile: {
        flex: 1,
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 14,
        paddingVertical: 11,
        paddingHorizontal: 12,
        shadowColor: colors.ink,
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
    },
    artistTileLabel: {
        fontFamily: fonts.mono,
        fontSize: 7.5,
        letterSpacing: 1,
        fontWeight: "700",
        color: colors.accent,
    },
    artistRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginTop: 9,
    },
    artistDisc: {
        width: 46,
        height: 46,
        borderRadius: 23,
        backgroundColor: colors.navy,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    artistDiscLetter: {
        fontFamily: fonts.display,
        fontSize: 18,
        color: colors.cream,
    },
    artistName: {
        fontFamily: fonts.display,
        fontSize: 14,
        lineHeight: 16,
        color: colors.ink,
    },
    artistCount: {
        fontFamily: fonts.mono,
        fontSize: 7.5,
        letterSpacing: 0.6,
        color: colors.inkDim,
        marginTop: 4,
    },
    artistMeta: {
        fontFamily: fonts.mono,
        fontSize: 7,
        letterSpacing: 0.7,
        color: colors.inkDim,
        marginTop: 10,
    },
    artistEmpty: {
        fontSize: 11,
        color: colors.inkDim,
        marginTop: 9,
    },
    // ── Section labels ───────────────────────────────────────────────
    sectionLabelRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "baseline",
        marginTop: 13,
        marginBottom: 6,
        marginHorizontal: 2,
    },
    sectionLabelText: {
        fontFamily: fonts.mono,
        fontSize: 9,
        letterSpacing: 1.6,
        fontWeight: "700",
        color: colors.inkDim,
    },
    sectionLabelLink: {
        fontFamily: fonts.mono,
        fontSize: 8,
        letterSpacing: 0.5,
        fontWeight: "700",
        color: colors.accent,
    },
    // ── Top songs (uniform rows) ─────────────────────────────────────
    topSongsCard: {
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 16,
        paddingVertical: 2,
        paddingHorizontal: 12,
        shadowColor: colors.ink,
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
    },
    songRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 9,
    },
    songRowBorder: {
        borderTopWidth: 1,
        borderTopColor: colors.line,
    },
    songRank: {
        fontFamily: fonts.serif,
        fontStyle: "italic",
        fontSize: 17,
        color: "#b8923f",
        width: 15,
        textAlign: "center",
        flexShrink: 0,
    },
    songCover: {
        width: 38,
        height: 38,
        borderRadius: 8,
        backgroundColor: colors.paper2,
        overflow: "hidden",
        flexShrink: 0,
    },
    coverImg: {
        width: "100%",
        height: "100%",
    },
    songTitle: {
        fontFamily: fonts.display,
        fontSize: 14,
        lineHeight: 16,
        color: colors.ink,
    },
    songArtist: {
        fontFamily: fonts.mono,
        fontSize: 7.5,
        letterSpacing: 0.8,
        color: colors.inkSoft,
        marginTop: 3,
    },
    songScore: {
        fontFamily: fonts.display,
        fontSize: 20,
        flexShrink: 0,
    },
    // ── Genres ───────────────────────────────────────────────────────
    genresCard: {
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 16,
        paddingVertical: 11,
        paddingHorizontal: 12,
        gap: 9,
        shadowColor: colors.ink,
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
    },
    genreRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    genreName: {
        fontSize: 11.5,
        fontWeight: "700",
        color: colors.ink,
        width: 84,
    },
    genreBarTrack: {
        flex: 1,
        height: 8,
        borderRadius: 5,
        backgroundColor: colors.bg,
        overflow: "hidden",
    },
    genreBarFill: {
        height: "100%",
        borderRadius: 5,
    },
    genrePct: {
        fontFamily: fonts.display,
        fontSize: 13,
        width: 34,
        textAlign: "right",
    },
    // ── Auxstrology orbit card ───────────────────────────────────────
    auxCard: {
        backgroundColor: colors.navy,
        borderRadius: 16,
        overflow: "hidden",
        padding: 14,
        marginTop: 13,
    },
    auxInner: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    auxTextBlock: {
        flex: 1,
        minWidth: 0,
    },
    auxPill: {
        backgroundColor: "rgba(245,184,64,0.16)",
        borderRadius: 999,
        paddingVertical: 3,
        paddingHorizontal: 8,
        alignSelf: "flex-start",
        marginBottom: 9,
    },
    auxPillText: {
        fontFamily: fonts.mono,
        fontSize: 8,
        letterSpacing: 1.4,
        fontWeight: "700",
        color: colors.gold,
    },
    auxTitle: {
        fontFamily: fonts.serif,
        fontSize: 22,
        color: colors.cream,
        lineHeight: 26,
        fontStyle: "italic",
        marginBottom: 6,
    },
    auxBody: {
        fontFamily: fonts.mono,
        fontSize: 10,
        color: colors.cdim,
        lineHeight: 14,
    },
    ratingsWrap: {
        marginTop: 13,
    },
    // ── Report panel ─────────────────────────────────────────────────
    reportPanel: {
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 16,
        padding: 14,
        marginTop: 10,
    },
    reportTitle: {
        fontFamily: fonts.display,
        fontSize: 15,
        color: colors.ink,
        marginBottom: 8,
    },
    reportLabel: {
        fontFamily: fonts.mono,
        fontSize: 9,
        letterSpacing: 0.8,
        color: colors.inkSoft,
        marginTop: 8,
        marginBottom: 6,
    },
    reasonGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 6,
    },
    reasonBtn: {
        backgroundColor: colors.bg,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 999,
        paddingVertical: 7,
        paddingHorizontal: 11,
    },
    reasonBtnActive: {
        backgroundColor: colors.ink,
        borderColor: colors.ink,
    },
    reasonText: {
        fontSize: 11.5,
        color: colors.inkSoft,
    },
    reasonTextActive: {
        color: "#fff",
    },
    reportInput: {
        backgroundColor: colors.bg,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 11,
        minHeight: 64,
        padding: 10,
        fontSize: 12.5,
        color: colors.ink,
        textAlignVertical: "top",
    },
    reportError: {
        color: colors.danger,
        fontSize: 12.5,
        marginTop: 8,
    },
    reportActions: {
        flexDirection: "row",
        justifyContent: "flex-end",
        gap: 8,
        marginTop: 12,
    },
    cancelBtn: {
        paddingVertical: 9,
        paddingHorizontal: 14,
        borderRadius: 999,
        backgroundColor: colors.bg,
        borderWidth: 1,
        borderColor: colors.line,
    },
    cancelText: {
        fontFamily: fonts.display,
        fontSize: 12,
        color: colors.inkSoft,
    },
    submitBtn: {
        paddingVertical: 9,
        paddingHorizontal: 14,
        borderRadius: 999,
        backgroundColor: colors.ink,
    },
    submitBtnDisabled: {
        opacity: 0.4,
    },
    submitText: {
        fontFamily: fonts.display,
        fontSize: 12,
        color: "#fff",
    },
    blockRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: colors.line,
    },
    blockRowText: {
        fontFamily: fonts.display,
        fontSize: 12,
        color: colors.danger,
    },
})
