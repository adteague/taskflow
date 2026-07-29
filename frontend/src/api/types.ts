/** Contract-mirroring types for the task management API. All JSON is camelCase. */

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  token: string
  user: {
    email: string
  }
}

export interface Task {
  id: number
  title: string
  completed: boolean
  /** ISO-8601 UTC timestamp */
  createdAt: string
  /** ISO-8601 UTC timestamp */
  updatedAt: string
}

export interface TaskPage {
  items: Task[]
  total: number
  page: number
  limit: number
  totalPages: number
}

/** Server-side status filter for GET /tasks (applied before pagination). */
export type TaskStatusFilter = "all" | "active" | "completed"

export interface TaskListParams {
  page: number
  limit?: number
  /** Server-side substring match on the title; omitted when empty. */
  search?: string
  status?: TaskStatusFilter
}

export interface TaskStats {
  total: number
  completed: number
  pending: number
}

export interface CreateTaskRequest {
  title: string
}

export interface UpdateTaskRequest {
  title?: string
  completed?: boolean
}

export type ActivityAction = "created" | "title_changed" | "status_changed"

export interface ActivityEntry {
  id: number
  taskId: number
  /** ISO-8601 timestamp */
  timestamp: string
  action: ActivityAction
  /** For status_changed, the strings "pending" / "completed". */
  oldValue: string | null
  newValue: string | null
}

export interface HealthResponse {
  status: string
}

/** Metadata about the in-process MCP server, from GET /mcp-info. */
export interface McpServerInfo {
  name: string
  endpoint: string
  transport: string
  auth: string
  instructions: string
}

export interface McpTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface McpResource {
  uri: string
  name: string
  description: string
  mimeType: string
}

export interface McpInfo {
  server: McpServerInfo
  tools: McpTool[]
  resources: McpResource[]
}

/** Every non-2xx response body carries this shape. */
export interface ErrorBody {
  detail: string
}
