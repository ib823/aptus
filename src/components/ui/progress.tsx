"use client"

import * as React from "react"
import { ProgressIndicator } from "@ui5/webcomponents-react"
import { cn } from "@/lib/utils"

interface ProgressProps extends Omit<React.ComponentProps<"div">, "value"> {
  value?: number | null
  max?: number
  displayValue?: string
}

function Progress({
  className,
  value,
  max: _max,
  displayValue,
  ...props
}: ProgressProps) {
  const numericValue = value ?? 0

  return (
    <ProgressIndicator
      data-slot="progress"
      value={numericValue}
      displayValue={displayValue}
      className={cn("w-full", className)}
      {...(props as Record<string, unknown>)}
    />
  )
}

export { Progress }
