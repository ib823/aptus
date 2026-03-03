"use client"

import * as React from "react"
import { RadioButton as UI5RadioButton } from "@ui5/webcomponents-react"
import type { Ui5CustomEvent } from "@ui5/webcomponents-react"
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
  value?: string
  onValueChange?: (value: string) => void
  name?: string
  disabled?: boolean
  required?: boolean
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

  const handleChange = (_e: Ui5CustomEvent) => {
    ctx.onValueChange?.(itemValue)
  }

  return (
    <UI5RadioButton
      data-slot="radio-group-item"
      name={ctx.name ?? "radio-group"}
      checked={ctx.value === itemValue}
      disabled={ctx.disabled || itemDisabled}
      onChange={handleChange}
      text={typeof children === "string" ? children : undefined}
      className={cn("shrink-0", className)}
      {...(props as Record<string, unknown>)}
    />
  )
}

export { RadioGroup, RadioGroupItem }
