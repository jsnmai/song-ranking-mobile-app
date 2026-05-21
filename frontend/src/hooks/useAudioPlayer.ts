// Shared hook for 30-second preview playback. One instance per song card.
import { useCallback, useEffect, useRef, useState } from "react"
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from "expo-audio"

// expo-audio replaces expo-av for Expo Go SDK 52+. expo-av requires a dev build.
type AudioPlayerResult = {
    isPlaying: boolean;
    toggle: () => void;
    stop: () => void;
}

export function useAudioPlayer(previewUrl: string | null): AudioPlayerResult {
    const [isPlaying, setIsPlaying] = useState(false)
    // useRef persists the AudioPlayer object across renders without causing re-renders.
    const playerRef = useRef<AudioPlayer | null>(null)
    const statusSubscriptionRef = useRef<{ remove: () => void } | null>(null)

    useEffect(() => {
        // Allow audio to play even when the iOS silent switch is on.
        setAudioModeAsync({ playsInSilentMode: true })
    }, [])

    const stop = useCallback(() => {
        const player = playerRef.current

        statusSubscriptionRef.current?.remove()
        statusSubscriptionRef.current = null

        if (player !== null) {
            // pause() stops playback immediately; remove() releases the native player object.
            player.pause()
            player.remove()
            playerRef.current = null
        }
        setIsPlaying(false)
    }, [])

    useEffect(() => {
        // When previewUrl changes (candidate advances in ComparisonFlow), remove the old player.
        // stop() is synchronous, so this cleanup is truly sync unlike expo-av's unloadAsync.
        return () => {
            stop()
        }
    }, [previewUrl, stop])

    const toggle = useCallback(() => {
        if (previewUrl === null) {
            return
        }

        // Pause if already playing.
        if (isPlaying && playerRef.current !== null) {
            playerRef.current.pause()
            setIsPlaying(false)
            return
        }

        // Resume if paused but player is still loaded.
        if (!isPlaying && playerRef.current !== null) {
            playerRef.current.play()
            setIsPlaying(true)
            return
        }

        // First play — createAudioPlayer and play() are synchronous; native layer buffers internally.
        const player = createAudioPlayer(previewUrl)
        statusSubscriptionRef.current = player.addListener("playbackStatusUpdate", (status) => {
            if (status.didJustFinish) {
                setIsPlaying(false)
            }
        })
        player.play()
        playerRef.current = player
        setIsPlaying(true)
    }, [previewUrl, isPlaying])

    return { isPlaying, toggle, stop }
}
