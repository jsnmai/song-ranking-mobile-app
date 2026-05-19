// Score Reveal screen — final moment after rating or comparison finalize.
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { NativeStackScreenProps } from "@react-navigation/native-stack"

import { AppStackParamList } from "../../navigation/types"

type ScoreRevealProps = NativeStackScreenProps<AppStackParamList, "ScoreReveal">

export default function ScoreRevealScreen({ navigation, route }: ScoreRevealProps) {
    const { result } = route.params
    const { ranking } = result

    const handleContinue = () => {
        // TODO: When Rankings supports deep links, scroll to and highlight ranking.song_id.
        navigation.navigate("MainTabs", { screen: "Rankings" })
    }

    return (
        <View style={styles.container}>
            <View style={styles.content}>
                {ranking.song.cover_url ? (
                    <Image source={{ uri: ranking.song.cover_url }} style={styles.cover} />
                ) : (
                    <View style={styles.coverPlaceholder} />
                )}
                <Text style={styles.songTitle} numberOfLines={2}>{ranking.song.title}</Text>
                <Text style={styles.artist} numberOfLines={1}>{ranking.song.artist}</Text>
                <Text style={styles.score}>{ranking.score.toFixed(2)}</Text>
                <Text style={styles.context}>
                    {ranking.bucket.toUpperCase()} · #{ranking.position}
                </Text>
            </View>
            <TouchableOpacity style={styles.button} onPress={handleContinue}>
                <Text style={styles.buttonText}>Continue</Text>
            </TouchableOpacity>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#000",
        paddingHorizontal: 24,
        paddingBottom: 42,
    },
    content: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    cover: {
        width: 168,
        height: 168,
        borderRadius: 8,
        marginBottom: 24,
    },
    coverPlaceholder: {
        width: 168,
        height: 168,
        borderRadius: 8,
        marginBottom: 24,
        backgroundColor: "#1a1a1a",
    },
    songTitle: {
        color: "#fff",
        fontSize: 24,
        fontWeight: "700",
        textAlign: "center",
        marginBottom: 6,
    },
    artist: {
        color: "#aaa",
        fontSize: 16,
        marginBottom: 28,
    },
    score: {
        color: "#fff",
        fontSize: 80,
        fontWeight: "800",
        lineHeight: 88,
    },
    context: {
        color: "#777",
        fontSize: 15,
        fontWeight: "700",
        marginTop: 4,
    },
    button: {
        height: 52,
        borderRadius: 8,
        backgroundColor: "#fff",
        alignItems: "center",
        justifyContent: "center",
    },
    buttonText: {
        color: "#000",
        fontSize: 16,
        fontWeight: "700",
    },
})
