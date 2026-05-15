// Configured fetch wrapper used by every API call in the app.
// All requests go through request() — base URL, headers, and error handling live here once.

// ?? means "use the left side if it has a value, otherwise use the right side"
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000"

// <ResponseType> is a generic — a placeholder that the caller fills in with the actual
// return type (e.g. User, Token). This lets one function handle all endpoints
// while still giving TypeScript accurate type information.
async function request<ResponseType>(
  method: string,
  path: string,
  // = {} means options is optional — callers can omit it entirely
  options: { body?: unknown; token?: string } = {},
): Promise<ResponseType> {
  // Record<string, string> means an object where both keys and values are strings
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }

  // Authorization header is only added when a token is provided —
  // public endpoints (login, register) don't need it
  if (options.token) {
    headers["Authorization"] = `Bearer ${options.token}`
  }

  // RequestInit is the built-in TypeScript type for fetch configuration options
  const fetchOptions: RequestInit = {
    method,
    headers,
  }

  // GET requests must not have a body — only serialize when body is present
  if (options.body !== undefined) {
    fetchOptions.body = JSON.stringify(options.body)
  }

  const response = await fetch(`${BASE_URL}${path}`, fetchOptions)

  // parse JSON before checking ok — FastAPI returns a JSON body even for errors
  const data = await response.json()

  // fetch only throws on network failure, not on 4xx/5xx responses — check ok manually
  if (!response.ok) {
    // backend returns { detail: "..." } for all error responses (FastAPI default)
    throw new Error(data.detail ?? "An error occurred.")
  }

  return data as ResponseType
}

// apiClient is the public interface — all feature API files call these instead of
// calling request() directly, so method names stay readable at the call site
export const apiClient = {
  async get<ResponseType>(path: string, token?: string): Promise<ResponseType> {
    return request<ResponseType>("GET", path, { token })
  },
  async post<ResponseType>(path: string, body: unknown, token?: string): Promise<ResponseType> {
    return request<ResponseType>("POST", path, { body, token })
  },
}
