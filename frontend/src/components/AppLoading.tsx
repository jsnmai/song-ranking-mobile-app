// Branded full-screen loader — the LISTn wordmark over the warm paper canvas with
// a gold spinner, instead of a bare ActivityIndicator. Optional mono message for
// screen-specific copy (e.g. "PULLING IN YOUR CIRCLE…").
import { ActivityIndicator, StyleSheet, Text, View } from "react-native"

import { colors, fonts } from "../theme"

export default function AppLoading({ message }: { message?: string }) {
    return (
        <View style={styles.root}>
            <Text style={styles.wordmark}>LISTn</Text>
            <ActivityIndicator color={colors.gold} style={styles.spinner} />
            {message ? <Text style={styles.message}>{message}</Text> : null}
        </View>
    )
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.bg,
    },
    wordmark: {
        fontFamily: fonts.serif,
        fontSize: 36,
        color: colors.ink,
        letterSpacing: -0.6,
    },
    spinner: {
        marginTop: 18,
    },
    message: {
        fontFamily: fonts.mono,
        fontSize: 9,
        letterSpacing: 1.6,
        color: colors.inkDim,
        fontWeight: "700",
        marginTop: 14,
    },
})
