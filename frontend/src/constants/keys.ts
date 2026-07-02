export const KEYS = {
    JWT_TOKEN: "jwt_token",
    // Set once a device has ever completed login/register, so a later logout on the
    // same device lands on the Welcome screen's Create account/Sign in step instead
    // of replaying the intro carousel from the start.
    HAS_ONBOARDED: "has_onboarded",
}