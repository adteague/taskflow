/** Persisted auth state, stored in localStorage under a single key. */

const STORAGE_KEY = "taskflow.auth"

export interface StoredAuth {
  token: string
  email: string
}

export function loadAuth(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as StoredAuth).token === "string" &&
      typeof (parsed as StoredAuth).email === "string"
    ) {
      return parsed as StoredAuth
    }
    return null
  } catch {
    return null
  }
}

export function saveAuth(auth: StoredAuth): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(auth))
}

export function clearAuth(): void {
  localStorage.removeItem(STORAGE_KEY)
}
