// Configured wrapper for 'fetch' function used by every API call in the app.
// All requests go through request() — base URL, headers, and error handling live here once.

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000"  // ?? means use left side if it has a value, otherwise use right side

type ErrorResponseBody = {
    detail?: string;
    request_id?: string;
}

type RequestOptions = { // What options are allowed when calling request()
    token?: string;  // token is optional — only included for authenticated requests
    body?: unknown;  // body is optional and can be any type — the caller is responsible for passing the correct shape expected by the backend
}

type UnauthorizedHandler = () => void | Promise<void>

let unauthorizedHandler: UnauthorizedHandler | null = null

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
        const detail = data.detail ?? "An error occurred."
        if (response.status === 401 && requestOptions.token && unauthorizedHandler) {
            await unauthorizedHandler()
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

// apiClient is the public interface:
// all feature API files call these instead of request() directly so method names stay readable at the call site
export const apiClient = {
    async get<ResponseType>(path: string, token?: string): Promise<ResponseType> {
        return request<ResponseType>("GET", path, { token })
    },
    async post<ResponseType>(path: string, body: unknown, token?: string): Promise<ResponseType> {
        return request<ResponseType>("POST", path, { body, token })
    },
    async delete<ResponseType>(path: string, token?: string): Promise<ResponseType> {
        return request<ResponseType>("DELETE", path, { token })
    },
}
