import { useSyncExternalStore } from "react"

export type Theme = "dark" | "light"

/** Also read by the pre-paint inline script in index.html. */
const STORAGE_KEY = "taskflow-theme"

let listeners: Array<() => void> = []

function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark"
  } catch {
    return "dark"
  }
}

let current: Theme = readStoredTheme()

/** Reflects the theme onto <html> so the `.dark` token block applies. */
export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark")
}

export function getTheme(): Theme {
  return current
}

export function setTheme(theme: Theme): void {
  current = theme
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Persistence is best-effort (e.g. blocked storage); theme still applies.
  }
  applyTheme(theme)
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.push(listener)
  return () => {
    listeners = listeners.filter((entry) => entry !== listener)
  }
}

export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "dark" as const)
  return {
    theme,
    toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark"),
  }
}
