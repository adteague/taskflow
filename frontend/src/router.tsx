import { createBrowserRouter, Navigate } from "react-router"
import { AuthLayout } from "@/auth/auth-context"
import { ProtectedLayout, PublicOnlyLayout } from "@/auth/route-guards"
import { BoardPage } from "@/pages/board-page"
import { LoginPage } from "@/pages/login-page"
import { McpPage } from "@/pages/mcp-page"
import { TaskDetailPage } from "@/pages/task-detail-page"
import { TaskListPage } from "@/pages/task-list-page"

export const router = createBrowserRouter([
  {
    element: <AuthLayout />,
    children: [
      {
        element: <PublicOnlyLayout />,
        children: [{ path: "/login", element: <LoginPage /> }],
      },
      {
        element: <ProtectedLayout />,
        children: [
          { path: "/", element: <TaskListPage /> },
          { path: "/tasks/:id", element: <TaskDetailPage /> },
          { path: "/board", element: <BoardPage /> },
          { path: "/mcp", element: <McpPage /> },
        ],
      },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
])
