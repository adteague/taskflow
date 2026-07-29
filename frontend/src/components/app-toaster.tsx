import { Toaster } from "sonner"
import { useTheme } from "@/lib/theme"

/**
 * App-wide toast outlet, styled with the brand tokens. Success confirmations
 * stay subtle (card surface); error rollbacks read prominently (destructive
 * accent + longer duration, set at the call sites via toast.error).
 */
export function AppToaster() {
  const { theme } = useTheme()
  return (
    <Toaster
      theme={theme}
      position="bottom-right"
      offset={16}
      duration={2500}
      toastOptions={{
        style: { fontFamily: "inherit" },
        classNames: {
          toast: "!rounded-lg !border-border !bg-card !text-foreground !shadow-lg",
          title: "!font-medium",
          description: "!text-muted-foreground",
          error:
            "!border-destructive/60 !bg-card !text-destructive [&_[data-description]]:!text-destructive/80",
        },
      }}
    />
  )
}
