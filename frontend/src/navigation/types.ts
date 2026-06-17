// Shared navigation types for the tab navigator.
// Defined here to avoid circular imports between AppNavigator and its child screens.
// Any screen that needs to navigate between tabs or read tab params imports from here.
import { NavigatorScreenParams } from "@react-navigation/native"

import { ComparisonSessionResponse, RankingResponse, RatingFinalizeResponse } from "../features/comparison/types"
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
    FullRankings: undefined;
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
    SongDetail: { ranking: RankingResponse } | { song: SongSearchResult };
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
    UserBookmarks: { username: string };
    MostCompatible: undefined;
}
