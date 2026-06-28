// AppNavigator — the main tab bar shown when the user is logged in.
// Tab order: Feed | Rankings | [FAB] | Discover | You
// The center button is a raised gold FAB that opens the rating flow (Discover + focusSearch).
// Tab bar uses a frosted-glass overlay so content scrolls behind it.

import { StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { StackActions } from "@react-navigation/native"
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs"
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import { BottomTabBarProps } from "@react-navigation/bottom-tabs"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Svg, { Path, Rect, Circle } from "react-native-svg"
import { BlurView } from "expo-blur"

import {
    AppStackParamList,
    DiscoverStackParamList,
    FeedStackParamList,
    ProfileStackParamList,
    RankingsStackParamList,
    TabParamList,
} from "./types"
import ActivityLikersScreen from "../features/activity/ActivityLikersScreen"
import BucketSelectionScreen from "../features/comparison/BucketSelectionScreen"
import ComparisonFlowScreen from "../features/comparison/ComparisonFlowScreen"
import ScoreRevealScreen from "../features/comparison/ScoreRevealScreen"
import FeedScreen from "../features/feed/FeedScreen"
import RankingsScreen from "../features/rankings/RankingsScreen"
import FullRankingsScreen from "../features/rankings/FullRankingsScreen"
import RankMapScreen from "../features/rankings/rankmap/RankMapScreen"
import ReorderScreen from "../features/rankings/ReorderScreen"
import VersusHistoryScreen from "../features/rankings/VersusHistoryScreen"
import DiscoverScreen from "../features/discover/DiscoverScreen"
import BlockedUsersScreen from "../features/profile/BlockedUsersScreen"
import LegalPlaceholderScreen from "../features/profile/LegalPlaceholderScreen"
import OtherProfileScreen from "../features/profile/OtherProfileScreen"
import PrivacyScreen from "../features/profile/PrivacyScreen"
import ProfileListScreen from "../features/profile/ProfileListScreen"
import ProfileScreen from "../features/profile/ProfileScreen"
import SettingsScreen from "../features/profile/SettingsScreen"
import SongDetailScreen from "../features/song-detail/SongDetailScreen"
import BookmarksScreen from "../features/bookmarks/BookmarksScreen"
import UserBookmarksScreen from "../features/profile/UserBookmarksScreen"
import UserRankingsScreen from "../features/profile/UserRankingsScreen"
import UserActivityScreen from "../features/profile/UserActivityScreen"
import MostCompatibleScreen from "../features/profile/MostCompatibleScreen"
import { colors, fonts } from "../theme"

const Tab = createBottomTabNavigator<TabParamList>()
const Stack = createNativeStackNavigator<AppStackParamList>()
const RankingsStack = createNativeStackNavigator<RankingsStackParamList>()
const FeedStack = createNativeStackNavigator<FeedStackParamList>()
const DiscoverStack = createNativeStackNavigator<DiscoverStackParamList>()
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>()

// ── Tab bar icons (SVG) ───────────────────────────────────────────────────
const S = 22  // icon size
const SW = 1.9 // stroke width

function FeedIcon({ color }: { color: string }) {
    return (
        <Svg width={S} height={S} viewBox="0 0 24 24" fill="none">
            <Rect x="4.5" y="5" width="15" height="14" rx="4" stroke={color} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round" />
            <Circle cx="8.6" cy="10" r="1.5" fill={color} stroke="none" />
            <Rect x="11" y="8.8" width="5" height="2.4" rx="1.2" fill={color} stroke="none" />
            <Path d="M8 14.3h8" stroke={color} strokeWidth={SW} strokeLinecap="round" />
        </Svg>
    )
}

function RankIcon({ color }: { color: string }) {
    return (
        <Svg width={S} height={S} viewBox="0 0 24 24" fill={color}>
            <Rect x="4" y="5.6" width="16" height="3.3" rx="1.65" />
            <Rect x="4" y="10.35" width="11" height="3.3" rx="1.65" />
            <Rect x="4" y="15.1" width="7" height="3.3" rx="1.65" />
        </Svg>
    )
}

function DiscoverIcon({ color }: { color: string }) {
    return (
        <Svg width={S} height={S} viewBox="0 0 24 24" fill="none">
            <Circle cx="11" cy="11" r="7" stroke={color} strokeWidth={SW} strokeLinecap="round" />
            <Path d="m20 20-3.4-3.4" stroke={color} strokeWidth={SW} strokeLinecap="round" />
        </Svg>
    )
}

function YouIcon({ color }: { color: string }) {
    return (
        <Svg width={S} height={S} viewBox="0 0 24 24" fill="none">
            <Circle cx="12" cy="8" r="4" stroke={color} strokeWidth={SW} strokeLinecap="round" />
            <Path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" stroke={color} strokeWidth={SW} strokeLinecap="round" />
        </Svg>
    )
}

type TabIconName = "Feed" | "Rankings" | "Discover" | "Profile"

function TabIcon({ name, color }: { name: TabIconName; color: string }) {
    if (name === "Feed") return <FeedIcon color={color} />
    if (name === "Rankings") return <RankIcon color={color} />
    if (name === "Discover") return <DiscoverIcon color={color} />
    return <YouIcon color={color} />
}

// ── Custom frosted glass tab bar ──────────────────────────────────────────
// Absolutely positioned overlay; content scrolls behind it.
function FrostedTabBar({ state, descriptors: _desc, navigation }: BottomTabBarProps) {
    const { bottom } = useSafeAreaInsets()
    const tabBarH = 56 + bottom
    const focusedRoute = state.routes[state.index]
    const nestedRouteIndex = focusedRoute.state?.index ?? 0
    const nestedRouteName = focusedRoute.state?.routes?.[nestedRouteIndex]?.name

    if (focusedRoute.name === "Rankings" && nestedRouteName === "RankMap") {
        return null
    }

    const tabDefs: Array<{ route: TabIconName; label: string }> = [
        { route: "Feed", label: "FEED" },
        { route: "Rankings", label: "RANKINGS" },
    ]
    const rightDefs: Array<{ route: TabIconName; label: string }> = [
        { route: "Discover", label: "DISCOVER" },
        { route: "Profile", label: "YOU" },
    ]

    function routeIndex(name: string) {
        return state.routes.findIndex((r) => r.name === name)
    }

    function onTabPress(name: string) {
        const index = routeIndex(name)
        if (index === -1) return
        const route = state.routes[index]
        const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true })
        if (event.defaultPrevented) return

        if (state.index !== index) {
            // Switching in from another tab: just focus it, preserving whatever
            // screen was left pushed on its stack.
            navigation.navigate(name)
            return
        }

        // Re-pressing the tab we're already on: reset its stack to the home
        // screen rather than leaving a pushed screen (another user's profile, a
        // follow list) in place. popToTop keeps the existing home screen instance
        // and its scroll position, animating back to it as a single pop instead
        // of a push-then-pop. route.state is undefined until the stack moves past
        // its initial route, so a missing/shallow state means we're already home
        // and there's nothing to pop.
        const nestedKey = route.state?.key
        const nestedDepth = route.state?.routes?.length ?? 1
        if (nestedKey && nestedDepth > 1) {
            navigation.dispatch({ ...StackActions.popToTop(), target: nestedKey })
        }
    }

    function renderTab({ route, label }: { route: TabIconName; label: string }) {
        const isFocused = state.routes[state.index]?.name === route
        const iconColor = isFocused ? colors.ink : colors.inkDim
        return (
            <TouchableOpacity
                key={route}
                style={styles.tabBtn}
                onPress={() => onTabPress(route)}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={isFocused ? { selected: true } : {}}
            >
                <TabIcon name={route} color={iconColor} />
                <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>{label}</Text>
                <View style={[styles.tabUnderline, isFocused && styles.tabUnderlineActive]} />
            </TouchableOpacity>
        )
    }

    return (
        <BlurView
            intensity={48}
            tint="light"
            style={[styles.tabBar, { height: tabBarH, paddingBottom: bottom }]}
        >
            {/* Left two tabs */}
            {tabDefs.map(renderTab)}

            {/* Center gold FAB */}
            <View style={styles.fabSlot}>
                <TouchableOpacity
                    style={styles.fab}
                    onPress={() => navigation.navigate("Discover", { screen: "DiscoverHome", params: { focusSearch: true } } as never)}
                    accessibilityRole="button"
                    accessibilityLabel="Rate a song"
                    activeOpacity={0.88}
                >
                    <Text style={styles.fabPlus}>+</Text>
                </TouchableOpacity>
            </View>

            {/* Right two tabs */}
            {rightDefs.map(renderTab)}
        </BlurView>
    )
}

// FABPlaceholderScreen is never shown — required by React Navigation for every registered tab.
function FABPlaceholderScreen() {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />
}

function RankingsNavigator() {
    return (
        <RankingsStack.Navigator screenOptions={{ headerShown: false }}>
            <RankingsStack.Screen name="RankingsOverview" component={RankingsScreen} />
            <RankingsStack.Screen name="FullRankings" component={FullRankingsScreen} />
            {/* Swipe-back is disabled: the Rank Map captures horizontal drags to
                pan the universe, so the edge-swipe pop gesture would fight it. The
                in-screen back button is the only way out. */}
            <RankingsStack.Screen
                name="RankMap"
                component={RankMapScreen}
                options={{ gestureEnabled: false }}
            />
        </RankingsStack.Navigator>
    )
}

// Feed, Discover, and Profile each get a stack so that other-profile and
// follow-list screens render inside the tab navigator, keeping the frosted
// tab bar visible while browsing people.
function FeedNavigator() {
    return (
        <FeedStack.Navigator screenOptions={{ headerShown: false }}>
            <FeedStack.Screen name="FeedHome" component={FeedScreen} />
            <FeedStack.Screen name="OtherProfile" component={OtherProfileScreen} />
            <FeedStack.Screen name="ProfileList" component={ProfileListScreen} />
            <FeedStack.Screen name="ActivityLikers" component={ActivityLikersScreen} />
        </FeedStack.Navigator>
    )
}

function DiscoverNavigator() {
    return (
        <DiscoverStack.Navigator screenOptions={{ headerShown: false }}>
            <DiscoverStack.Screen name="DiscoverHome" component={DiscoverScreen} />
            <DiscoverStack.Screen name="OtherProfile" component={OtherProfileScreen} />
            <DiscoverStack.Screen name="ProfileList" component={ProfileListScreen} />
            <DiscoverStack.Screen name="ActivityLikers" component={ActivityLikersScreen} />
        </DiscoverStack.Navigator>
    )
}

function ProfileNavigator() {
    return (
        <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
            <ProfileStack.Screen name="ProfileHome" component={ProfileScreen} />
            <ProfileStack.Screen name="OtherProfile" component={OtherProfileScreen} />
            <ProfileStack.Screen name="ProfileList" component={ProfileListScreen} />
            <ProfileStack.Screen name="ActivityLikers" component={ActivityLikersScreen} />
        </ProfileStack.Navigator>
    )
}

function MainTabs() {
    return (
        <Tab.Navigator
            tabBar={(props) => <FrostedTabBar {...props} />}
            screenOptions={{ headerShown: false }}
        >
            <Tab.Screen name="Feed" component={FeedNavigator} />
            <Tab.Screen name="Rankings" component={RankingsNavigator} />
            <Tab.Screen
                name="FABPlaceholder"
                component={FABPlaceholderScreen}
                options={{ tabBarButton: () => null }}
            />
            <Tab.Screen name="Discover" component={DiscoverNavigator} />
            <Tab.Screen name="Profile" component={ProfileNavigator} />
        </Tab.Navigator>
    )
}

export default function AppNavigator() {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="SongDetail" component={SongDetailScreen} />
            <Stack.Screen name="OtherProfile" component={OtherProfileScreen} />
            <Stack.Screen name="ProfileList" component={ProfileListScreen} />
            <Stack.Screen name="ActivityLikers" component={ActivityLikersScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="Privacy" component={PrivacyScreen} />
            <Stack.Screen name="BlockedUsers" component={BlockedUsersScreen} />
            <Stack.Screen name="LegalPlaceholder" component={LegalPlaceholderScreen} />
            <Stack.Screen name="Reorder" component={ReorderScreen} />
            <Stack.Screen name="VersusHistory" component={VersusHistoryScreen} />
            <Stack.Screen name="Bookmarks" component={BookmarksScreen} />
            <Stack.Screen
                name="BucketSelection"
                component={BucketSelectionScreen}
                options={{ presentation: "transparentModal", animation: "none" }}
            />
            <Stack.Screen name="ComparisonFlow" component={ComparisonFlowScreen} />
            <Stack.Screen name="ScoreReveal" component={ScoreRevealScreen} />
            <Stack.Screen name="UserRankings" component={UserRankingsScreen} />
            <Stack.Screen name="UserActivity" component={UserActivityScreen} />
            <Stack.Screen name="UserBookmarks" component={UserBookmarksScreen} />
            <Stack.Screen name="MostCompatible" component={MostCompatibleScreen} />
        </Stack.Navigator>
    )
}

const styles = StyleSheet.create({
    // ── Frosted tab bar ──────────────────────────────────────────────────
    tabBar: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingTop: 9,
        // Tint layer on top of the blur — warm paper wash kept opaque enough that the bar stays
        // legibly light even when dark cards (Auxstrology, setup) scroll behind it.
        backgroundColor: "rgba(253,251,244,0.78)",
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: "rgba(17,19,28,0.10)",
        shadowColor: "#000",
        shadowOpacity: 0.08,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: -4 },
        zIndex: 20,
    },
    tabBtn: {
        flex: 1,
        alignItems: "center",
        gap: 3,
        paddingBottom: 4,
    },
    tabLabel: {
        fontFamily: fonts.mono,
        fontSize: 7.5,
        letterSpacing: 0.7,
        color: colors.inkDim,
        fontWeight: "700",
    },
    tabLabelActive: {
        color: colors.ink,
    },
    tabUnderline: {
        width: 18,
        height: 2.5,
        borderRadius: 2,
        backgroundColor: "transparent",
        marginTop: 1,
    },
    tabUnderlineActive: {
        backgroundColor: colors.accent,
    },
    // ── Gold FAB ─────────────────────────────────────────────────────────
    fabSlot: {
        alignItems: "center",
        justifyContent: "flex-end",
        width: 60,
        paddingBottom: 8,
    },
    fab: {
        width: 54,
        height: 54,
        borderRadius: 16,
        backgroundColor: colors.gold,
        alignItems: "center",
        justifyContent: "center",
        // Lifted above the bar
        marginBottom: 8,
        shadowColor: colors.gold,
        shadowOpacity: 0.5,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        // Offset shadow matching design: 4px 4px 0 accent
        elevation: 8,
    },
    fabPlus: {
        color: colors.navy,
        fontSize: 30,
        lineHeight: 32,
        fontWeight: "300",
        marginTop: -2,
    },
})
