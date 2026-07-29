import { useEffect, useState, type FormEvent } from "react"
import type { Task } from "@/api/types"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useUpdateTitleMutation } from "@/hooks/use-tasks"

const MAX_TITLE_LENGTH = 200

interface EditTaskDialogProps {
  task: Task
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditTaskDialog({ task, open, onOpenChange }: EditTaskDialogProps) {
  const [title, setTitle] = useState(task.title)
  const [validationError, setValidationError] = useState<string | null>(null)
  const updateTitle = useUpdateTitleMutation()

  // Reset the form each time the dialog opens.
  useEffect(() => {
    if (open) {
      setTitle(task.title)
      setValidationError(null)
      updateTitle.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task.title])

  const trimmed = title.trim()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (trimmed.length === 0) {
      setValidationError("Title cannot be empty.")
      return
    }
    if (trimmed.length > MAX_TITLE_LENGTH) {
      setValidationError(
        `Title must be at most ${MAX_TITLE_LENGTH} characters (currently ${trimmed.length}).`,
      )
      return
    }
    setValidationError(null)
    if (trimmed !== task.title) {
      // Optimistic: the new title is already visible in the list/detail when
      // the dialog closes; a failure rolls it back with an error toast.
      updateTitle.mutate({ id: task.id, title: trimmed })
    }
    onOpenChange(false)
  }

  const errorMessage = validationError

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Edit task</DialogTitle>
            <DialogDescription>
              Update the task title. Titles are trimmed and limited to{" "}
              {MAX_TITLE_LENGTH} characters.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={`edit-task-title-${task.id}`}>Title</Label>
            <Input
              id={`edit-task-title-${task.id}`}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              aria-invalid={errorMessage ? true : undefined}
              autoFocus
            />
            {errorMessage && (
              <p className="text-sm text-destructive" role="alert">
                {errorMessage}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={trimmed.length === 0}>
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
