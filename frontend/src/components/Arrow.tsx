// Shared inline arrow for "section link" labels (VIEW ALL →, VIEW LOG ↗, etc.).
// Drawn as SVG rather than the Unicode → / ↗ glyphs so every arrow has the same
// stroke weight and renders identically across devices/fonts — the glyphs fall
// back to the system font and the diagonal ↗ comes out lighter than →.
import { StyleProp, Text, TextStyle, View } from "react-native"
import Svg, { Path } from "react-native-svg"

export type ArrowDirection = "right" | "up-right"

export function Arrow({
    direction,
    color,
    size = 11,
}: {
    direction: ArrowDirection
    color: string
    size?: number
}) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <Path
                d={direction === "right" ? "M5 12H19M12 5L19 12L12 19" : "M7 17L17 7M7 7H17V17"}
                stroke={color}
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    )
}

// A label + trailing arrow laid out in a row. `textStyle` controls the text;
// `color` should match it so the arrow reads as the same ink.
export function ArrowLabel({
    text,
    direction,
    color,
    textStyle,
    size = 11,
    gap = 4,
}: {
    text: string
    direction: ArrowDirection
    color: string
    textStyle?: StyleProp<TextStyle>
    size?: number
    gap?: number
}) {
    return (
        <View style={{ flexDirection: "row", alignItems: "center", gap }}>
            <Text style={textStyle}>{text}</Text>
            <Arrow direction={direction} color={color} size={size} />
        </View>
    )
}
