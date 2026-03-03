"use client"

import * as React from "react"
import { MessageStrip } from "@ui5/webcomponents-react"
import { cn } from "@/lib/utils"

type AlertVariant = "default" | "destructive"

const VARIANT_TO_DESIGN = {
  default: "Information",
  destructive: "Negative",
} as const

function Alert({
  className,
  variant,
  children,
  ...props
}: React.ComponentProps<"div"> & { variant?: AlertVariant | null }) {
  const resolvedVariant = (variant ?? "default") as AlertVariant
  const design = VARIANT_TO_DESIGN[resolvedVariant]

  return (
    <MessageStrip
      data-slot="alert"
      design={design}
      hideCloseButton
      className={cn(
        "w-full rounded-lg [&]:p-4",
        className,
      )}
      {...(props as Record<string, unknown>)}
    >
      <div className="grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-0.5 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current">
        {children}
      </div>
    </MessageStrip>
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight",
        className,
      )}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-muted-foreground col-start-2 grid justify-items-start gap-1 text-sm [&_p]:leading-relaxed",
        className,
      )}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription }
