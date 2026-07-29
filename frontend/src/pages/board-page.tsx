import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import { Columns3 } from "lucide-react"
import * as api from "@/api/endpoints"
import type { Task, TaskStatus } from "@/api/types"
import { ErrorState } from "@/components/error-state"
import { StatusBadgeSelect } from "@/components/status-badge"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { STATUS_LABELS, TASK_STATUSES } from "@/lib/task-status"
import { cn } from "@/lib/utils"

/** One fetch covers the whole board; plenty for the demo dataset. */
const BOARD_LIMIT = 100

export function BoardPage() {
  // Key shares the ["tasks"] prefix so the optimistic status mutations patch
  // this cache too — changing a card's status moves it between columns
  // instantly, before the server confirms.
  const query = useQuery({
    queryKey: ["tasks", "board"],
    queryFn: () => api.getTasks({ page: 1, limit: BOARD_LIMIT, status: "all" }),
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <Columns3 className="size-6 text-primary" aria-hidden="true" />
        <h1 className="text-2xl font-semibold tracking-tight">Board</h1>
      </div>

      {query.isPending ? (
        <BoardSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <div className="flex gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-4 md:overflow-visible">
            {TASK_STATUSES.map((status) => (
              <BoardColumn
                key={status}
                status={status}
                tasks={query.data.items.filter(
                  (task) => task.status === status,
                )}
              />
            ))}
          </div>
          {query.data.total > query.data.items.length && (
            <p className="text-sm text-muted-foreground">
              Showing the {query.data.items.length} most recent of{" "}
              {query.data.total} tasks.
            </p>
          )}
        </>
      )}
    </div>
  )
}

function BoardColumn({
  status,
  tasks,
}: {
  status: TaskStatus
  tasks: Task[]
}) {
  return (
    <section
      aria-label={`${STATUS_LABELS[status]} column`}
      className="flex w-64 shrink-0 flex-col gap-3 md:w-auto"
    >
      <header className="flex items-center justify-between border-b pb-2">
        <h2 className="text-sm font-medium">{STATUS_LABELS[status]}</h2>
        <Badge variant="secondary" className="tabular-nums">
          {tasks.length}
        </Badge>
      </header>
      <div className="flex flex-col gap-2">
        {tasks.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            No tasks
          </p>
        ) : (
          tasks.map((task) => <BoardCard key={task.id} task={task} />)
        )}
      </div>
    </section>
  )
}

function BoardCard({ task }: { task: Task }) {
  return (
    <Card className="py-0">
      <CardContent className="flex flex-col items-start gap-2 p-3">
        <Link
          to={`/tasks/${task.id}`}
          className={cn(
            "text-sm font-medium hover:text-primary hover:underline",
            task.completed && "text-muted-foreground line-through",
          )}
        >
          {task.title}
        </Link>
        <StatusBadgeSelect task={task} />
      </CardContent>
    </Card>
  )
}

function BoardSkeleton() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-4 md:overflow-visible">
      {TASK_STATUSES.map((status) => (
        <div
          key={status}
          className="flex w-64 shrink-0 flex-col gap-3 md:w-auto"
        >
          <div className="flex items-center justify-between border-b pb-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-7 rounded-full" />
          </div>
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ))}
    </div>
  )
}
