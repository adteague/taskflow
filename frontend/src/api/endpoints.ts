import { apiFetch } from "@/api/client"
import type {
  ActivityEntry,
  LoginResponse,
  McpInfo,
  Task,
  TaskListParams,
  TaskPage,
  TaskStats,
  UpdateTaskRequest,
} from "@/api/types"

export function login(email: string, password: string): Promise<LoginResponse> {
  return apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: { email, password },
  })
}

export function getTasks({
  page,
  limit = 10,
  search,
  status,
}: TaskListParams): Promise<TaskPage> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  })
  if (search) params.set("search", search)
  if (status && status !== "all") params.set("status", status)
  return apiFetch<TaskPage>(`/tasks?${params.toString()}`)
}

export function createTask(title: string): Promise<Task> {
  return apiFetch<Task>("/tasks", { method: "POST", body: { title } })
}

export function getStats(): Promise<TaskStats> {
  return apiFetch<TaskStats>("/tasks/stats")
}

export function getTask(id: number): Promise<Task> {
  return apiFetch<Task>(`/tasks/${id}`)
}

export function updateTask(id: number, patch: UpdateTaskRequest): Promise<Task> {
  return apiFetch<Task>(`/tasks/${id}`, { method: "PATCH", body: patch })
}

export function completeTask(id: number): Promise<Task> {
  return apiFetch<Task>(`/tasks/${id}/complete`, { method: "PUT" })
}

export function deleteTask(id: number): Promise<void> {
  return apiFetch<void>(`/tasks/${id}`, { method: "DELETE" })
}

export function getActivity(id: number): Promise<ActivityEntry[]> {
  return apiFetch<ActivityEntry[]>(`/tasks/${id}/activity`)
}

export function getMcpInfo(): Promise<McpInfo> {
  return apiFetch<McpInfo>("/mcp-info")
}

/** Mints a fresh token; the server immediately revokes all previous tokens. */
export function rotateToken(): Promise<LoginResponse> {
  return apiFetch<LoginResponse>("/auth/rotate", { method: "POST" })
}
