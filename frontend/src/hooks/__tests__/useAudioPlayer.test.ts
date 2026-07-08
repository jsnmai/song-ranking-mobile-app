// Tests for useAudioPlayer — focuses on cleanup when previewUrl changes.
import { act, renderHook } from "@testing-library/react-native"

import { useAudioPlayer } from "../useAudioPlayer"

const mockPlay = jest.fn()
const mockPause = jest.fn()
const mockRemove = jest.fn()
const mockRemoveListener = jest.fn()
const mockCreatePlayer = jest.fn()

// Capture the status listener so tests can simulate playback events (e.g. didJustFinish).
type MockStatus = { didJustFinish?: boolean; currentTime?: number; duration?: number; playbackState?: string }
let capturedStatusListener: ((status: MockStatus) => void) | null = null

jest.mock("expo-audio", () => ({
    createAudioPlayer: (...args: unknown[]) => mockCreatePlayer(...args),
    setAudioModeAsync: jest.fn(),
}))

beforeEach(() => {
    jest.resetAllMocks()
    capturedStatusListener = null
    mockCreatePlayer.mockReturnValue({
        play: mockPlay,
        pause: mockPause,
        remove: mockRemove,
        addListener: (event: string, callback: (status: MockStatus) => void) => {
            if (event === "playbackStatusUpdate") {
                capturedStatusListener = callback
            }
            return { remove: mockRemoveListener }
        },
    })
})

describe("useAudioPlayer", () => {
    it("unloads the old player when previewUrl changes after playing", () => {
        const { result, rerender } = renderHook(
            ({ url }: { url: string | null }) => useAudioPlayer(url),
            { initialProps: { url: "https://example.com/preview1.mp3" } },
        )

        act(() => {
            result.current.toggle()
        })
        expect(mockCreatePlayer).toHaveBeenCalledTimes(1)
        expect(result.current.isPlaying).toBe(true)

        // Simulate the candidate advancing — previewUrl changes to a new song.
        act(() => {
            rerender({ url: "https://example.com/preview2.mp3" })
        })

        // The useEffect cleanup must have stopped and released the first player.
        expect(mockPause).toHaveBeenCalledTimes(1)
        expect(mockRemove).toHaveBeenCalledTimes(1)
        expect(mockRemoveListener).toHaveBeenCalledTimes(1)
        // State resets so the next toggle() starts a fresh player.
        expect(result.current.isPlaying).toBe(false)
    })

    it("does not double-remove when stop() is called before previewUrl changes", () => {
        // This mirrors handleChoice: stop() runs first, then setSession() changes the URL.
        const { result, rerender } = renderHook(
            ({ url }: { url: string | null }) => useAudioPlayer(url),
            { initialProps: { url: "https://example.com/preview1.mp3" } },
        )

        act(() => {
            result.current.toggle()
        })

        // stop() removes the player and nulls the ref — same as what handleChoice does.
        act(() => {
            result.current.stop()
        })
        expect(mockPause).toHaveBeenCalledTimes(1)
        expect(mockRemove).toHaveBeenCalledTimes(1)

        // Now previewUrl changes (setSession fires in handleChoice after stop()).
        act(() => {
            rerender({ url: "https://example.com/preview2.mp3" })
        })

        // The cleanup finds playerRef.current === null and makes no second remove call.
        expect(mockRemove).toHaveBeenCalledTimes(1)
    })

    it("does not create a player when previewUrl is null", () => {
        const { result } = renderHook(() => useAudioPlayer(null))

        act(() => {
            result.current.toggle()
        })

        expect(mockCreatePlayer).not.toHaveBeenCalled()
        expect(result.current.isPlaying).toBe(false)
    })

    it("pauses without removing the player when toggle is called while playing", () => {
        const { result } = renderHook(() => useAudioPlayer("https://example.com/preview.mp3"))

        act(() => {
            result.current.toggle()
        })
        expect(result.current.isPlaying).toBe(true)

        act(() => {
            result.current.toggle()
        })

        // Pause keeps the player alive so resume does not need another createAudioPlayer call.
        expect(mockPause).toHaveBeenCalledTimes(1)
        expect(mockRemove).not.toHaveBeenCalled()
        expect(result.current.isPlaying).toBe(false)
    })

    it("pauses and releases the player when unmounted", () => {
        const { result, unmount } = renderHook(() => useAudioPlayer("https://example.com/preview.mp3"))

        act(() => {
            result.current.toggle()
        })

        unmount()

        expect(mockPause).toHaveBeenCalledTimes(1)
        expect(mockRemove).toHaveBeenCalledTimes(1)
        expect(mockRemoveListener).toHaveBeenCalledTimes(1)
    })

    it("resets isPlaying when the clip finishes", () => {
        const { result } = renderHook(() => useAudioPlayer("https://example.com/preview.mp3"))

        act(() => {
            result.current.toggle()
        })
        expect(result.current.isPlaying).toBe(true)

        // Simulate the 30-second clip reaching the end.
        act(() => {
            capturedStatusListener?.({ didJustFinish: true })
        })

        expect(result.current.isPlaying).toBe(false)
    })

    it("tears down and reports failure when the native player fails to load the source", () => {
        // Regression: a dead URL (404 / non-media response) used to leave the UI stuck on
        // "playing" at 0:00 forever — play() is optimistic and a failed player never advances.
        const onPlaybackFailed = jest.fn()
        const { result } = renderHook(() =>
            useAudioPlayer("https://cdn.example-music.test/dead-preview.mp3", onPlaybackFailed),
        )

        act(() => {
            result.current.toggle()
        })
        expect(result.current.isPlaying).toBe(true)

        // iOS reports AVPlayer.Status.failed as playbackState "failed" on the status stream.
        act(() => {
            capturedStatusListener?.({ playbackState: "failed" })
        })

        expect(result.current.isPlaying).toBe(false)
        expect(mockRemove).toHaveBeenCalledTimes(1)
        expect(mockRemoveListener).toHaveBeenCalledTimes(1)
        expect(onPlaybackFailed).toHaveBeenCalledTimes(1)
    })

    it("reports failure and stays stopped when player creation throws", () => {
        const onPlaybackFailed = jest.fn()
        mockCreatePlayer.mockImplementation(() => {
            throw new Error("invalid source")
        })
        const { result } = renderHook(() =>
            useAudioPlayer("not-a-real-url", onPlaybackFailed),
        )

        act(() => {
            result.current.toggle()
        })

        expect(result.current.isPlaying).toBe(false)
        expect(onPlaybackFailed).toHaveBeenCalledTimes(1)
    })

    it("does not fire the failure callback on ordinary status updates", () => {
        const onPlaybackFailed = jest.fn()
        const { result } = renderHook(() =>
            useAudioPlayer("https://cdn.example-music.test/preview.mp3", onPlaybackFailed),
        )

        act(() => {
            result.current.toggle()
        })
        act(() => {
            capturedStatusListener?.({ playbackState: "readyToPlay", currentTime: 3, duration: 30 })
            capturedStatusListener?.({ didJustFinish: true })
        })

        expect(result.current.currentTime).toBe(0) // reset by didJustFinish
        expect(result.current.duration).toBe(30)
        expect(onPlaybackFailed).not.toHaveBeenCalled()
    })
})
