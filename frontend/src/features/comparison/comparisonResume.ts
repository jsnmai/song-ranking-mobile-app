// Crash/kill recovery for the comparison (calibration) flow.
//
// The server keeps an in-flight comparison session durably and keyed to the user, so on
// launch the client simply asks "do I have an active session?" and offers to resume it.
// Nothing is persisted client-side (it survives reinstall once the user is logged back in).
// Presentation is a native Alert for now — a deliberate, low-risk v1 that can later become a
// branded in-app banner without touching this recovery logic.

import { Alert } from "react-native"
import { NavigationContainerRef } from "@react-navigation/native"

import { AppStackParamList } from "../../navigation/types"
import { ComparisonSessionResponse } from "./types"
import { cancelComparisonSession, finalizeComparisonSession, getActiveComparisonSession } from "./apiRequests"

export async function promptResumeIfActiveSession(
    token: string,
    navigationRef: NavigationContainerRef<AppStackParamList>,
): Promise<void> {
    let session: ComparisonSessionResponse | null
    try {
        session = await getActiveComparisonSession(token)
    } catch {
        return  // best-effort — a recovery check must never block or break launch
    }
    if (session === null) return
    const active = session  // const narrows to non-null inside the button callbacks

    Alert.alert(
        "Resume calibration",
        `You have a ranking in progress for "${active.target_song.title}".`,
        [
            {
                text: "Discard",
                style: "destructive",
                onPress: () => {
                    cancelComparisonSession(active.session_uuid, token).catch(() => {})
                },
            },
            {
                text: "Resume",
                onPress: async () => {
                    if (!navigationRef.isReady()) return
                    // A crash right after the final choice leaves the session ready to
                    // finalize; complete it straight to the score rather than re-showing a
                    // comparison with no candidate.
                    if (active.status === "ready_to_finalize") {
                        try {
                            const response = await finalizeComparisonSession(active.session_uuid, token)
                            navigationRef.navigate("ScoreReveal", { result: response.result })
                        } catch {
                            // Session already finalized/gone — nothing to resume.
                        }
                        return
                    }
                    navigationRef.navigate("ComparisonFlow", { session: active })
                },
            },
        ],
    )
}
