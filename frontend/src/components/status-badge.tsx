import { CheckCircle2, Circle } from "lucide-react"
import { Badge } from "@/components/ui/badge"

export function StatusBadge({ completed }: { completed: boolean }) {
  return completed ? (
    <Badge variant="success">
      <CheckCircle2 aria-hidden="true" />
      Completed
    </Badge>
  ) : (
    <Badge variant="pending">
      <Circle aria-hidden="true" />
      Pending
    </Badge>
  )
}
