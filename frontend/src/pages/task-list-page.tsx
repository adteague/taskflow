import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react"
import { Link, useSearchParams } from "react-router"
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardList,
  ListFilter,
  ListTodo,
  Pencil,
  Plus,
  Search,
  SearchX,
  Trash2,
} from "lucide-react"
import { getErrorMessage } from "@/api/client"
import type { Task, TaskStatusFilter } from "@/api/types"
import { DeleteTaskDialog } from "@/components/delete-task-dialog"
import { EditTaskDialog } from "@/components/edit-task-dialog"
import { ErrorState } from "@/components/error-state"
import { StatusBadgeSelect } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  useCreateTaskMutation,
  useDeleteTaskMutation,
  useStatsQuery,
  useTasksQuery,
  useToggleTaskMutation,
} from "@/hooks/use-tasks"
import { cn } from "@/lib/utils"

const MAX_TITLE_LENGTH = 200
const SEARCH_DEBOUNCE_MS = 300

/**
 * Filter dropdown options, in workflow order. "completed" is the wire value
 * targeting the complete status (legacy naming preserved server-side).
 */
const FILTER_OPTIONS: Array<{ value: TaskStatusFilter; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "backlog", label: "Backlog" },
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Complete" },
]

const VALID_FILTERS: TaskStatusFilter[] = [
  "all",
  "active",
  "completed",
  "backlog",
  "todo",
  "in_progress",
]

function parseStatus(raw: string | null): TaskStatusFilter {
  if (raw === "complete") return "completed"
  return (VALID_FILTERS as string[]).includes(raw ?? "")
    ? (raw as TaskStatusFilter)
    : "all"
}

function parsePage(raw: string | null): number {
  const page = Number(raw)
  return Number.isInteger(page) && page >= 1 ? page : 1
}

export function TaskListPage() {
  // List state (search / status / page) lives in the URL so views are
  // shareable and survive refresh + back/forward navigation.
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get("q") ?? ""
  const status = parseStatus(searchParams.get("status"))
  const page = parsePage(searchParams.get("page"))

  const tasksQuery = useTasksQuery({ page, search, status })
  const statsQuery = useStatsQuery()

  const updateParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous)
          mutate(next)
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const setPage = useCallback(
    (nextPage: number) =>
      updateParams((params) => {
        if (nextPage <= 1) params.delete("page")
        else params.set("page", String(nextPage))
      }),
    [updateParams],
  )

  // Search/status changes always reset pagination to page 1.
  const setSearch = useCallback(
    (value: string) =>
      updateParams((params) => {
        if (value) params.set("q", value)
        else params.delete("q")
        params.delete("page")
      }),
    [updateParams],
  )

  const setStatus = useCallback(
    (value: TaskStatusFilter) =>
      updateParams((params) => {
        if (value === "all") params.delete("status")
        else params.set("status", value)
        params.delete("page")
      }),
    [updateParams],
  )

  // If a delete (or a narrower filter) empties the current page, step back
  // to the last valid page.
  useEffect(() => {
    const data = tasksQuery.data
    if (data && data.totalPages >= 1 && page > data.totalPages) {
      setPage(data.totalPages)
    }
  }, [tasksQuery.data, page, setPage])

  const filtered = search !== "" || status !== "all"

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
      <StatsRow
        stats={statsQuery.data}
        loading={statsQuery.isPending}
        failed={statsQuery.isError}
      />
      <AddTaskForm />
      <TaskFilters
        search={search}
        status={status}
        onSearchChange={setSearch}
        onStatusChange={setStatus}
      />
      <TaskListSection
        query={tasksQuery}
        page={page}
        onPageChange={setPage}
        filtered={filtered}
        onClearFilters={() =>
          updateParams((params) => {
            params.delete("q")
            params.delete("status")
            params.delete("page")
          })
        }
      />
    </div>
  )
}

function StatsRow({
  stats,
  loading,
  failed,
}: {
  stats: { total: number; completed: number; pending: number } | undefined
  loading: boolean
  failed: boolean
}) {
  const items = [
    {
      label: "Total",
      value: stats?.total,
      icon: ListTodo,
      iconClass: "text-primary",
    },
    {
      label: "Completed",
      value: stats?.completed,
      icon: CheckCircle2,
      iconClass: "text-emerald-600",
    },
    {
      label: "Pending",
      value: stats?.pending,
      icon: Circle,
      iconClass: "text-amber-600",
    },
  ]
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {items.map(({ label, value, icon: Icon, iconClass }) => (
        <Card key={label} className="py-4">
          <CardContent className="flex items-center gap-3 px-4">
            <div className="rounded-lg bg-muted p-2">
              <Icon className={`size-5 ${iconClass}`} aria-hidden="true" />
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {label}
              </div>
              {loading ? (
                <Skeleton className="mt-1 h-6 w-10" />
              ) : (
                <div className="text-xl font-semibold tabular-nums">
                  {failed ? "—" : (value ?? 0)}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function AddTaskForm() {
  const [title, setTitle] = useState("")
  const createTask = useCreateTaskMutation()
  const trimmed = title.trim()
  const tooLong = trimmed.length > MAX_TITLE_LENGTH

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (trimmed.length === 0 || tooLong) return
    // Clear immediately for an instant feel; restore the draft on error.
    setTitle("")
    createTask.mutate(trimmed, { onError: () => setTitle(trimmed) })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1">
      <div className="flex gap-2">
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Add a new task…"
          aria-label="New task title"
          aria-invalid={tooLong ? true : undefined}
        />
        <Button type="submit" disabled={trimmed.length === 0 || tooLong}>
          <Plus aria-hidden="true" />
          Add task
        </Button>
      </div>
      {tooLong && (
        <p className="text-sm text-destructive" role="alert">
          Title must be at most {MAX_TITLE_LENGTH} characters (currently{" "}
          {trimmed.length}).
        </p>
      )}
      {createTask.isError && !tooLong && (
        <p className="text-sm text-destructive" role="alert">
          {getErrorMessage(createTask.error)}
        </p>
      )}
    </form>
  )
}

function TaskFilters({
  search,
  status,
  onSearchChange,
  onStatusChange,
}: {
  search: string
  status: TaskStatusFilter
  onSearchChange: (value: string) => void
  onStatusChange: (value: TaskStatusFilter) => void
}) {
  const [input, setInput] = useState(search)
  // The last search value this component committed to the URL. Lets us tell
  // external URL changes (back/forward) apart from our own debounced writes.
  const lastCommitted = useRef(search)

  useEffect(() => {
    if (search !== lastCommitted.current) {
      lastCommitted.current = search
      setInput(search)
    }
  }, [search])

  useEffect(() => {
    const trimmed = input.trim()
    if (trimmed === lastCommitted.current) return
    const timer = setTimeout(() => {
      lastCommitted.current = trimmed
      onSearchChange(trimmed)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [input, onSearchChange])

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative w-full sm:max-w-xs">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Search tasks…"
          aria-label="Search tasks"
          className="pl-8"
        />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            aria-label="Filter by status"
          >
            <ListFilter aria-hidden="true" />
            {FILTER_OPTIONS.find((option) => option.value === status)?.label ??
              "All statuses"}
            <ChevronDown aria-hidden="true" className="opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {FILTER_OPTIONS.map(({ value, label }) => (
            <DropdownMenuItem
              key={value}
              onSelect={() => onStatusChange(value)}
            >
              <span className="flex-1">{label}</span>
              {status === value && (
                <Check aria-hidden="true" className="text-primary" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function TaskListSection({
  query,
  page,
  onPageChange,
  filtered,
  onClearFilters,
}: {
  query: ReturnType<typeof useTasksQuery>
  page: number
  onPageChange: (page: number) => void
  filtered: boolean
  onClearFilters: () => void
}) {
  if (query.isPending) {
    return (
      <Card className="py-0">
        <CardContent className="divide-y px-0">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5">
              <Skeleton className="size-5 rounded-full" />
              <Skeleton className="h-4 flex-1 max-w-72" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    )
  }

  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  }

  const data = query.data

  if (data.total === 0) {
    // Distinguish "your filters matched nothing" from "you have no tasks".
    if (filtered) {
      return (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <SearchX
              className="size-8 text-muted-foreground"
              aria-hidden="true"
            />
            <p className="font-medium">No matching tasks</p>
            <p className="text-sm text-muted-foreground">
              Try a different search or status filter.
            </p>
            <Button variant="outline" size="sm" onClick={onClearFilters}>
              Clear filters
            </Button>
          </CardContent>
        </Card>
      )
    }
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <ClipboardList
            className="size-8 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="font-medium">No tasks yet</p>
          <p className="text-sm text-muted-foreground">
            Add your first task above to get started.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card
        className={cn(
          "py-0 transition-opacity",
          query.isPlaceholderData && "opacity-60",
        )}
      >
        <ul className="divide-y">
          {data.items.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </ul>
      </Card>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          Page {data.page} of {data.totalPages}
          {filtered && (
            <>
              {" · "}
              {data.total} {data.total === 1 ? "match" : "matches"}
            </>
          )}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft aria-hidden="true" />
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= data.totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function TaskRow({ task }: { task: Task }) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const toggleTask = useToggleTaskMutation()
  const deleteTask = useDeleteTaskMutation()

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <button
        type="button"
        onClick={() => toggleTask.mutate(task)}
        disabled={toggleTask.isPending}
        className="shrink-0 cursor-pointer text-muted-foreground transition-colors hover:text-primary disabled:opacity-50"
        aria-label={
          task.completed ? "Mark as not completed" : "Mark as completed"
        }
      >
        {task.completed ? (
          <CheckCircle2 className="size-5 text-emerald-600" aria-hidden="true" />
        ) : (
          <Circle className="size-5" aria-hidden="true" />
        )}
      </button>
      <Link
        to={`/tasks/${task.id}`}
        className={`min-w-0 flex-1 truncate text-sm font-medium hover:text-primary hover:underline ${
          task.completed ? "text-muted-foreground line-through" : ""
        }`}
      >
        {task.title}
      </Link>
      <StatusBadgeSelect task={task} />
      <div className="flex shrink-0 gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setEditOpen(true)}
          aria-label={`Edit “${task.title}”`}
        >
          <Pencil aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setDeleteOpen(true)}
          aria-label={`Delete “${task.title}”`}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
      <EditTaskDialog task={task} open={editOpen} onOpenChange={setEditOpen} />
      <DeleteTaskDialog
        taskTitle={task.title}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={() => {
          // Optimistic: close immediately — the row vanishes from the cache
          // at once and is restored (with an error toast) if the API fails.
          setDeleteOpen(false)
          deleteTask.mutate(task.id)
        }}
      />
    </li>
  )
}
