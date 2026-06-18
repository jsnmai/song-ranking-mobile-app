import { useAuth } from "../features/auth/AuthContext"

// The numeric scoring layer is "locked" until the current user has rated enough
// songs to calibrate. Below the threshold we hide the viewer's OWN score numbers
// and ranking positions everywhere (Score Reveal, Song Detail, their feed
// activity, their Rankings/anchors, their Profile modules) and show the bucket
// (LIKE / OKAY / DISLIKE) instead. Other people's scores are NOT affected.
export const SCORE_UNLOCK_THRESHOLD = 10

// Whether the current user's own scores/placements are still locked.
export function useScoresLocked(): boolean {
    const { profile } = useAuth()
    return (profile?.user_stats?.rated_count ?? 0) < SCORE_UNLOCK_THRESHOLD
}

// How many more ratings the current user needs before scores unlock (0 once
// unlocked) — for "N more to unlock" copy.
export function useRatingsUntilUnlock(): number {
    const { profile } = useAuth()
    const rated = profile?.user_stats?.rated_count ?? 0
    return Math.max(0, SCORE_UNLOCK_THRESHOLD - rated)
}
