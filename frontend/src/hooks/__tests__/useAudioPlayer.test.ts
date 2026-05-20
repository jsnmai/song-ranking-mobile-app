// Tests for useAudioPlayer — focuses on cleanup when previewUrl changes.
import { act, renderHook } from "@testing-library/react-native"

import { useAudioPlayer } from "../useAudioPlayer"

const mockPlay = jest.fn()
const mockPause = jest.fn()
const mockRemove = jest.fn()
const mockCreatePlayer = jest.fn()

// Capture the status listener so tests can simulate playback events (e.g. didJustFinish).
let capturedStatusListener: ((status: { didJustFinish: boolean }) => void) | null = null

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
        addListener: (event: string, callback: (status: { didJustFinish: boolean }) => void) => {
            if (event === "playbackStatusUpdate") {
                capturedStatusListener = callback
            }
            return { remove: jest.fn() }
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

        // The useEffect cleanup must have called remove() on the first player.
        expect(mockRemove).toHaveBeenCalledTimes(1)
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
})
