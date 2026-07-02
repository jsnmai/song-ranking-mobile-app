// Configured wrapper for 'fetch' function used by every API call in the app.
// All requests go through request() — base URL, headers, and error handling live here once.

// Production API base. Public URL (no secret) — also mirrored in .env.production / EAS env vars.
const PROD_API_URL = "https://song-ranking-mobile-app-production.up.railway.app"
// EXPO_PUBLIC_* inlining has proven unreliable in locally-bundled EAS Update / export bundles
// (the value comes through as undefined, so we'd fall back to localhost and every request fails on
// a real device). React Native's __DEV__ flag is always set correctly by Metro — true on the dev
// server, false in production builds and OTA update bundles — so use it to choose the API. An
// explicit EXPO_PUBLIC_API_URL still wins when it actually inlines (e.g. clean EAS Build).
const BASE_URL =
    process.env.EXPO_PUBLIC_API_URL ?? (__DEV__ ? "http://localhost:8000" : PROD_API_URL)

type ErrorResponseBody = {
    detail?: unknown;
    request_id?: string;
}

type RequestOptions = { // What options are allowed when calling request()
    token?: string;  // token is optional — only included for authenticated requests
    body?: unknown;  // body is optional and can be any type — the caller is responsible for passing the correct shape expected by the backend
}

type UnauthorizedHandler = () => void | Promise<void>

let unauthorizedHandler: UnauthorizedHandler | null = null
let handledUnauthorizedToken: string | null = null
let unauthorizedHandlerPromise: Promise<void> | null = null

export class ApiError extends Error {
    status: number
    detail: string
    requestId: string | null

    constructor(status: number, detail: string, requestId: string | null) {
        super(detail)
        this.name = "ApiError"
        this.status = status
        this.detail = detail
        this.requestId = requestId
    }
}

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
    unauthorizedHandler = handler
    handledUnauthorizedToken = null
    unauthorizedHandlerPromise = null
}

async function runUnauthorizedHandler(token: string): Promise<void> {
    if (!unauthorizedHandler) return
    if (handledUnauthorizedToken === token) {
        if (unauthorizedHandlerPromise) {
            await unauthorizedHandlerPromise
        }
        return
    }

    handledUnauthorizedToken = token
    unauthorizedHandlerPromise = Promise.resolve(unauthorizedHandler()).finally(() => {
        unauthorizedHandlerPromise = null
    })
    await unauthorizedHandlerPromise
}

async function request<ResponseType>(requestMethod: string, path: string, requestOptions: RequestOptions={}): Promise<ResponseType> {
    // <ResponseType> is a generic, lets one function handle all endpoints while still giving TypeScript type info
    // requestOptions defaults to empty {} if not provided

    // Build parameters for fetch call: fetch(url+path, fetchOptions)
    // 1. Check for token and add "Authorization" header if it exists. Public endpoints (login, register) won't have a token
    const requestHeaders: Record<string, string> = {  // Record<string, string> means an object where both keys and values are strings
        "Content-Type": "application/json",           // "Content-Type" header
    }
    if (requestOptions.token) {  
        requestHeaders["Authorization"] = `Bearer ${requestOptions.token}`
    }
    // 2. Check for body and add to fetchOptions if it exists. 
    const fetchOptions: RequestInit = {  // RequestInit is the built-in TS type for the 'fetch' function's second argument
        method: requestMethod,  
        headers: requestHeaders,
        body: undefined,  // default to undefined if not provided — fetch doesn't want a body for GET requests, but does for POST/PUT/PATCH
    }
    if (requestOptions.body !== undefined) {  
        fetchOptions.body = JSON.stringify(requestOptions.body)  
    }
    
    // Main fetch call — all API requests go through here. Errors are caught and thrown.
    const response = await fetch(`${BASE_URL}${path}`, fetchOptions)
    const data = await parseJsonResponse(response)
    if (!response.ok) {                 // fetch only throws on network failure, not on 4xx/5xx responses — check ok manually
        const requestId = response.headers.get("X-Request-ID") ?? data.request_id ?? null
        const detail = errorDetailToString(data.detail)
        if (response.status === 401 && requestOptions.token) {
            await runUnauthorizedHandler(requestOptions.token)
        }
        throw new ApiError(
            response.status,
            detail,
            requestId,
        )
    }
    return data as ResponseType
}

async function parseJsonResponse(response: Response): Promise<ErrorResponseBody & unknown> {
    try {
        return await response.json()
    } catch {
        return {}
    }
}

function errorDetailToString(detail: unknown): string {
    if (typeof detail === "string") {
        return detail
    }
    if (Array.isArray(detail)) {
        const firstMessage = detail
            .map((item) => messageFromValidationItem(item))
            .find((message) => message !== null)
        return firstMessage ?? "Request validation failed."
    }
    const objectMessage = messageFromValidationItem(detail)
    if (objectMessage !== null) {
        return objectMessage
    }
    return "An error occurred."
}

function messageFromValidationItem(item: unknown): string | null {
    if (
        typeof item === "object"
        && item !== null
        && "msg" in item
        && typeof item.msg === "string"
    ) {
        return item.msg
    }
    return null
}

// apiClient is the public interface:
// all feature API files call these instead of request() directly so method names stay readable at the call site
export const apiClient = {
    async get<ResponseType>(path: string, token?: string): Promise<ResponseType> {
        return request<ResponseType>("GET", path, { token })
    },
    async post<ResponseType>(path: string, body: unknown, token?: string): Promise<ResponseType> {
        return request<ResponseType>("POST", path, { body, token })
    },
    async put<ResponseType>(path: string, body: unknown, token?: string): Promise<ResponseType> {
        return request<ResponseType>("PUT", path, { body, token })
    },
    async patch<ResponseType>(path: string, body: unknown, token?: string): Promise<ResponseType> {
        return request<ResponseType>("PATCH", path, { body, token })
    },
    async delete<ResponseType>(path: string, token?: string, body?: unknown): Promise<ResponseType> {
        return request<ResponseType>("DELETE", path, { token, body })
    },
}
