// App entry point.
import { useFonts, Fraunces_700Bold, Fraunces_700Bold_Italic } from "@expo-google-fonts/fraunces"
import { JetBrainsMono_400Regular, JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono"
import { ArchivoBlack_400Regular } from "@expo-google-fonts/archivo-black"
import { GestureHandlerRootView } from "react-native-gesture-handler"

import { AuthProvider } from "./src/features/auth/AuthContext"
import RootNavigator from "./src/navigation"

// AuthProvider wraps everything so auth state is available to every screen.
// RootNavigator lives inside AuthProvider so it can read that state.
export default function App() {
    const [fontsLoaded, fontError] = useFonts({
        Fraunces_700Bold,
        Fraunces_700Bold_Italic,
        JetBrainsMono_400Regular,
        JetBrainsMono_700Bold,
        ArchivoBlack_400Regular,
    })

    // Render nothing until fonts are ready. fontError lets the app proceed with system fallback.
    if (!fontsLoaded && !fontError) {
        return null
    }

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <AuthProvider>
                <RootNavigator />
            </AuthProvider>
        </GestureHandlerRootView>
    )
}
