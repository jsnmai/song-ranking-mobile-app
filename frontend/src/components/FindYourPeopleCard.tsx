// "Find your people" nudge — title, body, an overlapping avatar stack, and two
// actions. Presentational: the caller owns visibility (dismiss/gating) and wires the
// buttons. Used on the Feed header/empty state and on the People search tab. Pass
// `style` to set the outer margins for the surrounding layout.
//
// DEFERRED: "Connect contacts" and "Invite" have no real flows yet — callers wire both
// to a stand-in (open user search / focus the search field). Point them at a real
// contacts-sync / invite surface when one exists.
import { StyleSheet, Text, TouchableOpacity, View } from "react-native"
import type { StyleProp, ViewStyle } from "react-native"

import { colors, fonts } from "../theme"

const FRIEND_AVATARS = [
    { id: 1, initial: "M", color: colors.accent },
    { id: 2, initial: "T", color: colors.sky },
    { id: 3, initial: "K", color: colors.mint },
    { id: 4, initial: "J", color: colors.plum },
] as const

type Props = {
    onConnect: () => void
    onInvite: () => void
    onDismiss: () => void
    style?: StyleProp<ViewStyle>
}

export default function FindYourPeopleCard({ onConnect, onInvite, onDismiss, style }: Props) {
    return (
        <View style={[styles.card, style]}>
            <TouchableOpacity
                style={styles.dismiss}
                onPress={onDismiss}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
                <Text style={styles.dismissX}>✕</Text>
            </TouchableOpacity>
            <View style={styles.topRow}>
                <View style={styles.textBlock}>
                    <Text style={styles.title}>Find your people</Text>
                    <Text style={styles.body}>Compare taste and see more stats.</Text>
                </View>
                <View style={styles.stack}>
                    {FRIEND_AVATARS.map((f, i) => (
                        <View
                            key={f.id}
                            style={[styles.stackAva, { backgroundColor: f.color, marginLeft: i > 0 ? -10 : 0 }]}
                        >
                            <Text style={styles.stackLetter}>{f.initial}</Text>
                        </View>
                    ))}
                </View>
            </View>
            <View style={styles.btns}>
                <TouchableOpacity style={styles.btnPrimary} onPress={onConnect}>
                    <Text style={styles.btnPrimaryText}>Connect contacts</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnSecondary} onPress={onInvite}>
                    <Text style={styles.btnSecondaryText}>Invite</Text>
                </TouchableOpacity>
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    card: {
        borderRadius: 16,
        backgroundColor: colors.mint,
        padding: 12,
        position: "relative",
    },
    dismiss: {
        position: "absolute",
        top: 10,
        right: 10,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: "rgba(255,255,255,0.20)",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1,
    },
    dismissX: {
        color: "#fff",
        fontSize: 11,
        fontWeight: "700",
    },
    topRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        paddingRight: 28,
    },
    textBlock: {
        flex: 1,
        minWidth: 0,
    },
    title: {
        fontFamily: fonts.display,
        fontSize: 16,
        color: "#fff",
    },
    body: {
        fontFamily: fonts.mono,
        fontSize: 11.5,
        color: "#fff",
        opacity: 0.92,
        lineHeight: 16,
        marginTop: 3,
    },
    stack: {
        flexDirection: "row",
        flexShrink: 0,
    },
    stackAva: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 2,
        borderColor: colors.mint,
    },
    stackLetter: {
        color: "#fff",
        fontWeight: "700",
        fontSize: 13,
    },
    btns: {
        flexDirection: "row",
        gap: 8,
        marginTop: 8,
    },
    btnPrimary: {
        flex: 1,
        backgroundColor: "#fff",
        borderRadius: 11,
        paddingVertical: 10,
        alignItems: "center",
    },
    btnPrimaryText: {
        fontFamily: fonts.display,
        fontSize: 12.5,
        color: colors.mint,
    },
    btnSecondary: {
        flex: 1,
        backgroundColor: "rgba(255,255,255,0.18)",
        borderRadius: 11,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.35)",
        alignItems: "center",
    },
    btnSecondaryText: {
        fontFamily: fonts.display,
        fontSize: 12.5,
        color: "#fff",
    },
})
