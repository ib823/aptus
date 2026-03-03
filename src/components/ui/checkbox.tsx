"use client"

import * as React from "react"
import { CheckIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface CheckboxProps extends Omit<React.ComponentProps<"button">, "onChange"> {
  checked?: boolean | "indeterminate"
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean | "indeterminate") => void
  required?: boolean
  value?: string
}

function Checkbox({
  className,
  checked,
  onCheckedChange,
  disabled,
  required,
  name,
  id,
  ...props
}: CheckboxProps) {
  const isChecked = checked === true

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked === "indeterminate" ? "mixed" : isChecked}
      data-slot="checkbox"
      data-state={isChecked ? "checked" : "unchecked"}
      disabled={disabled}
      id={id}
      className={cn(
        "peer border-input data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:border-primary focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive flex size-4 shrink-0 items-center justify-center rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      onClick={() => onCheckedChange?.(!isChecked)}
      {...props}
    >
      {isChecked && <CheckIcon className="size-3.5" />}
      {checked === "indeterminate" && (
        <div className="size-2 rounded-[1px] bg-current" />
      )}
      {name && (
        <input
          type="hidden"
          name={name}
          value={isChecked ? "on" : ""}
          required={required}
        />
      )}
    </button>
  )
}

export { Checkbox }
