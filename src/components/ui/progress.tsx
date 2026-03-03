"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface ProgressProps extends Omit<React.ComponentProps<"div">, "value"> {
  value?: number | null
  max?: number
  displayValue?: string
}

function Progress({
  className,
  value,
  max = 100,
  displayValue,
  ...props
}: ProgressProps) {
  const numericValue = Math.min(Math.max(value ?? 0, 0), max)
  const percentage = (numericValue / max) * 100

  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuenow={numericValue}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuetext={displayValue}
      className={cn("bg-muted relative h-2 w-full overflow-hidden rounded-full", className)}
      {...props}
    >
      <div
        className="bg-primary h-full rounded-full transition-all duration-300"
        style={{ width: `${percentage}%` }}
      />
    </div>
  )
}

export { Progress }
