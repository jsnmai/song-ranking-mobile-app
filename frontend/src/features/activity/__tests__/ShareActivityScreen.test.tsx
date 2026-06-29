// Tests for the activity share art screen: it renders the activity poster and the Save/Share
// actions capture the poster and route it to the photo library / system share sheet.
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import ShareActivityScreen from "../ShareActivityScreen"
import { ActivityShareData } from "../../../navigation/types"
import { captureRef } from "react-native-view-shot"
import * as MediaLibrary from "expo-media-library"
import * as Sharing from "expo-sharing"

const mockGoBack = jest.fn()

jest.mock("react-native-safe-area-context", () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

const activity: ActivityShareData = {
    username: "jasonmai",
    initial: "J",
    avatarColor: "#11131c",
    actionLabel: "rated",
    timeAgo: "2h",
    song: { title: "Nights", artist: "Frank Ocean", cover_url: "https://example.com/c.jpg" },
    bucket: "like",
    score: 8.7,
    hideScore: false,
    note: "a whole journey in one track",
}

function renderScreen() {
    const navigation = { goBack: mockGoBack } as never
    const route = { params: { activity } } as never
    return render(<ShareActivityScreen navigation={navigation} route={route} />)
}

describe("ShareActivityScreen", () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it("renders the activity poster with the author's @handle for discovery", () => {
        renderScreen()
        expect(screen.getByText("@jasonmai")).toBeTruthy()
        expect(screen.getByText("Nights")).toBeTruthy()
        expect(screen.getByText("Frank Ocean")).toBeTruthy()
        expect(screen.getByText("IN LIKE")).toBeTruthy()
        expect(screen.getByText("8.7")).toBeTruthy()
        expect(screen.getByText('"a whole journey in one track"')).toBeTruthy()
    })

    it("captures the poster and saves it to the photo library", async () => {
        renderScreen()
        fireEvent.press(screen.getByLabelText("Save to Photos"))
        await waitFor(() => {
            expect(MediaLibrary.requestPermissionsAsync).toHaveBeenCalledWith(true)
            expect(captureRef).toHaveBeenCalled()
            expect(MediaLibrary.saveToLibraryAsync).toHaveBeenCalledWith("file:///tmp/listn-activity.png")
        })
    })

    it("does not save when photo permission is denied", async () => {
        ;(MediaLibrary.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: false })
        renderScreen()
        fireEvent.press(screen.getByLabelText("Save to Photos"))
        await waitFor(() => {
            expect(MediaLibrary.requestPermissionsAsync).toHaveBeenCalled()
        })
        expect(MediaLibrary.saveToLibraryAsync).not.toHaveBeenCalled()
    })

    it("captures the poster and opens the share sheet", async () => {
        renderScreen()
        fireEvent.press(screen.getByLabelText("Share"))
        await waitFor(() => {
            expect(captureRef).toHaveBeenCalled()
            expect(Sharing.shareAsync).toHaveBeenCalledWith(
                "file:///tmp/listn-activity.png",
                expect.objectContaining({ mimeType: "image/png" }),
            )
        })
    })

    it("closes when the close button is pressed", () => {
        renderScreen()
        fireEvent.press(screen.getByLabelText("Close"))
        expect(mockGoBack).toHaveBeenCalled()
    })
})
