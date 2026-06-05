// API functions for the auth feature.
// One function per backend endpoint — AuthContext calls these, never fetch directly.

import { apiClient } from "../../api/client"
import { RegisterResponse, Token, User } from "./types"

// Calls POST /api/v1/auth/register
// Creates user + profile atomically in a single backend transaction.
// Returns the JWT alongside the new user — no separate login call needed.
export async function register(
    birthdate: string,
    email: string,
    password: string,
    display_name: string,
    username: string,
): Promise<RegisterResponse> {
    return apiClient.post<RegisterResponse>(
        "/api/v1/auth/register",
        { birthdate, email, password, display_name, username },
    )
}

// Calls POST /api/v1/auth/login
// Returns a JWT token — the caller is responsible for storing it securely
export async function login(email: string, password: string): Promise<Token> {
    return apiClient.post<Token>("/api/v1/auth/login", { email, password })
}

// Calls GET /api/v1/auth/me
// Validates the stored token and returns the current user
// Throws if the token is missing, expired, or invalid — caller handles the 401
export async function me(token: string): Promise<User> {
    return apiClient.get<User>("/api/v1/auth/me", token)
}

// Calls DELETE /api/v1/auth/me
// Permanently deletes the authenticated account and user-owned data.
export async function deleteAccount(token: string, confirmation: string): Promise<void> {
    await apiClient.delete<void>("/api/v1/auth/me", token, { confirmation })
}
