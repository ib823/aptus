"use client"

import * as React from "react"
import { Switch as UI5Switch } from "@ui5/webcomponents-react"
import type { Ui5CustomEvent } from "@ui5/webcomponents-react"
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
  defaultChecked: _defaultChecked,
  onCheckedChange,
  disabled,
  name: _name,
  id: _id,
  size = "default",
  ...props
}: SwitchProps) {
  const handleChange = (e: Ui5CustomEvent) => {
    const target = e.target as HTMLInputElement
    onCheckedChange?.(target.checked)
  }

  return (
    <UI5Switch
      data-slot="switch"
      data-size={size}
      checked={checked ?? false}
      disabled={disabled ?? false}
      onChange={handleChange}
      className={cn(
        "shrink-0",
        size === "sm" && "[&]:scale-75",
        className,
      )}
      {...(props as Record<string, unknown>)}
    />
  )
}

export { Switch }
