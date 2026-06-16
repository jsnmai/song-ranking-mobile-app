// TypeScript types for the profile feature.
// These mirror the Pydantic schemas in backend/src/pydantic_schemas/profile.py.

// Mirrors ProfileResponse in backend/src/pydantic_schemas/profile.py
export type ProfileVisibility = "public" | "friends_only" | "only_me"
// Mirrors AvatarColor in backend/src/pydantic_schemas/profile.py — fixed palette of design tokens.
export type AvatarColor = "accent" | "sky" | "plum" | "mint" | "gold"
export type ReportTargetType = "user" | "profile" | "rating_event" | "rating_note"
export type ReportReason =
    | "harassment"
    | "hate_or_abuse"
    | "impersonation"
    | "inappropriate_content"
    | "spam"
    | "under_13"
    | "other"
export type ReportStatus = "open" | "reviewed" | "actioned" | "dismissed"

export type ProfileBase = {
    id: number;
    user_id: number;
    username: string;
    display_name: string;
    avatar_color: AvatarColor | null;
    // IANA timezone captured silently from the device (see AuthContext).
    timezone: string | null;
    is_public: boolean;
    visibility: ProfileVisibility;
    created_at: string;
}

// Mirrors UserStats in backend/src/pydantic_schemas/profile.py
export type UserStats = {
    rated_count: number;
    bookmarked_count: number;
}

// Mirrors ProfileSummaryResponse in backend/src/pydantic_schemas/profile.py
export type Profile = ProfileBase & {
    follower_count: number;
    following_count: number;
    is_following: boolean;
    is_followed_by: boolean;
    is_own_profile: boolean;
    can_view_taste: boolean;
    is_blocked: boolean;
    user_stats: UserStats | null;
    // Taste similarity with the viewer; populated on user search results.
    similarity_score?: number | null;
}

// Mirrors ProfileSearchResponse in backend/src/pydantic_schemas/profile.py
export type ProfileSearchResponse = {
    results: Profile[];
}

// Mirrors ProfileListResponse in backend/src/pydantic_schemas/profile.py
export type ProfileListResponse = {
    profiles: Profile[];
}

export type BlockedProfileListResponse = {
    profiles: Profile[];
}

// Mirrors ProfileSetup in backend/src/pydantic_schemas/profile.py
export type ProfileSetupRequest = {
    display_name: string;
    username: string;
}

// Mirrors ProfileEdit in backend/src/pydantic_schemas/profile.py — partial update of
// the user's own profile. Only the fields present are changed.
export type ProfileEditRequest = {
    display_name?: string;
    username?: string;
    avatar_color?: AvatarColor;
    timezone?: string;
}

export type ProfileReportRequest = {
    target_type?: ReportTargetType;
    reason: ReportReason;
    details?: string | null;
}

export type ProfileReportResponse = {
    id: number;
    reporter_user_id: number | null;
    reported_user_id: number | null;
    target_type: ReportTargetType;
    target_id: number | null;
    reason: ReportReason;
    details: string | null;
    status: ReportStatus;
    created_at: string;
}

// Mirrors TasteGenreItem in backend/src/pydantic_schemas/profile.py
export type TasteGenreItem = {
    name: string;
    count: number;
    percentage: number;
}

// Mirrors TasteArtistItem in backend/src/pydantic_schemas/profile.py
export type TasteArtistItem = {
    name: string;
    count: number;
}

// Mirrors TasteSection in backend/src/pydantic_schemas/profile.py
export type TasteSection = {
    genres: TasteGenreItem[];
    top_artists: TasteArtistItem[];
}

// Mirrors TasteBucketSection in backend/src/pydantic_schemas/profile.py
export type TasteBucketSection = TasteSection & {
    avg_score: number | null;
    count: number;
}

// Mirrors TasteBucketBreakdown in backend/src/pydantic_schemas/profile.py
export type TasteBucketBreakdown = {
    like: number;
    okay: number;
    dislike: number;
}

// Mirrors TasteProfileResponse in backend/src/pydantic_schemas/profile.py
export type TasteProfileResponse = {
    total_rated: number;
    avg_score: number | null;
    bucket_breakdown: TasteBucketBreakdown;
    overall: TasteSection;
    by_bucket: {
        like: TasteBucketSection;
        okay: TasteBucketSection;
        dislike: TasteBucketSection;
    };
}

// Mirrors AuxstrologySign in backend/src/pydantic_schemas/auxstrology.py
export type AuxstrologySign = {
    name: string;
    summary: string;
}

// Mirrors AuxstrologyResponse in backend/src/pydantic_schemas/auxstrology.py
export type AuxstrologyResponse = {
    status: "locked" | "first_contact" | "active";
    current_ratings: number;
    required_ratings: number | null;
    sign: AuxstrologySign | null;
    caption: string | null;
    adjectives: string[];
    evidence: string[];
    axes: Record<string, string>;
}

export type RecentRatingSong = {
    id: number;
    deezer_id: number;
    title: string;
    artist: string;
    album: string;
    cover_url: string;
    preview_url: string | null;
}

export type RecentRatingItem = {
    rating_event_id: number;
    song: RecentRatingSong;
    bucket: string;
    score: number;
    note: string | null;
    created_at: string;
}

export type RecentRatingsResponse = {
    items: RecentRatingItem[];
}

// Mirrors CompatibilityResponse in backend/src/pydantic_schemas/profile.py
export type CompatibilityResponse = {
    has_overlap: boolean;
    similarity_score: number | null;
    shared_song_count: number;
    explanation: string;
    is_plus: boolean;
}

// Mirrors MostCompatibleItem in backend/src/pydantic_schemas/profile.py
export type MostCompatibleItem = {
    username: string;
    display_name: string;
    similarity_score: number;
    shared_song_count: number;
    explanation: string;
    computed_at: string;
}

// Mirrors MostCompatibleResponse in backend/src/pydantic_schemas/profile.py
export type MostCompatibleResponse = {
    users: MostCompatibleItem[];
}
