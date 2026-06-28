// Shared padlock glyph used wherever a locked/calibrating state is shown
// (Rankings score "?", anchors, etc.). Mirrors the Feed module lock mark.
import Svg, { Path } from "react-native-svg"

export function LockIcon({ color, size = 14 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z" />
            <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </Svg>
    )
}
