// Shared navigation types for the tab navigator.
// Defined here to avoid circular imports between AppNavigator and its child screens.
// Any screen that needs to navigate between tabs or read tab params imports from here.
import { NavigatorScreenParams } from "@react-navigation/native"

import { ComparisonSessionResponse, RatingFinalizeResponse } from "../features/comparison/types"
import { SongSearchResult } from "../features/search/types"

// TabParamList maps each tab name to its route params.
// `undefined` means the tab can be navigated to without passing any params.
export type TabParamList = {
    Feed: undefined;
    Rankings: undefined;
    FABPlaceholder: undefined;
    // Discover accepts an optional focusSearch param — set to true when navigating via the FAB
    // so the search bar auto-focuses on arrival.
    Discover: { focusSearch?: boolean } | undefined;
    Profile: undefined;
}

export type AppStackParamList = {
    MainTabs: NavigatorScreenParams<TabParamList> | undefined;
    BucketSelection: { song: SongSearchResult };
    ComparisonFlow: { session: ComparisonSessionResponse };
    ScoreReveal: { result: RatingFinalizeResponse };
}
