// TypeScript types for the auth feature.
// These mirror the Pydantic schemas in the backend so both sides agree on data shapes.

// Mirrors UserResponse in backend/src/pydantic_schemas/user.py
// Note: hashed_password is intentionally absent — the backend never sends it
export type User = {
    id: number;
    email: string;
    created_at: string; // the backend sends datetime as an ISO string e.g. "2026-01-01T00:00:00Z"
}

// Mirrors Token in backend/src/pydantic_schemas/user.py
export type Token = {
    access_token: string; // the JWT string the app stores and sends on every authenticated request
    token_type: string;  // always "bearer"
}

// Shape of the request body sent to /auth/login and /auth/register
export type LoginCredentials = {
    email: string;
    password: string;
}

// Mirrors RegisterResponse in backend/src/pydantic_schemas/user.py
// Returned by POST /auth/register — includes the JWT so the client needs no separate login call
export type RegisterResponse = {
    access_token: string;
    token_type: string;
    user: User;
}
