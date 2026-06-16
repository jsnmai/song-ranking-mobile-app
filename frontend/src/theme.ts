export const colors = {
    // Warm paper surfaces
    bg: "#f1ede4",
    paper: "#fdfbf4",
    paper2: "#e7e1d4",
    // Text
    ink: "#11131c",
    inkSoft: "#3d4350",
    inkDim: "#8b8f9c",
    // Borders
    line: "rgba(17,19,28,0.10)",
    line2: "rgba(17,19,28,0.06)",
    // Bucket system — final design spec
    like: "#ff5a3c",     // accent (orange-red)
    okay: "#5b8def",     // sky (blue)
    dislike: "#7a3ad0",  // plum (purple)
    // Additional tokens
    accent: "#ff5a3c",
    sky: "#5b8def",
    plum: "#7a3ad0",
    mint: "#1f9d77",     // success / match moment
    berry: "#bf3f68",    // co-sign
    teal: "#0fa3a8",     // taste compatibility
    butter: "#f5c343",   // trending / highlight
    gold: "#f5b840",     // FAB / cosmic orbit
    danger: "#e0492e",
    // Cosmic orbit dark surface
    navy: "#11141d",
    navyHi: "#1b2230",
    navy2: "#0b0d14",
    cream: "#f1ecdd",   // text on navy surfaces
    cdim: "#79809a",    // dimmed text on navy
    // Legacy alias kept for screen migration
    clay: "#ff5a3c",
    sand: "#e7e1d4",
}

// sans is undefined — React Native uses the system default (Inter-like on iOS).
// serif and mono names must match what expo-font registers from @expo-google-fonts.
export const fonts = {
    sans: undefined as string | undefined,
    serif: "Fraunces_700Bold",
    mono: "JetBrainsMono_400Regular",
    display: "ArchivoBlack_400Regular",
}

export function bucketColor(bucket: string): string {
    if (bucket === "like") return colors.like
    if (bucket === "okay" || bucket === "alright") return colors.okay
    if (bucket === "dislike") return colors.dislike
    return colors.inkDim
}

// The fixed palette a user can choose for their avatar. The token names mirror
// AvatarColor in backend/src/pydantic_schemas/profile.py.
export const AVATAR_COLOR_TOKENS = ["accent", "sky", "plum", "mint", "gold"] as const

const AVATAR_PALETTE: Record<string, string> = {
    accent: colors.accent,
    sky: colors.sky,
    plum: colors.plum,
    mint: colors.mint,
    gold: colors.gold,
}

// Resolve a stored avatar-color token to a hex color, falling back to `fallback`
// (the surface's established default) when the user has not chosen one.
export function avatarColorToken(token: string | null | undefined, fallback: string): string {
    return (token && AVATAR_PALETTE[token]) || fallback
}
