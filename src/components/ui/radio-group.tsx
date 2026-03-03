"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface RadioGroupProps extends Omit<React.ComponentProps<"div">, "onChange" | "value" | "defaultValue"> {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  disabled?: boolean
  required?: boolean
  name?: string
  orientation?: "horizontal" | "vertical"
}

const RadioGroupContext = React.createContext<{
  value?: string | undefined
  onValueChange?: ((value: string) => void) | undefined
  name?: string | undefined
  disabled?: boolean | undefined
  required?: boolean | undefined
}>({})

function RadioGroup({
  className,
  value,
  defaultValue,
  onValueChange,
  disabled,
  required,
  name,
  orientation,
  children,
  ...props
}: RadioGroupProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? "")
  const resolvedValue = value !== undefined ? value : internalValue

  const handleValueChange = React.useCallback(
    (v: string) => {
      if (value === undefined) setInternalValue(v)
      onValueChange?.(v)
    },
    [value, onValueChange],
  )

  return (
    <RadioGroupContext.Provider
      value={{ value: resolvedValue, onValueChange: handleValueChange, name, disabled, required }}
    >
      <div
        data-slot="radio-group"
        role="radiogroup"
        aria-orientation={orientation}
        className={cn("grid gap-3", className)}
        {...props}
      >
        {children}
      </div>
    </RadioGroupContext.Provider>
  )
}

interface RadioGroupItemProps extends Omit<React.ComponentProps<"button">, "value"> {
  value: string
}

function RadioGroupItem({
  className,
  value: itemValue,
  disabled: itemDisabled,
  children,
  ...props
}: RadioGroupItemProps) {
  const ctx = React.useContext(RadioGroupContext)
  const isSelected = ctx.value === itemValue

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        role="radio"
        aria-checked={isSelected}
        data-slot="radio-group-item"
        data-state={isSelected ? "checked" : "unchecked"}
        disabled={ctx.disabled || itemDisabled}
        onClick={() => ctx.onValueChange?.(itemValue)}
        className={cn(
          "border-input text-primary focus-visible:ring-ring/50 aspect-square size-4 shrink-0 rounded-full border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {isSelected && (
          <span className="flex items-center justify-center">
            <span className="bg-primary size-2 rounded-full" />
          </span>
        )}
      </button>
      {children && (
        <span className="text-sm">{children}</span>
      )}
    </div>
  )
}

export { RadioGroup, RadioGroupItem }
