// API functions for the auth feature.
// One function per backend endpoint — AuthContext calls these, never fetch directly.

import { apiClient } from "../../api/client"
import { Token, User } from "./types"

// Calls POST /api/v1/auth/register
// Returns the newly created user (without password)
export async function register(email: string, password: string): Promise<User> {
    return apiClient.post<User>("/api/v1/auth/register", { email, password })
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
