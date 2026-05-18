// Screens shown when the user is NOT logged in.
// Welcome → Login or Welcome → registration wizard (Email → Password → ProfileSetup)

import { createNativeStackNavigator } from "@react-navigation/native-stack"

import LoginScreen from "../features/auth/LoginScreen"
import WelcomeScreen from "../features/auth/WelcomeScreen"
import RegisterScreen from "../features/auth/RegisterScreen"

// Each key is a screen name; the value is the type of params it accepts.
// undefined means the screen takes no params when navigated to.
export type AuthStackParamList = {
    Welcome: undefined;
    Login: undefined;
    Register: undefined;
}

const Stack = createNativeStackNavigator<AuthStackParamList>()

export default function AuthNavigator() {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Welcome" component={WelcomeScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
        </Stack.Navigator>
    )
}
