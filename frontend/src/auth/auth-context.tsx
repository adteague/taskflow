/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { Outlet, useNavigate } from "react-router"
import { useQueryClient } from "@tanstack/react-query"
import { setOnUnauthorized } from "@/api/client"
import {
  clearAuth,
  loadAuth,
  saveAuth,
  type StoredAuth,
} from "@/lib/auth-storage"

interface AuthContextValue {
  token: string | null
  email: string | null
  login: (token: string, email: string) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) {
    throw new Error("useAuth must be used within the auth provider")
  }
  return value
}

/**
 * Root layout route: provides auth state to the whole tree and registers the
 * global 401 handler (clear auth, drop cached data, redirect to /login).
 */
export function AuthLayout() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [auth, setAuth] = useState<StoredAuth | null>(() => loadAuth())

  const login = useCallback((token: string, email: string) => {
    const next: StoredAuth = { token, email }
    saveAuth(next)
    setAuth(next)
  }, [])

  const logout = useCallback(() => {
    clearAuth()
    setAuth(null)
    queryClient.clear()
    void navigate("/login", { replace: true })
  }, [navigate, queryClient])

  useEffect(() => {
    setOnUnauthorized(() => {
      // The fetch wrapper has already cleared localStorage.
      setAuth(null)
      queryClient.clear()
      void navigate("/login", { replace: true })
    })
    return () => setOnUnauthorized(null)
  }, [navigate, queryClient])

  const value = useMemo<AuthContextValue>(
    () => ({
      token: auth?.token ?? null,
      email: auth?.email ?? null,
      login,
      logout,
    }),
    [auth, login, logout],
  )

  return (
    <AuthContext.Provider value={value}>
      <Outlet />
    </AuthContext.Provider>
  )
}
