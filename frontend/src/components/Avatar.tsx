import { Image, StyleSheet, Text, View } from "react-native"
import { fonts } from "../theme"

type AvatarProps = {
    initial: string
    color: string
    size?: number
    imageUri?: string | null
    testID?: string
}

// Canonical "current user" avatar — a true circle, initials-on-color today. Pass
// imageUri once profile pictures ship and it swaps to a photo with no other changes.
// Used everywhere the signed-in user's avatar appears (Profile identity card, screen
// header buttons) so it always matches whatever they've chosen on their Profile.
export default function Avatar({ initial, color, size = 32, imageUri, testID }: AvatarProps) {
    const shape = { width: size, height: size, borderRadius: size / 2 }

    if (imageUri) {
        return <Image testID={testID} source={{ uri: imageUri }} style={[styles.image, shape]} />
    }

    return (
        <View testID={testID} style={[styles.circle, shape, { backgroundColor: color }]}>
            <Text style={[styles.letter, { fontSize: size * 0.42, lineHeight: size * 0.5 }]}>
                {initial.toUpperCase()}
            </Text>
        </View>
    )
}

const styles = StyleSheet.create({
    circle: {
        alignItems: "center",
        justifyContent: "center",
    },
    image: {
        resizeMode: "cover",
    },
    letter: {
        fontFamily: fonts.display,
        color: "#fff",
    },
})
