// Shared navigation types for the tab navigator.
// Defined here to avoid circular imports between AppNavigator and its child screens.
// Any screen that needs to navigate between tabs or read tab params imports from here.
import { NavigatorScreenParams } from "@react-navigation/native"

import { ComparisonSessionResponse, RankingResponse, RatingFinalizeResponse } from "../features/comparison/types"
import { SongSearchResult } from "../features/search/types"

// TabParamList maps each tab name to its route params.
// `undefined` means the tab can be navigated to without passing any params.
export type TabParamList = {
    Feed: undefined;
    Rankings: undefined;
    FABPlaceholder: undefined;
    // Discover accepts an optional focusSearch param — set to true when navigating via the FAB
    // so the search bar auto-focuses on arrival.
    Discover: { focusSearch?: boolean; searchMode?: "songs" | "users" } | undefined;
    Profile: undefined;
}

export type AppStackParamList = {
    MainTabs: NavigatorScreenParams<TabParamList> | undefined;
    SongDetail: { ranking: RankingResponse } | { song: SongSearchResult };
    OtherProfile: { username: string };
    ProfileList: { username: string; listType: "followers" | "following" };
    Reorder: undefined;
    BucketSelection: { song: SongSearchResult };
    ComparisonFlow: { session: ComparisonSessionResponse };
    ScoreReveal: { result: RatingFinalizeResponse; isRerate?: boolean };
}
