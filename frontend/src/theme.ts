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
    cline: "rgba(245,238,220,0.12)", // hairline border on navy surfaces
    // Legacy alias kept for screen migration
    clay: "#ff5a3c",
    sand: "#e7e1d4",
}

// sans is undefined — React Native uses the system default (Inter-like on iOS).
// serif and mono names must match what expo-font registers from @expo-google-fonts.
export const fonts = {
    sans: undefined as string | undefined,
    serif: "Fraunces_700Bold",
    // Real italic face — RN does not synthesize italics for custom fonts, so set this family
    // directly (rather than fontStyle: "italic") wherever serif text should be italic.
    serifItalic: "Fraunces_700Bold_Italic",
    mono: "JetBrainsMono_400Regular",
    display: "ArchivoBlack_400Regular",
}

export function bucketColor(bucket: string): string {
    if (bucket === "like") return colors.like
    if (bucket === "okay" || bucket === "alright") return colors.okay
    if (bucket === "dislike") return colors.dislike
    return colors.inkDim
}

// Progress-meter gold ramp: a filled segment's colour climbs from a muted gold (first segment) to a
// bright luminous gold (last), so a segmented "rate to unlock" bar shines up as it fills. `index` is
// 0-based; `total` is the segment count (default 10). Shared by the Feed taste meter and the Rankings
// build / lock meters so every progress bar reads the same.
const GOLD_RAMP_DIM = [193, 141, 48]     // #c18d30 — muted gold at the start
const GOLD_RAMP_BRIGHT = [255, 228, 150] // #ffe496 — bright gold at the top
export function goldMeterShade(index: number, total = 10): string {
    const t = total > 1 ? index / (total - 1) : 0
    const mix = (a: number, b: number) => Math.round(a + (b - a) * t)
    const r = mix(GOLD_RAMP_DIM[0], GOLD_RAMP_BRIGHT[0])
    const g = mix(GOLD_RAMP_DIM[1], GOLD_RAMP_BRIGHT[1])
    const b = mix(GOLD_RAMP_DIM[2], GOLD_RAMP_BRIGHT[2])
    return `rgb(${r}, ${g}, ${b})`
}

// One segment ("tick") of a segmented progress meter — the empty/track look. Shared by every
// "rate to unlock" bar (Feed taste meter, Rankings build & lock meters) so their ticks are all the
// same size and thickness. Filled segments override only backgroundColor (via goldMeterShade). Put
// the inter-tick spacing (gap: 4) on the row container.
export const meterSegment = {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(245,238,220,0.15)",
}

// The fixed palette a user can choose for their avatar. The token names mirror
// AvatarColor in backend/src/pydantic_schemas/profile.py.
export const AVATAR_COLOR_TOKENS = ["ink", "accent", "sky", "plum", "mint", "gold"] as const

const AVATAR_PALETTE: Record<string, string> = {
    accent: colors.accent,
    sky: colors.sky,
    plum: colors.plum,
    mint: colors.mint,
    gold: colors.gold,
    ink: colors.ink,
}

// Resolve a stored avatar-color token to a hex color, falling back to `fallback`
// (the surface's established default) when the user has not chosen one.
export function avatarColorToken(token: string | null | undefined, fallback: string): string {
    return (token && AVATAR_PALETTE[token]) || fallback
}

// Resolve a user's avatar background everywhere they appear (feed, profile, lists): their chosen
// color if set, otherwise a stable per-username hue from the same palette — so a given user looks
// identical across surfaces. Use this instead of ad-hoc per-screen hashes.
const AVATAR_FALLBACK_HUES = [colors.accent, colors.sky, colors.plum, colors.mint, colors.gold]
export function avatarColorFor(token: string | null | undefined, username: string): string {
    if (token && AVATAR_PALETTE[token]) return AVATAR_PALETTE[token]
    let hash = 0
    for (let i = 0; i < username.length; i++) hash = username.charCodeAt(i) + ((hash << 5) - hash)
    return AVATAR_FALLBACK_HUES[Math.abs(hash) % AVATAR_FALLBACK_HUES.length]
}
