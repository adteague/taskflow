import type { ReactNode } from "react"
import { Link, NavLink } from "react-router"
import { CheckSquare, LogOut } from "lucide-react"
import { useAuth } from "@/auth/auth-context"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return cn(
    "text-sm transition-colors",
    isActive
      ? "font-medium text-foreground"
      : "text-muted-foreground hover:text-foreground",
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const { email, logout } = useAuth()

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link
              to="/"
              className="flex items-center gap-2 font-semibold tracking-tight"
            >
              <CheckSquare className="size-5 text-primary" aria-hidden="true" />
              TaskFlow
            </Link>
            <nav className="flex items-center gap-4" aria-label="Primary">
              <NavLink to="/" end className={navLinkClass}>
                Tasks
              </NavLink>
              <NavLink to="/board" className={navLinkClass}>
                Board
              </NavLink>
              <NavLink to="/mcp" className={navLinkClass}>
                MCP
              </NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {email}
            </span>
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={logout}>
              <LogOut aria-hidden="true" />
              Logout
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  )
}
