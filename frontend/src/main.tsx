import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "react-router/dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ApiError } from "@/api/client"
import { AppToaster } from "@/components/app-toaster"
import { applyTheme, getTheme } from "@/lib/theme"
import { router } from "@/router"
import "@fontsource-variable/inter"
import "./index.css"

// index.html applies the theme pre-paint; re-assert for non-HTML entries.
applyTheme(getTheme())

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Never retry HTTP errors (401/404/422…); retry network blips once.
      retry: (failureCount, error) =>
        error instanceof ApiError ? false : failureCount < 1,
      refetchOnWindowFocus: false,
      staleTime: 10_000,
    },
  },
})

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <AppToaster />
    </QueryClientProvider>
  </StrictMode>,
)
