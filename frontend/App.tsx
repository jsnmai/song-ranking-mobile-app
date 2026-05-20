// App entry point.
import { GestureHandlerRootView } from "react-native-gesture-handler"

import { AuthProvider } from "./src/features/auth/AuthContext"
import RootNavigator from "./src/navigation"

// AuthProvider wraps everything so auth state is available to every screen.
// RootNavigator lives inside AuthProvider so it can read that state.
export default function App() {
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <AuthProvider>
                <RootNavigator />
            </AuthProvider>
        </GestureHandlerRootView>
    )
}
