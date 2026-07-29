import { Navigate, Outlet } from "react-router"
import { useAuth } from "@/auth/auth-context"
import { AppShell } from "@/components/layout/app-shell"

/** Wraps protected routes: no token -> redirect to /login. */
export function ProtectedLayout() {
  const { token } = useAuth()
  if (!token) {
    return <Navigate to="/login" replace />
  }
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

/** Wraps public-only routes (login): token present -> redirect to /. */
export function PublicOnlyLayout() {
  const { token } = useAuth()
  if (token) {
    return <Navigate to="/" replace />
  }
  return <Outlet />
}
