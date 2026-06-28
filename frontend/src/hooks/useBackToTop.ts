// Wiring for the floating "back to top" button on long lists: tracks scroll offset, flips
// visibility past a threshold, and exposes a ref + handlers for FlashList / FlatList.
import { useCallback, useRef, useState } from "react"
import { NativeScrollEvent, NativeSyntheticEvent } from "react-native"

// Show the button after a small amount of scrolling (~a couple of rows) — i.e. as soon as the
// top is far enough away that scrolling back up is worthwhile. Kept low so it appears during
// normal scrolling on lists only a little taller than the screen, not just on overscroll. A
// list too short to scroll this far never reaches it, so short lists stay uncluttered.
const SHOW_THRESHOLD = 200

type ScrollableRef = {
    scrollToOffset?: (params: { offset: number; animated?: boolean }) => void;
}

export function useBackToTop() {
    const listRef = useRef<ScrollableRef | null>(null)
    const [showBackToTop, setShowBackToTop] = useState(false)

    const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
        // How far the list can actually scroll. A short list (e.g. 4 cards) has little or no
        // real scroll range, so the only way its offset crosses the threshold is the rubber-band
        // bounce past the bottom — gating on this keeps the button hidden there. A genuinely
        // scrollable list keeps offset > threshold even while bottom-overscrolling, so no flicker.
        const maxOffset = contentSize.height - layoutMeasurement.height
        const canScroll = maxOffset > SHOW_THRESHOLD
        // useState bails out when the boolean is unchanged, so this stays cheap per scroll tick.
        setShowBackToTop(canScroll && contentOffset.y > SHOW_THRESHOLD)
    }, [])

    const scrollToTop = useCallback(() => {
        listRef.current?.scrollToOffset?.({ offset: 0, animated: true })
    }, [])

    return { listRef, showBackToTop, onScroll, scrollToTop }
}
