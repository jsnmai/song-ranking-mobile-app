// A quiet "you've reached the end" marker for the bottom of scrolling lists
// (Feed activity, Your Activity on the profile). A single hairline above a mono
// uppercase label, with an optional caption underneath. Static and monochrome —
// it should read as a finished edge, not a call to action.
import { StyleSheet, Text, View } from "react-native"

import { colors, fonts } from "../theme"

export default function EndOfListCap({ label, caption }: { label: string; caption?: string }) {
    return (
        <View style={styles.wrap}>
            <View style={styles.rule} />
            <Text style={styles.label}>{label}</Text>
            {caption ? <Text style={styles.caption}>{caption}</Text> : null}
        </View>
    )
}

const styles = StyleSheet.create({
    wrap: {
        alignItems: "center",
        paddingTop: 22,
        paddingBottom: 8,
    },
    rule: {
        width: 64,
        height: 1,
        backgroundColor: colors.line,
    },
    label: {
        fontFamily: fonts.mono,
        fontSize: 9,
        letterSpacing: 1.8,
        fontWeight: "700",
        color: colors.inkDim,
        textTransform: "uppercase",
        marginTop: 12,
    },
    caption: {
        fontFamily: fonts.sans,
        fontSize: 12,
        color: colors.inkDim,
        marginTop: 5,
        textAlign: "center",
        paddingHorizontal: 32,
    },
})
