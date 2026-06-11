// Stroked line icons for the Settings / Privacy / Blocked screens.
// Paths mirror the Bento Orbit design kit so these surfaces match the mockups.
import { ReactNode } from "react"
import Svg, { Circle, Path, Rect } from "react-native-svg"

import { colors } from "../../theme"

type IconProps = {
    size?: number;
    color?: string;
}

// Shared <Svg> wrapper for the round-capped stroke icons used across settings.
function Stroke({ size = 18, color = colors.inkSoft, children }: IconProps & { children: ReactNode }) {
    return (
        <Svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke={color}
            strokeWidth={1.9}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            {children}
        </Svg>
    )
}

export function LockIcon(props: IconProps) {
    return (
        <Stroke {...props}>
            <Rect x={5} y={11} width={14} height={9} rx={2} />
            <Path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </Stroke>
    )
}

export function GlobeIcon(props: IconProps) {
    return (
        <Stroke {...props}>
            <Circle cx={12} cy={12} r={9} />
            <Path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" />
        </Stroke>
    )
}

export function FriendsIcon(props: IconProps) {
    return (
        <Stroke {...props}>
            <Circle cx={9} cy={8} r={3.4} />
            <Path d="M3 20c0-3.4 2.7-5.6 6-5.6s6 2.2 6 5.6" />
            <Path d="M16 4.4a3.4 3.4 0 0 1 0 6.8M18 14.6c2.2.6 3.8 2.5 3.8 5.4" />
        </Stroke>
    )
}

export function BlockIcon(props: IconProps) {
    return (
        <Stroke {...props}>
            <Circle cx={12} cy={12} r={9} />
            <Path d="M5.6 5.6 18.4 18.4" />
        </Stroke>
    )
}

export function FlagIcon(props: IconProps) {
    return (
        <Stroke {...props}>
            <Path d="M5 21V4M5 4h11l-2 4 2 4H5" />
        </Stroke>
    )
}

export function InfoIcon(props: IconProps) {
    return (
        <Stroke {...props}>
            <Circle cx={12} cy={12} r={9} />
            <Path d="M12 11v5M12 8h.01" />
        </Stroke>
    )
}

export function ChevronIcon(props: IconProps) {
    return (
        <Stroke {...props}>
            <Path d="m9 5 7 7-7 7" />
        </Stroke>
    )
}

export function LogoutIcon(props: IconProps) {
    return (
        <Stroke {...props}>
            <Path d="M14 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2" />
            <Path d="M18 12H9M15 9l3 3-3 3" />
        </Stroke>
    )
}

export function TrashIcon(props: IconProps) {
    return (
        <Stroke {...props}>
            <Path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
            <Path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
        </Stroke>
    )
}

export function BackIcon(props: IconProps) {
    return (
        <Stroke color={colors.ink} {...props}>
            <Path d="M15 18l-6-6 6-6" />
        </Stroke>
    )
}
