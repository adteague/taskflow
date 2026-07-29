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
import type { Task, TaskPage, TaskStatusFilter } from "@/api/types"

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

/**
 * Flips a task's completed flag in every cached list page. Pages whose
 * status filter no longer matches drop the row instantly (matching what the
 * server will return); the settled invalidation reconciles totals/positions.
 */
function applyCompletedToLists(
  queryClient: QueryClient,
  id: number,
  completed: boolean,
): void {
  const entries = queryClient.getQueriesData<TaskPage>({ queryKey: ["tasks"] })
  for (const [key, page] of entries) {
    if (!page) continue
    const params = key[1] as { status?: TaskStatusFilter } | undefined
    const status = params?.status ?? "all"
    const excluded =
      (status === "active" && completed) ||
      (status === "completed" && !completed)
    if (excluded) {
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
          task.id === id ? { ...task, completed } : task,
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

/**
 * Toggle semantics per contract: not completed -> PUT /tasks/:id/complete;
 * completed -> PATCH {"completed": false}. Optimistic: flips the task in all
 * cached list pages and the detail cache, rolls back on error.
 */
export function useToggleTaskMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (task: Task) =>
      task.completed
        ? api.updateTask(task.id, { completed: false })
        : api.completeTask(task.id),
    onMutate: async (task) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ["tasks"] }),
        queryClient.cancelQueries({ queryKey: ["task", task.id] }),
      ])
      const previousLists = snapshotLists(queryClient)
      const previousTask = queryClient.getQueryData<Task>(["task", task.id])
      const completed = !task.completed
      applyCompletedToLists(queryClient, task.id, completed)
      if (previousTask) {
        queryClient.setQueryData<Task>(["task", task.id], {
          ...previousTask,
          completed,
        })
      }
      return { previousLists, previousTask }
    },
    onError: (error, task, context) => {
      if (context) {
        restoreLists(queryClient, context.previousLists)
        if (context.previousTask) {
          queryClient.setQueryData(["task", task.id], context.previousTask)
        }
      }
      errorToast("Couldn't update task — reverted", error)
    },
    onSuccess: (updated) => {
      toast.success(
        updated.completed ? "Marked as completed" : "Marked as pending",
      )
    },
    onSettled: (_data, _error, task) => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] })
      void queryClient.invalidateQueries({ queryKey: ["stats"] })
      void queryClient.invalidateQueries({ queryKey: ["task", task.id] })
      void queryClient.invalidateQueries({ queryKey: ["activity", task.id] })
    },
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
