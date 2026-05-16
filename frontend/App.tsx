// App entry point.
import React from "react"

import { AuthProvider } from "./src/features/auth/AuthContext"
import RootNavigator from "./src/navigation"

// AuthProvider wraps everything so auth state is available to every screen.
// RootNavigator lives inside AuthProvider so it can read that state.
export default function App() {
    return (
        <AuthProvider>  
            <RootNavigator />
        </AuthProvider>
    )
}
