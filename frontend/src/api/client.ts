// Configured fetch wrapper used by every API call in the app.
// All requests go through request() — base URL, headers, and error handling live here once.

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000"  // ?? means use left side if it has a value, otherwise use right side


async function request<ResponseType>(  // <ResponseType> is a generic, lets one function handle all endpoints while still giving TypeScript type info
  method: string,
  path: string,
  options: { body?: unknown; token?: string } = {},  // '= {}' means options is optional — callers can omit it entirely
): Promise<ResponseType> {
  
  const headers: Record<string, string> = {  // Record<string, string> means an object where both keys and values are strings
    "Content-Type": "application/json",
  }
  if (options.token) {  // Authorization header is only added when a token is provided, public endpoints (login, register) don't need
    headers["Authorization"] = `Bearer ${options.token}`
  }

  const fetchOptions: RequestInit = {  // RequestInit is the built-in TypeScript type for fetch configuration options
    method,
    headers,
  }
  if (options.body !== undefined) {  // GET requests must not have a body 
    fetchOptions.body = JSON.stringify(options.body)  // only serialize when body is present
  }

  const response = await fetch(`${BASE_URL}${path}`, fetchOptions)
  const data = await response.json()  // parse JSON before checking ok — FastAPI returns a JSON body even for errors
  // fetch only throws on network failure, not on 4xx/5xx responses — check ok manually
  if (!response.ok) {
    throw new Error(data.detail ?? "An error occurred.") // backend returns { detail: "..." } for all error responses (FastAPI default)
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
