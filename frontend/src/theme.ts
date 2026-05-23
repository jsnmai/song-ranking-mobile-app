export const colors = {
    bg: "#f6f3ec",
    paper: "#fbf8f1",
    ink: "#161413",
    inkSoft: "#6f6862",
    inkDim: "#a39d96",
    line: "rgba(22,20,19,0.1)",
    sand: "#e8e1d2",
    clay: "#d8512e",
    like: "#34a853",
    okay: "#e6b800",
    dislike: "#e53935",
}

// sans is undefined — React Native uses the system default until a custom sans font is loaded.
// serif and mono names must match what expo-font registers from @expo-google-fonts.
export const fonts = {
    sans: undefined as string | undefined,
    serif: "Fraunces_700Bold",
    mono: "JetBrainsMono_400Regular",
}

export function bucketColor(bucket: string): string {
    if (bucket === "like") return colors.like
    if (bucket === "okay" || bucket === "alright") return colors.okay
    if (bucket === "dislike") return colors.dislike
    return colors.inkDim
}
