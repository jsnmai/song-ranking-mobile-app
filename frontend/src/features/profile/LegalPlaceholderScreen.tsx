// Placeholder Help & Legal screen. Final legal documents and links are launch-readiness work.
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { NativeStackScreenProps } from "@react-navigation/native-stack"

import { AppStackParamList } from "../../navigation/types"
import { colors, fonts } from "../../theme"

type LegalPlaceholderProps = NativeStackScreenProps<AppStackParamList, "LegalPlaceholder">
type LegalPlaceholderKind = AppStackParamList["LegalPlaceholder"]["kind"]

type LegalPlaceholderContent = {
    title: string;
    body: string;
    placeholder?: string;
    guidelines?: string[];
    footer: string;
}

const PLACEHOLDER_CONTENT: Record<LegalPlaceholderKind, LegalPlaceholderContent> = {
    support: {
        title: "Support",
        body: "Need help with LISTN? A support contact will be finalized before public launch.",
        placeholder: "TODO_SUPPORT_EMAIL",
        footer: "This support contact must be finalized before public beta or App Store submission.",
    },
    privacy: {
        title: "Privacy Policy",
        body: "LISTN's Privacy Policy will be finalized before public launch. It will describe what data "
            + "LISTN collects, how ratings and social activity are used, account deletion, reporting, "
            + "age restrictions, and privacy controls.",
        footer: "This is a placeholder, not final legal text.",
    },
    terms: {
        title: "Terms of Service",
        body: "LISTN's Terms of Service will be finalized before public launch. They will describe "
            + "account rules, acceptable use, user content, safety expectations, and service limitations.",
        footer: "This is a placeholder, not final legal text.",
    },
    guidelines: {
        title: "Community Guidelines",
        body: "LISTN is for sharing music taste respectfully.",
        guidelines: [
            "Be respectful.",
            "Do not harass, threaten, impersonate, or abuse others.",
            "Do not post hateful, illegal, or harmful content.",
            "Do not spam reports or social actions.",
            "Do not create an account if you are under 13.",
            "Reports may be reviewed and actioned.",
        ],
        footer: "These guidelines are a placeholder and must be finalized before public launch.",
    },
}

export default function LegalPlaceholderScreen({ navigation, route }: LegalPlaceholderProps) {
    const content = PLACEHOLDER_CONTENT[route.params.kind]

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.headerRow}>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>
                <Text style={styles.kicker}>HELP & LEGAL</Text>
            </View>

            <Text style={styles.title}>{content.title}</Text>
            <Text style={styles.body}>{content.body}</Text>

            {content.placeholder ? (
                <View style={styles.placeholderBox}>
                    <Text style={styles.placeholderLabel}>INTERNAL PLACEHOLDER</Text>
                    <Text style={styles.placeholderText}>{content.placeholder}</Text>
                </View>
            ) : null}

            {content.guidelines ? (
                <View style={styles.guidelineList}>
                    {content.guidelines.map((guideline) => (
                        <View key={guideline} style={styles.guidelineRow}>
                            <Text style={styles.bullet}>-</Text>
                            <Text style={styles.guidelineText}>{guideline}</Text>
                        </View>
                    ))}
                </View>
            ) : null}

            <Text style={styles.footer}>{content.footer}</Text>
        </ScrollView>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.bg,
    },
    content: {
        paddingHorizontal: 18,
        paddingTop: 58,
        paddingBottom: 36,
    },
    headerRow: {
        alignItems: "center",
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 24,
    },
    backButton: {
        paddingVertical: 8,
        paddingRight: 12,
    },
    backText: {
        fontFamily: fonts.mono,
        color: colors.ink,
        fontSize: 13,
        letterSpacing: 0.4,
    },
    kicker: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 10,
        letterSpacing: 1.8,
    },
    title: {
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 34,
        lineHeight: 38,
        marginBottom: 16,
    },
    body: {
        color: colors.ink,
        fontSize: 16,
        lineHeight: 24,
        marginBottom: 18,
    },
    placeholderBox: {
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 8,
        backgroundColor: colors.paper,
        padding: 14,
        marginBottom: 18,
    },
    placeholderLabel: {
        fontFamily: fonts.mono,
        color: colors.inkSoft,
        fontSize: 10,
        letterSpacing: 1.2,
        marginBottom: 8,
    },
    placeholderText: {
        fontFamily: fonts.mono,
        color: colors.ink,
        fontSize: 14,
    },
    guidelineList: {
        gap: 10,
        marginBottom: 18,
    },
    guidelineRow: {
        flexDirection: "row",
        gap: 10,
    },
    bullet: {
        color: colors.clay,
        fontSize: 18,
        lineHeight: 24,
    },
    guidelineText: {
        flex: 1,
        color: colors.ink,
        fontSize: 15,
        lineHeight: 23,
    },
    footer: {
        borderTopWidth: 1,
        borderTopColor: colors.line,
        color: colors.inkSoft,
        fontSize: 14,
        lineHeight: 20,
        paddingTop: 14,
    },
})
