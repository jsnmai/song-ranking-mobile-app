// A single Taste Profile strip tile: shows a label + value, and on tap reveals a
// small dark popover explaining what the stat means (and how it's found). The
// popover is rendered inline instead of as a native Modal, so neighboring taste
// tiles remain immediately tappable while one explainer is open.
import { ReactNode, useEffect, useRef, useState } from "react"
import { Dimensions, Pressable, StyleSheet, StyleProp, Text, View, ViewStyle } from "react-native"

import { colors, fonts } from "../../theme"

// Same charcoal as the streak popover so the explainers read as one family.
const SURFACE = "#1e2029"
const POPOVER_WIDTH = 230
const POPOVER_HEIGHT_ESTIMATE = 112
const POINTER_WIDTH = 18
const POINTER_HEIGHT = 10
const SCREEN_MARGIN = 8
const TILE_FALLBACK_W = 110
const TILE_FALLBACK_H = 108
type PopoverEdge = "start" | "center" | "end"
type AnchorRect = { x: number; y: number; w: number; h: number }
export type PopoverFrame = { x: number; y: number; w: number; h: number }

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), Math.max(min, max))
}

export default function TasteStripTile({
    label,
    value,
    sublabel,
    title,
    description,
    statValue,
    statLabel,
    testID,
    children,
    foot,
    style,
    open,
    onOpenChange,
    popoverEdge = "center",
    viewportBottomInset = 0,
    onPopoverFrameChange,
}: {
    label: string
    // The hero value (e.g. "7" or "Top 12%"). Omit when passing a custom `children` body.
    value?: string
    // Small caption under the value (e.g. "GENRES", "OF RATERS").
    sublabel?: string
    title: string
    description: string
    // Optional prominent stat shown in the popover (e.g. a bold "12 SONGS RATED").
    statValue?: string
    statLabel?: string
    testID?: string
    // Custom hero body in the centered zone (e.g. the Top Artist disc, or the forming icon).
    children?: ReactNode
    // Custom bottom element — overrides the plain `sublabel`.
    foot?: ReactNode
    // Root-card override (e.g. flex weight / minHeight for the shorter Avg Score card).
    style?: StyleProp<ViewStyle>
    // Optional controlled mode lets TasteProfileGrid keep one explainer open and switch
    // directly when a neighboring stat is tapped.
    open?: boolean
    onOpenChange?: (nextOpen: boolean) => void
    popoverEdge?: PopoverEdge
    viewportBottomInset?: number
    onPopoverFrameChange?: (frame: PopoverFrame | null) => void
}) {
    const [localOpen, setLocalOpen] = useState(false)
    const [tileSize, setTileSize] = useState<{ w: number; h: number }>({
        w: TILE_FALLBACK_W,
        h: TILE_FALLBACK_H,
    })
    const [popoverSize, setPopoverSize] = useState<{ w: number; h: number }>({
        w: POPOVER_WIDTH,
        h: POPOVER_HEIGHT_ESTIMATE,
    })
    const [anchor, setAnchor] = useState<AnchorRect | null>(null)
    const anchorRef = useRef<View>(null)
    const isOpen = open ?? localOpen

    const applyOpen = (nextOpen: boolean) => {
        if (onOpenChange) onOpenChange(nextOpen)
        else setLocalOpen(nextOpen)
    }

    const measureAnchor = (fallbackSize?: { w: number; h: number }) => {
        if (!anchorRef.current?.measureInWindow) return

        anchorRef.current.measureInWindow((x, y, w, h) => {
            const measured = {
                x,
                y,
                w: w || fallbackSize?.w || tileSize.w,
                h: h || fallbackSize?.h || tileSize.h,
            }
            setAnchor(measured)
            setTileSize((prev) => (
                prev.w === measured.w && prev.h === measured.h ? prev : { w: measured.w, h: measured.h }
            ))
        })
    }

    const toggle = () => {
        const nextOpen = !isOpen
        if (!nextOpen) {
            applyOpen(false)
            return
        }

        applyOpen(true)
        measureAnchor()
    }

    const fallbackLeft =
        popoverEdge === "start"
            ? 0
            : popoverEdge === "end"
                ? tileSize.w - POPOVER_WIDTH
                : tileSize.w / 2 - POPOVER_WIDTH / 2
    const windowSize = Dimensions.get("window")
    const anchorCenterX = anchor ? anchor.x + anchor.w / 2 : tileSize.w / 2
    const targetScreenLeft = anchor
        ? popoverEdge === "start"
            ? anchor.x
            : popoverEdge === "end"
                ? anchor.x + anchor.w - POPOVER_WIDTH
                : anchorCenterX - POPOVER_WIDTH / 2
        : anchorCenterX - POPOVER_WIDTH / 2
    const screenLeft = clamp(targetScreenLeft, SCREEN_MARGIN, windowSize.width - POPOVER_WIDTH - SCREEN_MARGIN)
    const popoverLeft = anchor ? screenLeft - anchor.x : fallbackLeft
    const popoverHeight = popoverSize.h || POPOVER_HEIGHT_ESTIMATE
    const belowTop = anchor ? anchor.y + anchor.h + POINTER_HEIGHT : tileSize.h + POINTER_HEIGHT
    const aboveTop = anchor ? anchor.y - popoverHeight - POINTER_HEIGHT : -popoverHeight - POINTER_HEIGHT
    const visibleBottom = windowSize.height - viewportBottomInset
    const fitsBelow = belowTop + popoverHeight <= visibleBottom - SCREEN_MARGIN
    const fitsAbove = aboveTop >= SCREEN_MARGIN
    const placeAbove = Boolean(anchor && !fitsBelow && fitsAbove)
    const screenTop = placeAbove
        ? aboveTop
        : clamp(belowTop, SCREEN_MARGIN, visibleBottom - popoverHeight - SCREEN_MARGIN)
    const popoverTop = anchor ? screenTop - anchor.y : tileSize.h + POINTER_HEIGHT
    const pointerCenter = clamp(
        anchor ? anchorCenterX - screenLeft : tileSize.w / 2 - popoverLeft,
        18,
        POPOVER_WIDTH - 18,
    )
    const pointerLeft = Math.round(pointerCenter - POINTER_WIDTH / 2)
    const popoverReady = Boolean(anchor)

    useEffect(() => {
        if (!onPopoverFrameChange) return
        if (!isOpen || !anchor || !popoverReady) {
            onPopoverFrameChange(null)
            return
        }
        onPopoverFrameChange({ x: screenLeft, y: screenTop, w: POPOVER_WIDTH, h: popoverHeight })
    }, [anchor, isOpen, onPopoverFrameChange, popoverHeight, popoverReady, screenLeft, screenTop])

    return (
        <View
            ref={anchorRef}
            collapsable={false}
            pointerEvents="box-none"
            onLayout={(event) => {
                const { width, height } = event.nativeEvent.layout
                const nextSize = { w: width || tileSize.w, h: height || tileSize.h }
                setTileSize((prev) => (
                    prev.w === nextSize.w && prev.h === nextSize.h ? prev : nextSize
                ))
                requestAnimationFrame(() => measureAnchor(nextSize))
            }}
            style={[styles.tile, isOpen ? styles.tileOpen : null, style]}
        >
            <Pressable
                onPressIn={() => measureAnchor()}
                onPress={toggle}
                style={styles.tileInner}
                accessibilityRole="button"
                accessibilityLabel={`${title}. ${description}`}
                testID={testID}
            >
                {/* Label pinned to the top, hero centered in the leftover height, caption pinned to
                    the bottom — the Bento Orbit DCard column, so labels and captions align across a
                    row of tiles whatever each hero's intrinsic height is. */}
                <Text style={styles.label}>{label}</Text>
                <View style={styles.heroZone}>
                    {children ?? (value !== undefined ? (
                        <Text
                            style={styles.value}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.55}
                        >
                            {value}
                        </Text>
                    ) : null)}
                </View>
                {foot ?? (
                    sublabel ? <Text style={styles.sublabel}>{sublabel}</Text> : <View style={styles.subSpacer} />
                )}
            </Pressable>
            {isOpen ? (
                <View
                    pointerEvents="none"
                    onLayout={(event) => {
                        const { width, height } = event.nativeEvent.layout
                        setPopoverSize((prev) => (
                            prev.w === width && prev.h === height ? prev : { w: width, h: height }
                        ))
                    }}
                    style={[
                        styles.popover,
                        !popoverReady ? styles.popoverHidden : null,
                        { top: popoverTop, left: popoverLeft },
                    ]}
                    testID={testID ? `${testID}-popover` : undefined}
                >
                    <View
                        style={[
                            styles.pointer,
                            placeAbove ? styles.pointerBelow : styles.pointerAbove,
                            { left: pointerLeft },
                        ]}
                    />
                    <Text style={styles.popTitle}>{title}</Text>
                    {statValue ? (
                        <View style={styles.statRow}>
                            <Text style={styles.statValue}>{statValue}</Text>
                            {statLabel ? <Text style={styles.statLabel}>{statLabel}</Text> : null}
                        </View>
                    ) : null}
                    <Text style={styles.popDesc}>{description}</Text>
                </View>
            ) : null}
        </View>
    )
}

const styles = StyleSheet.create({
    // Each tile is its own bordered/shadowed card (the design's DCard), so a row of them reads as
    // the same visual family across both profile screens. No height floor: tiles in a flex row
    // stretch to their tallest sibling, so content sizes the row and no card reserves dead air.
    tile: {
        flex: 1,
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 16,
        paddingTop: 14,
        paddingBottom: 13,
        paddingHorizontal: 10,
        shadowColor: colors.ink,
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        position: "relative",
    },
    tileOpen: {
        zIndex: 30,
        elevation: 30,
    },
    // Label pinned top, hero centered, sublabel pinned bottom: every tile's label sits on the same
    // line and the captions align across the row, so the set reads as one tidy unit.
    tileInner: {
        flex: 1,
        alignItems: "center",
        justifyContent: "space-between",
    },
    heroZone: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingVertical: 2,
    },
    label: {
        fontFamily: fonts.mono,
        fontSize: 8.5,
        letterSpacing: 1.3,
        color: colors.accent,
        fontWeight: "700",
        textAlign: "center",
    },
    value: {
        fontFamily: fonts.display,
        fontSize: 30,
        letterSpacing: -0.5,
        color: colors.ink,
        textAlign: "center",
    },
    sublabel: {
        fontFamily: fonts.mono,
        fontSize: 8,
        letterSpacing: 1,
        fontWeight: "700",
        color: colors.inkDim,
        textAlign: "center",
    },
    // Keeps the top group pinned up when a tile has no sublabel (space-between needs a 2nd child).
    subSpacer: {
        height: 0,
    },
    popover: {
        position: "absolute",
        width: POPOVER_WIDTH,
        backgroundColor: SURFACE,
        borderRadius: 13,
        paddingVertical: 13,
        paddingHorizontal: 14,
        shadowColor: colors.ink,
        shadowOpacity: 0.34,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 12 },
        elevation: 12,
        zIndex: 40,
    },
    popoverHidden: {
        opacity: 0,
    },
    pointer: {
        position: "absolute",
        width: 0,
        height: 0,
        backgroundColor: "transparent",
        borderLeftWidth: POINTER_WIDTH / 2,
        borderRightWidth: POINTER_WIDTH / 2,
        borderLeftColor: "transparent",
        borderRightColor: "transparent",
    },
    pointerAbove: {
        top: -POINTER_HEIGHT,
        borderBottomWidth: POINTER_HEIGHT,
        borderBottomColor: SURFACE,
    },
    pointerBelow: {
        bottom: -POINTER_HEIGHT,
        borderTopWidth: POINTER_HEIGHT,
        borderTopColor: SURFACE,
    },
    popTitle: {
        fontFamily: fonts.display,
        fontSize: 14,
        letterSpacing: -0.2,
        color: "#fff",
        marginBottom: 5,
    },
    statRow: {
        flexDirection: "row",
        alignItems: "baseline",
        gap: 6,
        marginTop: 1,
        marginBottom: 7,
    },
    statValue: {
        fontFamily: fonts.display,
        fontSize: 28,
        letterSpacing: -0.5,
        color: "#fff",
        lineHeight: 30,
    },
    statLabel: {
        fontFamily: fonts.mono,
        fontSize: 8,
        letterSpacing: 1.2,
        fontWeight: "700",
        color: "rgba(241,236,221,0.6)",
    },
    popDesc: {
        fontFamily: fonts.sans,
        fontSize: 11,
        color: "rgba(241,236,221,0.72)",
        lineHeight: 15,
    },
})
