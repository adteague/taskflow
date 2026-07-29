import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query"
import { toast } from "sonner"
import { getErrorMessage } from "@/api/client"
import * as api from "@/api/endpoints"
import type { Task, TaskPage, TaskStatus, TaskStatusFilter } from "@/api/types"
import { STATUS_LABELS } from "@/lib/task-status"

export const PAGE_SIZE = 10

export interface TaskListQueryParams {
  page: number
  /** Raw search text; empty string means "no search". */
  search: string
  status: TaskStatusFilter
}

export function useTasksQuery({ page, search, status }: TaskListQueryParams) {
  return useQuery({
    // search/status are part of the key so every filter combination is cached
    // and refetched independently.
    queryKey: ["tasks", { page, search, status }],
    queryFn: () =>
      api.getTasks({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        status,
      }),
    placeholderData: keepPreviousData,
  })
}

export function useStatsQuery() {
  return useQuery({
    queryKey: ["stats"],
    queryFn: () => api.getStats(),
  })
}

export function useTaskQuery(id: number) {
  return useQuery({
    queryKey: ["task", id],
    queryFn: () => api.getTask(id),
  })
}

export function useActivityQuery(id: number) {
  return useQuery({
    queryKey: ["activity", id],
    queryFn: () => api.getActivity(id),
  })
}

/* ------------------------------------------------------------------ */
/* Optimistic-update helpers                                          */
/* ------------------------------------------------------------------ */

/** Snapshot of every cached task-list page (all page/search/status combos). */
type ListSnapshot = Array<[readonly unknown[], TaskPage | undefined]>

function snapshotLists(queryClient: QueryClient): ListSnapshot {
  return queryClient.getQueriesData<TaskPage>({ queryKey: ["tasks"] })
}

function restoreLists(queryClient: QueryClient, snapshot: ListSnapshot): void {
  for (const [key, data] of snapshot) {
    queryClient.setQueryData(key, data)
  }
}

/** Applies a partial patch to one task in every cached list page. */
function patchTaskInLists(
  queryClient: QueryClient,
  id: number,
  patch: Partial<Task>,
): void {
  queryClient.setQueriesData<TaskPage>({ queryKey: ["tasks"] }, (page) =>
    page
      ? {
          ...page,
          items: page.items.map((task) =>
            task.id === id ? { ...task, ...patch } : task,
          ),
        }
      : page,
  )
}

/** Whether a task with `status` belongs in a list filtered by `filter`. */
function matchesFilter(filter: TaskStatusFilter, status: TaskStatus): boolean {
  if (filter === "all") return true
  if (filter === "active") return status !== "complete"
  if (filter === "completed") return status === "complete"
  return filter === status
}

/**
 * Moves a task to `status` in every cached list page. Pages whose status
 * filter no longer matches drop the row instantly (matching what the server
 * will return); the settled invalidation reconciles totals/positions. The
 * board's cache (key ["tasks", "board"]) has no filter params and is treated
 * as "all", so its card simply changes column.
 */
function applyStatusToLists(
  queryClient: QueryClient,
  id: number,
  status: TaskStatus,
): void {
  const patch = { status, completed: status === "complete" }
  const entries = queryClient.getQueriesData<TaskPage>({ queryKey: ["tasks"] })
  for (const [key, page] of entries) {
    if (!page) continue
    const params = key[1] as { status?: TaskStatusFilter } | undefined
    const filter =
      (typeof params === "object" ? params?.status : undefined) ?? "all"
    if (!matchesFilter(filter, status)) {
      const items = page.items.filter((task) => task.id !== id)
      if (items.length !== page.items.length) {
        queryClient.setQueryData<TaskPage>(key, {
          ...page,
          items,
          total: Math.max(0, page.total - 1),
        })
      }
    } else {
      queryClient.setQueryData<TaskPage>(key, {
        ...page,
        items: page.items.map((task) =>
          task.id === id ? { ...task, ...patch } : task,
        ),
      })
    }
  }
}

/** Removes a task from every cached list page (adjusting totals). */
function removeTaskFromLists(queryClient: QueryClient, id: number): void {
  queryClient.setQueriesData<TaskPage>({ queryKey: ["tasks"] }, (page) => {
    if (!page) return page
    const items = page.items.filter((task) => task.id !== id)
    if (items.length === page.items.length) return page
    return { ...page, items, total: Math.max(0, page.total - 1) }
  })
}

function errorToast(title: string, error: unknown): void {
  toast.error(title, {
    description: getErrorMessage(error),
    duration: 5000,
  })
}

/* ------------------------------------------------------------------ */
/* Mutations                                                          */
/* ------------------------------------------------------------------ */

/**
 * Create stays a fast-invalidate (the server assigns the id and the new row's
 * page position depends on server-side pagination); a subtle toast confirms.
 */
export function useCreateTaskMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (title: string) => api.createTask(title),
    onSuccess: () => {
      toast.success("Task added")
      void queryClient.invalidateQueries({ queryKey: ["tasks"] })
      void queryClient.invalidateQueries({ queryKey: ["stats"] })
    },
  })
}

interface MoveStatusVars {
  task: Task
  status: TaskStatus
}

interface MoveStatusContext {
  previousLists: ListSnapshot
  previousTask: Task | undefined
}

/** Shared optimistic move-to-status plumbing for toggle + status select. */
function useMoveStatusMutation(options: {
  mutationFn: (vars: MoveStatusVars) => Promise<Task>
  successToast: (updated: Task) => string
}) {
  const queryClient = useQueryClient()
  return useMutation<Task, Error, MoveStatusVars, MoveStatusContext>({
    mutationFn: options.mutationFn,
    onMutate: async ({ task, status }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ["tasks"] }),
        queryClient.cancelQueries({ queryKey: ["task", task.id] }),
      ])
      const previousLists = snapshotLists(queryClient)
      const previousTask = queryClient.getQueryData<Task>(["task", task.id])
      applyStatusToLists(queryClient, task.id, status)
      if (previousTask) {
        queryClient.setQueryData<Task>(["task", task.id], {
          ...previousTask,
          status,
          completed: status === "complete",
        })
      }
      return { previousLists, previousTask }
    },
    onError: (error, { task }, context) => {
      if (context) {
        restoreLists(queryClient, context.previousLists)
        if (context.previousTask) {
          queryClient.setQueryData(["task", task.id], context.previousTask)
        }
      }
      errorToast("Couldn't update task — reverted", error)
    },
    onSuccess: (updated) => {
      toast.success(options.successToast(updated))
    },
    onSettled: (_data, _error, { task }) => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] })
      void queryClient.invalidateQueries({ queryKey: ["stats"] })
      void queryClient.invalidateQueries({ queryKey: ["task", task.id] })
      void queryClient.invalidateQueries({ queryKey: ["activity", task.id] })
    },
  })
}

/**
 * Complete/reopen toggle: not complete -> PUT /tasks/:id/complete (spec'd
 * endpoint); complete -> PATCH {"status": "todo"} (reopen). Optimistic across
 * all cached lists (including the board) and the detail cache.
 */
export function useToggleTaskMutation() {
  const inner = useMoveStatusMutation({
    mutationFn: ({ task }) =>
      task.completed
        ? api.updateTask(task.id, { status: "todo" })
        : api.completeTask(task.id),
    successToast: (updated) =>
      updated.completed ? "Marked as complete" : "Moved to To do",
  })
  return {
    ...inner,
    mutate: (task: Task) =>
      inner.mutate({
        task,
        status: task.completed ? "todo" : "complete",
      }),
  }
}

/** Direct status move from the clickable badge dropdown. */
export function useSetStatusMutation() {
  return useMoveStatusMutation({
    mutationFn: ({ task, status }) => api.updateTask(task.id, { status }),
    successToast: (updated) => `Moved to ${STATUS_LABELS[updated.status]}`,
  })
}

/** Optimistic title edit across list pages and the detail cache. */
export function useUpdateTitleMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, title }: { id: number; title: string }) =>
      api.updateTask(id, { title }),
    onMutate: async ({ id, title }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ["tasks"] }),
        queryClient.cancelQueries({ queryKey: ["task", id] }),
      ])
      const previousLists = snapshotLists(queryClient)
      const previousTask = queryClient.getQueryData<Task>(["task", id])
      patchTaskInLists(queryClient, id, { title })
      if (previousTask) {
        queryClient.setQueryData<Task>(["task", id], {
          ...previousTask,
          title,
        })
      }
      return { previousLists, previousTask }
    },
    onError: (error, { id }, context) => {
      if (context) {
        restoreLists(queryClient, context.previousLists)
        if (context.previousTask) {
          queryClient.setQueryData(["task", id], context.previousTask)
        }
      }
      errorToast("Couldn't rename task — reverted", error)
    },
    onSuccess: () => {
      toast.success("Task renamed")
    },
    onSettled: (_data, _error, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] })
      void queryClient.invalidateQueries({ queryKey: ["task", id] })
      void queryClient.invalidateQueries({ queryKey: ["activity", id] })
    },
  })
}

/** Optimistic delete: the row disappears instantly, reappears on error. */
export function useDeleteTaskMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deleteTask(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["tasks"] })
      const previousLists = snapshotLists(queryClient)
      removeTaskFromLists(queryClient, id)
      return { previousLists }
    },
    onError: (error, _id, context) => {
      if (context) restoreLists(queryClient, context.previousLists)
      errorToast("Couldn't delete task — reverted", error)
    },
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: ["task", id] })
      queryClient.removeQueries({ queryKey: ["activity", id] })
      toast.success("Task deleted")
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] })
      void queryClient.invalidateQueries({ queryKey: ["stats"] })
    },
  })
}
