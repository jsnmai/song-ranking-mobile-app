// Tests for comparison crash/kill recovery (resume prompt).
import { Alert } from "react-native"

import { cancelComparisonSession, finalizeComparisonSession, getActiveComparisonSession } from "../apiRequests"
import { promptResumeIfActiveSession } from "../comparisonResume"

jest.mock("../apiRequests", () => ({
    getActiveComparisonSession: jest.fn(),
    cancelComparisonSession: jest.fn(),
    finalizeComparisonSession: jest.fn(),
}))

const mockGetActive = getActiveComparisonSession as jest.Mock
const mockCancel = cancelComparisonSession as jest.Mock
const mockFinalize = finalizeComparisonSession as jest.Mock

const navigate = jest.fn()
const navigationRef = { isReady: () => true, navigate } as never

type AlertButton = { text: string; onPress?: () => void | Promise<void> }

function pressButton(alertSpy: jest.SpyInstance, label: string): void | Promise<void> {
    const buttons = alertSpy.mock.calls[0][2] as AlertButton[]
    const button = buttons.find((candidate) => candidate.text === label)
    return button?.onPress?.()
}

beforeEach(() => {
    jest.clearAllMocks()
    // Safe promise-returning defaults so .catch()/await never hit an undefined mock return.
    mockGetActive.mockResolvedValue(null)
    mockCancel.mockResolvedValue(undefined)
    mockFinalize.mockResolvedValue({ result: { ranking: {}, rating_event: {} } })
})

describe("promptResumeIfActiveSession", () => {
    it("does nothing when there is no active session", async () => {
        mockGetActive.mockResolvedValue(null)
        const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {})

        await promptResumeIfActiveSession("token", navigationRef)

        expect(alertSpy).not.toHaveBeenCalled()
    })

    it("never blocks launch when the resume lookup fails", async () => {
        mockGetActive.mockRejectedValue(new Error("offline"))
        const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {})

        await expect(promptResumeIfActiveSession("token", navigationRef)).resolves.toBeUndefined()
        expect(alertSpy).not.toHaveBeenCalled()
    })

    it("resumes an active session into the comparison flow", async () => {
        const session = { session_uuid: "s1", status: "active", target_song: { title: "Nights" } }
        mockGetActive.mockResolvedValue(session)
        const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {})

        await promptResumeIfActiveSession("token", navigationRef)
        expect(alertSpy).toHaveBeenCalledTimes(1)
        await pressButton(alertSpy, "Resume")

        expect(navigate).toHaveBeenCalledWith("ComparisonFlow", { session })
    })

    it("finalizes a ready-to-finalize session straight to the score on resume", async () => {
        const session = { session_uuid: "s2", status: "ready_to_finalize", target_song: { title: "X" } }
        mockGetActive.mockResolvedValue(session)
        mockFinalize.mockResolvedValue({ result: { ranking: {}, rating_event: {} } })
        const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {})

        await promptResumeIfActiveSession("token", navigationRef)
        await pressButton(alertSpy, "Resume")

        expect(mockFinalize).toHaveBeenCalledWith("s2", "token")
        expect(navigate).toHaveBeenCalledWith("ScoreReveal", expect.objectContaining({ result: expect.any(Object) }))
    })

    it("does not navigate before the navigation container is ready", async () => {
        const session = { session_uuid: "s4", status: "active", target_song: { title: "Z" } }
        mockGetActive.mockResolvedValue(session)
        const notReadyNavigate = jest.fn()
        const notReadyRef = { isReady: () => false, navigate: notReadyNavigate } as never
        const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {})

        await promptResumeIfActiveSession("token", notReadyRef)
        await pressButton(alertSpy, "Resume")

        expect(notReadyNavigate).not.toHaveBeenCalled()
    })

    it("discards an active session via cancel", async () => {
        const session = { session_uuid: "s3", status: "active", target_song: { title: "Y" } }
        mockGetActive.mockResolvedValue(session)
        const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {})

        await promptResumeIfActiveSession("token", navigationRef)
        await pressButton(alertSpy, "Discard")

        expect(mockCancel).toHaveBeenCalledWith("s3", "token")
    })
})
