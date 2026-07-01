// Screens shown when the user is NOT logged in.
// Welcome → Login or Welcome → registration wizard (Email → Password → ProfileSetup)

import { createNativeStackNavigator } from "@react-navigation/native-stack"

import WelcomeScreen from "../features/auth/WelcomeScreen"
import LoginScreen from "../features/auth/LoginScreen"
import RegisterScreen from "../features/auth/RegisterScreen"
import ForgotPasswordScreen from "../features/auth/ForgotPasswordScreen"
import ResetPasswordScreen from "../features/auth/ResetPasswordScreen"

// Each key is a screen name; the value is the type of params it accepts.
// undefined means the screen takes no params when navigated to.
export type AuthStackParamList = {
    Welcome: undefined;
    Login: undefined;
    Register: undefined;
    ForgotPassword: undefined;
    ResetPassword: { email: string };
}

const Stack = createNativeStackNavigator<AuthStackParamList>()

export default function AuthNavigator() {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Welcome" component={WelcomeScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
        </Stack.Navigator>
    )
}
