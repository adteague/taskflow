import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  FileQuestion,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react"
import { ApiError } from "@/api/client"
import type { ActivityEntry } from "@/api/types"
import { DeleteTaskDialog } from "@/components/delete-task-dialog"
import { EditTaskDialog } from "@/components/edit-task-dialog"
import { ErrorState } from "@/components/error-state"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  useActivityQuery,
  useDeleteTaskMutation,
  useTaskQuery,
  useToggleTaskMutation,
} from "@/hooks/use-tasks"
import { formatDateTime } from "@/lib/format"

export function TaskDetailPage() {
  const params = useParams<{ id: string }>()
  const id = Number(params.id)

  if (!Number.isInteger(id) || id < 1) {
    return <NotFoundView />
  }
  return <TaskDetail id={id} />
}

function TaskDetail({ id }: { id: number }) {
  const navigate = useNavigate()
  const taskQuery = useTaskQuery(id)
  const activityQuery = useActivityQuery(id)
  const toggleTask = useToggleTaskMutation()
  const deleteTask = useDeleteTaskMutation()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  if (taskQuery.isPending) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <Card>
          <CardHeader>
            <Skeleton className="h-7 w-64" />
            <Skeleton className="mt-2 h-4 w-40" />
          </CardHeader>
          <CardContent className="flex gap-2">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (taskQuery.isError) {
    if (taskQuery.error instanceof ApiError && taskQuery.error.status === 404) {
      return <NotFoundView />
    }
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <ErrorState
          error={taskQuery.error}
          onRetry={() => void taskQuery.refetch()}
        />
      </div>
    )
  }

  const task = taskQuery.data

  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle
              className={`text-xl ${
                task.completed ? "text-muted-foreground line-through" : ""
              }`}
            >
              {task.title}
            </CardTitle>
            <StatusBadge completed={task.completed} />
          </div>
          <p className="text-sm text-muted-foreground">
            Created {formatDateTime(task.createdAt)}
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant={task.completed ? "outline" : "default"}
            size="sm"
            disabled={toggleTask.isPending}
            onClick={() => toggleTask.mutate(task)}
          >
            {task.completed ? (
              <>
                <Circle aria-hidden="true" />
                Mark as pending
              </>
            ) : (
              <>
                <CheckCircle2 aria-hidden="true" />
                Mark as completed
              </>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil aria-hidden="true" />
            Edit title
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 aria-hidden="true" />
            Delete
          </Button>
        </CardContent>
      </Card>

      <ActivitySection query={activityQuery} />

      <EditTaskDialog task={task} open={editOpen} onOpenChange={setEditOpen} />
      <DeleteTaskDialog
        taskTitle={task.title}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={() => {
          // Optimistic: fire the delete and return to the (already-updated)
          // list at once; a failure restores the row with an error toast.
          setDeleteOpen(false)
          deleteTask.mutate(task.id)
          void navigate("/", { replace: true })
        }}
      />
    </div>
  )
}

function ActivitySection({
  query,
}: {
  query: ReturnType<typeof useActivityQuery>
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-6 rounded-full" />
                <Skeleton className="h-4 w-64" />
              </div>
            ))}
          </div>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {query.data.map((entry) => (
              <ActivityRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  return (
    <li className="flex items-start gap-3">
      <div className="mt-0.5 rounded-full bg-muted p-1.5">
        <ActivityIcon action={entry.action} />
      </div>
      <div className="min-w-0">
        <ActivityText entry={entry} />
        <p className="text-xs text-muted-foreground">
          {formatDateTime(entry.timestamp)}
        </p>
      </div>
    </li>
  )
}

function ActivityIcon({ action }: { action: ActivityEntry["action"] }) {
  switch (action) {
    case "created":
      return <Plus className="size-3.5 text-primary" aria-hidden="true" />
    case "title_changed":
      return (
        <Pencil className="size-3.5 text-muted-foreground" aria-hidden="true" />
      )
    case "status_changed":
      return (
        <RefreshCw
          className="size-3.5 text-muted-foreground"
          aria-hidden="true"
        />
      )
    default:
      return (
        <Circle className="size-3.5 text-muted-foreground" aria-hidden="true" />
      )
  }
}

function statusLabel(value: string | null): string {
  if (value === "completed") return "Completed"
  if (value === "pending") return "Pending"
  return value ?? "unknown"
}

function ActivityText({ entry }: { entry: ActivityEntry }) {
  switch (entry.action) {
    case "created":
      return <p className="text-sm">Created</p>
    case "title_changed":
      return (
        <p className="text-sm">
          Title changed from{" "}
          <span className="font-medium">“{entry.oldValue ?? ""}”</span> to{" "}
          <span className="font-medium">“{entry.newValue ?? ""}”</span>
        </p>
      )
    case "status_changed":
      return (
        <p className="text-sm">
          Status changed from{" "}
          <span className="font-medium">{statusLabel(entry.oldValue)}</span> to{" "}
          <span className="font-medium">{statusLabel(entry.newValue)}</span>
        </p>
      )
    default:
      return <p className="text-sm">{entry.action}</p>
  }
}

function BackLink() {
  return (
    <div>
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/">
          <ArrowLeft aria-hidden="true" />
          Back to tasks
        </Link>
      </Button>
    </div>
  )
}

function NotFoundView() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <FileQuestion
          className="size-8 text-muted-foreground"
          aria-hidden="true"
        />
        <p className="font-medium">Task not found</p>
        <p className="text-sm text-muted-foreground">
          This task may have been deleted, or the link is incorrect.
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link to="/">
            <ArrowLeft aria-hidden="true" />
            Back to tasks
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
