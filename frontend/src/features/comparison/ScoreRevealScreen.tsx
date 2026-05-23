// Score Reveal screen — final moment after rating or comparison finalize.
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { NativeStackScreenProps } from "@react-navigation/native-stack"

import DiamondScore from "../../components/DiamondScore"
import { AppStackParamList } from "../../navigation/types"
import { colors, fonts, bucketColor } from "../../theme"

type ScoreRevealProps = NativeStackScreenProps<AppStackParamList, "ScoreReveal">

export default function ScoreRevealScreen({ navigation, route }: ScoreRevealProps) {
    const { result, isRerate = false } = route.params
    const { ranking } = result

    const accent = bucketColor(ranking.bucket)
    const bucketLabel = ranking.bucket === "alright" ? "OKAY" : ranking.bucket.toUpperCase()

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
                <Text style={styles.artist} numberOfLines={1}>
                    {ranking.song.artist.toUpperCase()}
                </Text>
                <DiamondScore score={ranking.score} total={10} size={13} color={accent} />
                <Text style={[styles.score, { color: accent }]}>{ranking.score.toFixed(2)}</Text>
                <Text style={styles.context}>{bucketLabel} · #{ranking.position}</Text>
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
        backgroundColor: colors.bg,
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
        borderRadius: 10,
        marginBottom: 20,
    },
    coverPlaceholder: {
        width: 168,
        height: 168,
        borderRadius: 10,
        marginBottom: 20,
        backgroundColor: colors.sand,
    },
    songTitle: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 24,
        textAlign: "center",
        marginBottom: 6,
        lineHeight: 30,
    },
    artist: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 11,
        letterSpacing: 1.4,
        textAlign: "center",
        marginBottom: 24,
    },
    score: {
        fontFamily: fonts.mono,
        fontSize: 72,
        lineHeight: 80,
        marginTop: 12,
        marginBottom: 6,
    },
    context: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 12,
        letterSpacing: 1.4,
    },
    button: {
        height: 52,
        borderRadius: 999,
        backgroundColor: colors.clay,
        alignItems: "center",
        justifyContent: "center",
    },
    buttonText: {
        color: "#fff",
        fontSize: 15,
        fontWeight: "700",
        letterSpacing: 0.4,
    },
})
