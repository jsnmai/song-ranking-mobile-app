// Shared navigation types for the tab navigator.
// Defined here to avoid circular imports between AppNavigator and its child screens.
// Any screen that needs to navigate between tabs or read tab params imports from here.
import { NavigatorScreenParams } from "@react-navigation/native"

import { BucketName, ComparisonSessionResponse, RankingResponse, RatingFinalizeResponse } from "../features/comparison/types"
import { SongSearchResult } from "../features/search/types"

// TabParamList maps each tab name to its route params.
// `undefined` means the tab can be navigated to without passing any params.
export type TabParamList = {
    Feed: NavigatorScreenParams<FeedStackParamList> | undefined;
    Rankings: NavigatorScreenParams<RankingsStackParamList> | undefined;
    FABPlaceholder: undefined;
    Discover: NavigatorScreenParams<DiscoverStackParamList> | undefined;
    Profile: NavigatorScreenParams<ProfileStackParamList> | undefined;
}

export type RankingsStackParamList = {
    RankingsOverview: undefined;
    // initialBucket pre-selects a bucket tab (e.g. tapping an anchor's count opens that bucket's list).
    FullRankings: { initialBucket?: BucketName } | undefined;
    // RankMap receives the already-loaded rankings as a snapshot so the immersive
    // cosmos opens instantly (no second fetch) — mirrors how SongDetail takes a ranking.
    RankMap: { rankings: RankingResponse[] };
}

// Social screens registered inside each tab's stack so the bottom tab bar
// stays visible while browsing other profiles and follow lists. The same
// screens are also registered on the root stack for pushes that originate
// outside the tabs (e.g. MostCompatible).
type SocialScreenParams = {
    OtherProfile: { username: string };
    ProfileList: { username: string; listType: "followers" | "following" };
    ActivityLikers: { ratingEventId: number };
}

export type FeedStackParamList = SocialScreenParams & {
    FeedHome: undefined;
    Notifications: undefined;
    // Opens a single activity card (the "open the activity" tap from a like notification).
    SingleActivity: { ratingEventId: number };
}

export type DiscoverStackParamList = SocialScreenParams & {
    // DiscoverHome accepts an optional focusSearch param — set to true when navigating
    // via the FAB so the search bar auto-focuses on arrival.
    DiscoverHome: { focusSearch?: boolean; searchMode?: "songs" | "users" } | undefined;
}

export type ProfileStackParamList = SocialScreenParams & {
    ProfileHome: undefined;
}

export type AppStackParamList = {
    MainTabs: NavigatorScreenParams<TabParamList> | undefined;
    // `origin` lets a removal return to where the user came from (e.g. All Rankings) instead of the Rankings tab.
    SongDetail: { ranking: RankingResponse; origin?: "FullRankings" } | { song: SongSearchResult };
    OtherProfile: { username: string };
    ProfileList: { username: string; listType: "followers" | "following" };
    ActivityLikers: { ratingEventId: number };
    Settings: undefined;
    Privacy: undefined;
    BlockedUsers: undefined;
    LegalPlaceholder: { kind: "support" | "privacy" | "terms" | "guidelines" };
    Reorder: undefined;
    VersusHistory: undefined;
    Bookmarks: undefined;
    BucketSelection: { song: SongSearchResult };
    ComparisonFlow: { session: ComparisonSessionResponse };
    ScoreReveal: { result: RatingFinalizeResponse; isRerate?: boolean };
    UserRankings: { username: string };
    UserActivity: { username: string };
    UserBookmarks: { username: string };
    MostCompatible: undefined;
    ShareActivity: { activity: ActivityShareData };
}

// Everything ShareActivityScreen needs to render the shareable art card. The poster shows the
// author's @handle (not "You") so a shared image is identifiable and viewers can find the profile.
export type ActivityShareData = {
    // Bare handle (no leading @); the poster renders it as "@username".
    username: string;
    initial: string;
    avatarColor: string;
    actionLabel: string;
    timeAgo: string;
    song: { title: string; artist: string; cover_url: string | null };
    bucket: string;
    score: number;
    hideScore?: boolean;
    note?: string | null;
}
