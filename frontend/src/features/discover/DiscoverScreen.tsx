// Discover tab — houses song search, recommendations, and trending in later phases.
// Phase 3 will wire the search bar to the Deezer API.
// The search bar auto-focuses when the user navigates here via the FAB.
import { useEffect, useRef } from "react"
import { StyleSheet, Text, TextInput, View } from "react-native"
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native"
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs"

import { TabParamList } from "../../navigation/types"

// RouteProp<ParamList, ScreenName> gives the type of route.params for a specific screen.
type DiscoverRouteProp = RouteProp<TabParamList, "Discover">
type DiscoverNavigationProp = BottomTabNavigationProp<TabParamList, "Discover">

export default function DiscoverScreen() {
    const route = useRoute<DiscoverRouteProp>()
    const navigation = useNavigation<DiscoverNavigationProp>()
    // useRef holds a reference to the TextInput DOM node so we can call .focus() imperatively.
    const searchRef = useRef<TextInput>(null)

    // Auto-focus the search bar when navigated here via the FAB.
    // After focusing, reset the param so a normal tab press later does not re-trigger focus.
    useEffect(() => {
        if (route.params?.focusSearch) {
            searchRef.current?.focus()
            navigation.setParams({ focusSearch: undefined })
        }
    }, [route.params?.focusSearch, navigation])

    return (
        <View style={styles.container}>
            <View style={styles.searchRow}>
                <TextInput
                    ref={searchRef}
                    style={styles.searchBar}
                    placeholder="Search for a song..."
                    placeholderTextColor="#555"
                />
            </View>
            <View style={styles.body}>
                <Text style={styles.label}>Discover</Text>
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#000",
    },
    searchRow: {
        paddingTop: 60,
        paddingHorizontal: 16,
        paddingBottom: 12,
    },
    searchBar: {
        backgroundColor: "#1a1a1a",
        color: "#fff",
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        fontSize: 16,
    },
    body: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    label: {
        color: "#fff",
        fontSize: 18,
    },
})
