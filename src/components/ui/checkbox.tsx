"use client"

import * as React from "react"
import { CheckBox as UI5CheckBox } from "@ui5/webcomponents-react"
import type { Ui5CustomEvent } from "@ui5/webcomponents-react"
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
  defaultChecked: _defaultChecked,
  onCheckedChange,
  disabled,
  required,
  name,
  id,
  value: _value,
  ...props
}: CheckboxProps) {
  const handleChange = (e: Ui5CustomEvent) => {
    const target = e.target as HTMLInputElement
    onCheckedChange?.(target.checked)
  }

  return (
    <UI5CheckBox
      data-slot="checkbox"
      checked={checked === true}
      indeterminate={checked === "indeterminate"}
      disabled={disabled ?? false}
      required={required ?? false}
      name={name ?? ""}
      id={id}
      onChange={handleChange}
      className={cn("shrink-0", className)}
      {...(props as Record<string, unknown>)}
    />
  )
}

export { Checkbox }
