import { Check, ChevronDown } from "lucide-react"
import type { Task, TaskStatus } from "@/api/types"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useSetStatusMutation } from "@/hooks/use-tasks"
import {
  STATUS_BADGE_CLASSES,
  STATUS_ICONS,
  STATUS_LABELS,
  TASK_STATUSES,
} from "@/lib/task-status"
import { cn } from "@/lib/utils"

/** Display-only status badge (activity log, read-only contexts). */
export function StatusBadge({
  status,
  className,
}: {
  status: TaskStatus
  className?: string
}) {
  const Icon = STATUS_ICONS[status]
  return (
    <Badge
      variant="outline"
      className={cn(STATUS_BADGE_CLASSES[status], className)}
    >
      <Icon aria-hidden="true" />
      {STATUS_LABELS[status]}
    </Badge>
  )
}

/**
 * Clickable status badge: opens a menu listing the workflow states
 * (backlog → todo → in progress → complete); selecting one PATCHes the task
 * optimistically.
 */
export function StatusBadgeSelect({ task }: { task: Task }) {
  const setStatus = useSetStatusMutation()
  const Icon = STATUS_ICONS[task.status]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="group shrink-0 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50"
        disabled={setStatus.isPending}
        aria-label={`Change status of “${task.title}” (currently ${STATUS_LABELS[task.status]})`}
      >
        <Badge
          variant="outline"
          className={cn(
            STATUS_BADGE_CLASSES[task.status],
            "transition-opacity group-hover:opacity-80",
          )}
        >
          <Icon aria-hidden="true" />
          {STATUS_LABELS[task.status]}
          <ChevronDown aria-hidden="true" className="opacity-60" />
        </Badge>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Move to</DropdownMenuLabel>
        {TASK_STATUSES.map((status) => {
          const OptionIcon = STATUS_ICONS[status]
          return (
            <DropdownMenuItem
              key={status}
              onSelect={() => {
                if (status !== task.status) setStatus.mutate({ task, status })
              }}
            >
              <OptionIcon aria-hidden="true" className="text-muted-foreground" />
              <span className="flex-1">{STATUS_LABELS[status]}</span>
              {status === task.status && (
                <Check aria-hidden="true" className="text-primary" />
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
