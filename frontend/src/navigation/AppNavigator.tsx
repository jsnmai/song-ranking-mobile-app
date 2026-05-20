// AppNavigator — the main tab bar shown when the user is logged in.
// Tab order: Feed | Rankings | [FAB] | Discover | Profile
// The center button is a FAB (floating action button), not a tab.
// Tapping it navigates to Discover and auto-focuses the search bar.

import { StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs"
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import { useNavigation } from "@react-navigation/native"
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs"

import { AppStackParamList, TabParamList } from "./types"
import BucketSelectionScreen from "../features/comparison/BucketSelectionScreen"
import ComparisonFlowScreen from "../features/comparison/ComparisonFlowScreen"
import ScoreRevealScreen from "../features/comparison/ScoreRevealScreen"
import FeedScreen from "../features/feed/FeedScreen"
import RankingsScreen from "../features/rankings/RankingsScreen"
import ReorderScreen from "../features/rankings/ReorderScreen"
import DiscoverScreen from "../features/discover/DiscoverScreen"
import ProfileScreen from "../features/profile/ProfileScreen"
import SongDetailScreen from "../features/song-detail/SongDetailScreen"

const Tab = createBottomTabNavigator<TabParamList>()
const Stack = createNativeStackNavigator<AppStackParamList>()

// FABButton is the center action button — visually floats above the tab bar.
// Not a tab: it always navigates to Discover with focusSearch:true.
function FABButton() {
    const navigation = useNavigation<BottomTabNavigationProp<TabParamList>>()

    function handlePress() {
        navigation.navigate("Discover", { focusSearch: true })
    }

    return (
        // The outer View fills the tab slot so the FAB is centered in that slot.
        <View style={styles.fabSlot}>
            <TouchableOpacity style={styles.fab} onPress={handlePress} activeOpacity={0.8}>
                <Text style={styles.fabIcon}>+</Text>
            </TouchableOpacity>
        </View>
    )
}

// FABPlaceholderScreen is never shown — its tab slot is replaced by FABButton.
// React Navigation requires a screen component for every registered tab.
function FABPlaceholderScreen() {
    return <View style={{ flex: 1, backgroundColor: "#000" }} />
}

function MainTabs() {
    return (
        <Tab.Navigator
            screenOptions={{
                headerShown: false,
                tabBarStyle: styles.tabBar,
                tabBarActiveTintColor: "#fff",
                tabBarInactiveTintColor: "#555",
            }}
        >
            <Tab.Screen name="Feed" component={FeedScreen} />
            <Tab.Screen name="Rankings" component={RankingsScreen} />
            <Tab.Screen
                name="FABPlaceholder"
                component={FABPlaceholderScreen}
                options={{
                    tabBarLabel: "",
                    // tabBarButton replaces the default touchable with our FAB component.
                    tabBarButton: () => <FABButton />,
                }}
            />
            <Tab.Screen name="Discover" component={DiscoverScreen} />
            <Tab.Screen name="Profile" component={ProfileScreen} />
        </Tab.Navigator>
    )
}

export default function AppNavigator() {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            {/* change presentation to 'modal' to try as bottom sheet */}
            <Stack.Screen name="SongDetail" component={SongDetailScreen} />
            {/* change presentation to 'modal' to try as bottom sheet */}
            <Stack.Screen name="Reorder" component={ReorderScreen} />
            <Stack.Screen name="BucketSelection" component={BucketSelectionScreen} />
            <Stack.Screen name="ComparisonFlow" component={ComparisonFlowScreen} />
            <Stack.Screen name="ScoreReveal" component={ScoreRevealScreen} />
        </Stack.Navigator>
    )
}

const styles = StyleSheet.create({
    tabBar: {
        backgroundColor: "#111",
        borderTopColor: "#222",
        height: 60,
    },
    // fabSlot fills the tab bar slot so FABButton is horizontally centered in it.
    fabSlot: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    fab: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: "#fff",
        alignItems: "center",
        justifyContent: "center",
        // Negative marginTop lifts the circle above the tab bar line.
        marginTop: -16,
        // Shadow (iOS)
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 6,
        // Elevation (Android)
        elevation: 8,
    },
    fabIcon: {
        color: "#000",
        fontSize: 28,
        // lineHeight centers the + glyph vertically inside the circle.
        lineHeight: 30,
    },
})
