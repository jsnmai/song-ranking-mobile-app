// Screens shown when the user is NOT logged in.
// Welcome → Login or Welcome → registration wizard (Email → Password → ProfileSetup)

import { createNativeStackNavigator } from "@react-navigation/native-stack"

import WelcomeScreen from "../features/auth/WelcomeScreen"
import LoginScreen from "../features/auth/LoginScreen"
import RegisterScreen from "../features/auth/RegisterScreen"
import ForgotPasswordScreen from "../features/auth/ForgotPasswordScreen"
import ResetPasswordScreen from "../features/auth/ResetPasswordScreen"
import { useAuth } from "../features/auth/AuthContext"

// Each key is a screen name; the value is the type of params it accepts.
// undefined means the screen takes no params when navigated to.
export type AuthStackParamList = {
    Welcome: { initialStep?: number } | undefined;
    Login: undefined;
    Register: undefined;
    ForgotPassword: undefined;
    ResetPassword: { email: string };
}

const Stack = createNativeStackNavigator<AuthStackParamList>()

// Welcome's last carousel step is the one with the Create account/Sign in CTAs.
const WELCOME_CTA_STEP = 2

export default function AuthNavigator() {
    const { hasOnboarded } = useAuth()

    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen
                name="Welcome"
                component={WelcomeScreen}
                // A device that's already onboarded before (e.g. just logged out) skips
                // straight to the CTA step instead of replaying the intro carousel.
                initialParams={hasOnboarded ? { initialStep: WELCOME_CTA_STEP } : undefined}
            />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
        </Stack.Navigator>
    )
}
