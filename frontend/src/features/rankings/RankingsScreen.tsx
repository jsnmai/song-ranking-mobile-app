// Rankings tab — shows the user's ranked songs sorted by score.
// Phase 4 will replace this empty state with the actual ranked list.
import { StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { useNavigation } from "@react-navigation/native"
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs"

import { TabParamList } from "../../navigation/types"

export default function RankingsScreen() {
    // Navigate to Discover and auto-focus the search bar — same action as tapping the FAB.
    const navigation = useNavigation<BottomTabNavigationProp<TabParamList>>()

    function handleRateFirstSong() {
        navigation.navigate("Discover", { focusSearch: true })
    }

    return (
        <View style={styles.container}>
            <Text style={styles.emptyText}>Rate your first song</Text>
            <TouchableOpacity style={styles.button} onPress={handleRateFirstSong}>
                <Text style={styles.buttonText}>Find a song</Text>
            </TouchableOpacity>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#000",
        alignItems: "center",
        justifyContent: "center",
    },
    emptyText: {
        color: "#fff",
        fontSize: 18,
        marginBottom: 24,
    },
    button: {
        paddingVertical: 12,
        paddingHorizontal: 32,
        borderWidth: 1,
        borderColor: "#fff",
        borderRadius: 8,
    },
    buttonText: {
        color: "#fff",
        fontSize: 16,
    },
})
