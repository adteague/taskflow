import { useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Copy, Eye, EyeOff, KeyRound, Plug, RefreshCw, Wrench } from "lucide-react"
import { toast } from "sonner"
import { API_BASE, getErrorMessage } from "@/api/client"
import { getMcpInfo, rotateToken } from "@/api/endpoints"
import type { McpTool } from "@/api/types"
import { useAuth } from "@/auth/auth-context"
import { ErrorState } from "@/components/error-state"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

const MCP_URL = `${API_BASE}/mcp`

async function copyText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(`${label} copied to clipboard`)
  } catch {
    toast.error("Couldn't copy — your browser blocked clipboard access")
  }
}

function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => void copyText(value, label)}
    >
      <Copy aria-hidden="true" />
      Copy
    </Button>
  )
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-md border bg-background/70 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
      {children}
    </pre>
  )
}

function toolParams(tool: McpTool): string[] {
  const schema = tool.inputSchema as { properties?: Record<string, unknown> }
  return Object.keys(schema.properties ?? {})
}

function ToolsSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-4 w-72" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </CardContent>
    </Card>
  )
}

/**
 * Two-step confirmation before rotating: rotation immediately revokes the
 * previous token (server-side token versioning), disconnecting any agent
 * still using it — worth making the user say it twice.
 */
function RotateTokenDialog({
  open,
  onOpenChange,
  onConfirm,
  pending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  pending: boolean
}) {
  const [step, setStep] = useState<1 | 2>(1)

  const handleOpenChange = (next: boolean) => {
    if (!next) setStep(1)
    onOpenChange(next)
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        {step === 1 ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Rotate access token?</AlertDialogTitle>
              <AlertDialogDescription>
                This mints a new token for your session and{" "}
                <span className="font-medium text-foreground">
                  immediately revokes your current token
                </span>{" "}
                — including every copy already pasted into agents, scripts, or
                MCP clients.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault()
                  setStep(2)
                }}
              >
                Continue
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm revocation</AlertDialogTitle>
              <AlertDialogDescription>
                Anything still using the old token will start receiving 401s
                until you reconnect it with the new one. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>
                Keep current token
              </AlertDialogCancel>
              <AlertDialogAction
                className={buttonVariants({ variant: "destructive" })}
                disabled={pending}
                onClick={(event) => {
                  event.preventDefault()
                  onConfirm()
                }}
              >
                {pending ? "Rotating…" : "Revoke & rotate"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function McpPage() {
  const { token, email, login } = useAuth()
  const [revealed, setRevealed] = useState(false)
  const [rotateOpen, setRotateOpen] = useState(false)

  const infoQuery = useQuery({
    queryKey: ["mcp-info"],
    queryFn: getMcpInfo,
    staleTime: 5 * 60_000,
  })

  const rotateMutation = useMutation({
    mutationFn: rotateToken,
    onSuccess: (response) => {
      // Swap the fresh token into the session in place — no re-login needed.
      login(response.token, email ?? response.user.email)
      setRotateOpen(false)
      toast.success("New token minted — the previous token is now revoked")
    },
    onError: (error) => {
      toast.error("Couldn't rotate token", {
        description: getErrorMessage(error),
      })
    },
  })

  const displayToken =
    token === null
      ? ""
      : revealed
        ? token
        : `${token.slice(0, 20)}••••••••••••${token.slice(-8)}`

  const connectCommand = `claude mcp add --transport http taskflow ${MCP_URL} --header "Authorization: Bearer ${token ?? "<token>"}"`
  const displayCommand = `claude mcp add --transport http taskflow ${MCP_URL} --header "Authorization: Bearer ${revealed ? (token ?? "<token>") : "<your token — reveal or copy below>"}"`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Plug className="size-6 text-primary" aria-hidden="true" />
          Connect an Agent
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This app doubles as an MCP server: AI agents can read and manage the
          same live task list you see here, with every change appearing in this
          UI and in each task&apos;s activity log.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connection</CardTitle>
          <CardDescription>
            Streamable HTTP transport, authenticated with the same JWT this app
            uses. The server is self-describing — agents discover every tool
            below automatically on connect.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-md border bg-background/70 px-2.5 py-1.5 font-mono text-xs">
              {MCP_URL}
            </code>
            <CopyButton value={MCP_URL} label="Server URL" />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Connect from Claude Code
            </p>
            <CodeBlock>{displayCommand}</CodeBlock>
            <div className="mt-2">
              <CopyButton value={connectCommand} label="Connect command" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4 text-primary" aria-hidden="true" />
            Your access token
          </CardTitle>
          <CardDescription>
            Agents authenticate with the JWT from your current session — no
            separate key to generate. Tokens expire after 24 hours. Rotating
            mints a fresh one and immediately revokes the old one everywhere.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <CodeBlock>{displayToken}</CodeBlock>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRevealed((r) => !r)}
              aria-pressed={revealed}
            >
              {revealed ? (
                <EyeOff aria-hidden="true" />
              ) : (
                <Eye aria-hidden="true" />
              )}
              {revealed ? "Hide" : "Reveal"}
            </Button>
            {token !== null && <CopyButton value={token} label="Token" />}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRotateOpen(true)}
            >
              <RefreshCw aria-hidden="true" />
              Rotate token
            </Button>
          </div>
        </CardContent>
      </Card>

      {infoQuery.isPending ? (
        <ToolsSkeleton />
      ) : infoQuery.isError ? (
        <ErrorState
          error={infoQuery.error}
          onRetry={() => void infoQuery.refetch()}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="size-4 text-primary" aria-hidden="true" />
              Tools
              <Badge variant="secondary">{infoQuery.data.tools.length}</Badge>
            </CardTitle>
            <CardDescription>
              Introspected live from the running server — exactly what an
              agent receives from tools/list.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {infoQuery.data.tools.map((tool) => (
                <li key={tool.name} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <code className="font-mono text-sm font-medium">
                      {tool.name}
                    </code>
                    {toolParams(tool).map((param) => (
                      <Badge
                        key={param}
                        variant="outline"
                        className="font-mono text-[10px]"
                      >
                        {param}
                      </Badge>
                    ))}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {tool.description}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <RotateTokenDialog
        open={rotateOpen}
        onOpenChange={setRotateOpen}
        onConfirm={() => rotateMutation.mutate()}
        pending={rotateMutation.isPending}
      />
    </div>
  )
}
