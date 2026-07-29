import {
  CheckCircle2,
  Circle,
  CircleDashed,
  CircleDot,
  type LucideIcon,
} from "lucide-react"
import type { TaskStatus } from "@/api/types"

/** Workflow order: backlog → todo → in progress → complete. */
export const TASK_STATUSES: TaskStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "complete",
]

export const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  complete: "Complete",
}

export const STATUS_ICONS: Record<TaskStatus, LucideIcon> = {
  backlog: CircleDashed,
  todo: Circle,
  in_progress: CircleDot,
  complete: CheckCircle2,
}

/** Badge colors per status, tuned for both themes like the original pair. */
export const STATUS_BADGE_CLASSES: Record<TaskStatus, string> = {
  backlog:
    "border-zinc-500/25 bg-zinc-100 text-zinc-600 dark:border-zinc-400/25 dark:bg-zinc-400/10 dark:text-zinc-400",
  todo: "border-sky-600/25 bg-sky-50 text-sky-700 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-400",
  in_progress:
    "border-amber-600/25 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-400",
  complete:
    "border-emerald-600/25 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-400",
}

export function isTaskStatus(value: unknown): value is TaskStatus {
  return (TASK_STATUSES as unknown[]).includes(value)
}

/**
 * Human label for a status value coming from data (activity log old/new
 * values). Handles the pre-status-model legacy strings too.
 */
export function statusValueLabel(value: string | null): string {
  if (value === null) return "unknown"
  if (isTaskStatus(value)) return STATUS_LABELS[value]
  if (value === "pending") return "Pending"
  if (value === "completed") return "Completed"
  return value
}
