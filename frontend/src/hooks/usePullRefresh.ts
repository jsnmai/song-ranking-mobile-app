import { useCallback, useState } from "react"

// Keep the spinner up for at least this long. Most fetches return faster than the wheel takes to
// settle, so without a floor the list snaps back up mid-spin and the content slides over the wheel.
// Holding `refreshing` true for a beat lets the list rest at the refresh position, finish the spin,
// then animate up cleanly — the polished feel you get in most apps.
const MIN_SPINNER_MS = 700

export function usePullRefresh(refresh: () => Promise<unknown>) {
    const [refreshing, setRefreshing] = useState(false)
    const onRefresh = useCallback(async () => {
        setRefreshing(true)
        const minHold = new Promise((resolve) => setTimeout(resolve, MIN_SPINNER_MS))
        try {
            // Wait for BOTH the reload and the minimum hold, so a fast fetch can't cut the spin short.
            await Promise.all([refresh(), minHold])
        } finally {
            setRefreshing(false)
        }
    }, [refresh])
    return { refreshing, onRefresh }
}
