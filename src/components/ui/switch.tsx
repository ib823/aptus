"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface SwitchProps extends Omit<React.ComponentProps<"button">, "onChange"> {
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  required?: boolean
  size?: "sm" | "default"
}

function Switch({
  className,
  checked,
  onCheckedChange,
  disabled,
  size = "default",
  ...props
}: SwitchProps) {
  const isChecked = checked ?? false

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isChecked}
      data-slot="switch"
      data-state={isChecked ? "checked" : "unchecked"}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!isChecked)}
      className={cn(
        "peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:ring-ring/50 inline-flex shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-4 w-7" : "h-5 w-9",
        className,
      )}
      {...props}
    >
      <span
        data-state={isChecked ? "checked" : "unchecked"}
        className={cn(
          "bg-background pointer-events-none block rounded-full shadow-lg ring-0 transition-transform",
          size === "sm" ? "size-3" : "size-4",
          isChecked
            ? size === "sm" ? "translate-x-3" : "translate-x-4"
            : "translate-x-0",
        )}
      />
    </button>
  )
}

export { Switch }
