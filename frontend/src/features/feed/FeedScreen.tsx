// Placeholder for the Feed tab — Phase 9b will populate this with the social feed.
import { StyleSheet, Text, View } from "react-native"

export default function FeedScreen() {
    return (
        <View style={styles.container}>
            <Text style={styles.label}>Feed</Text>
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
    label: {
        color: "#fff",
        fontSize: 18,
    },
})
