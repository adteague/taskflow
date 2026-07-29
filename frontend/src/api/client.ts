import { clearAuth, loadAuth } from "@/lib/auth-storage"

/**
 * The single source of truth for the backend origin (Direct + CORS
 * architecture: the browser calls the backend directly).
 */
export const API_BASE: string =
  import.meta.env.VITE_API_URL ?? "http://localhost:3001"

/** A non-2xx HTTP response from the API. */
export class ApiError extends Error {
  readonly status: number
  readonly detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.name = "ApiError"
    this.status = status
    this.detail = detail
  }
}

/** The request never reached the server (fetch TypeError, offline, CORS…). */
export class NetworkError extends Error {
  constructor() {
    super("Unable to reach the server. Check your connection and try again.")
    this.name = "NetworkError"
  }
}

type UnauthorizedHandler = () => void

let onUnauthorized: UnauthorizedHandler | null = null

/**
 * Registers the app-level reaction to a 401 from an authenticated endpoint
 * (clear auth state and redirect to /login). Registered by the auth provider.
 */
export function setOnUnauthorized(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof NetworkError) {
    return error.message
  }
  if (error instanceof Error && error.message) return error.message
  return "Something went wrong. Please try again."
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
  body?: unknown
}

function extractDetail(payload: unknown, fallback: string): string {
  if (typeof payload === "object" && payload !== null && "detail" in payload) {
    const detail = (payload as { detail: unknown }).detail
    if (typeof detail === "string") return detail
    // Defensive: FastAPI-style validation errors can be an array of objects.
    if (Array.isArray(detail)) {
      const messages = detail
        .map((entry) =>
          typeof entry === "object" && entry !== null && "msg" in entry
            ? String((entry as { msg: unknown }).msg)
            : null,
        )
        .filter((msg): msg is string => msg !== null)
      if (messages.length > 0) return messages.join("; ")
    }
  }
  return fallback
}

/**
 * Fetch wrapper: resolves paths against API_BASE, injects the Bearer token
 * when one is stored, parses JSON, and normalizes errors. Any 401 from an
 * authenticated (non /auth) endpoint clears auth and notifies the app.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body } = options
  const headers: Record<string, string> = {}
  if (body !== undefined) headers["Content-Type"] = "application/json"

  const token = loadAuth()?.token
  if (token) headers["Authorization"] = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new NetworkError()
  }

  if (!response.ok) {
    let payload: unknown = null
    try {
      payload = await response.json()
    } catch {
      // No JSON body; fall through to the status-based fallback message.
    }
    const detail = extractDetail(
      payload,
      `Request failed with status ${response.status}`,
    )
    if (response.status === 401 && !path.startsWith("/auth")) {
      clearAuth()
      onUnauthorized?.()
    }
    throw new ApiError(response.status, detail)
  }

  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}
