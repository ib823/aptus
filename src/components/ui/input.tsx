"use client"

import * as React from "react"
import { Input as UI5Input } from "@ui5/webcomponents-react"
import type { Ui5CustomEvent } from "@ui5/webcomponents-react"
import { cn } from "@/lib/utils"

const TYPE_MAP = {
  text: "Text",
  password: "Password",
  email: "Email",
  number: "Number",
  tel: "Tel",
  url: "URL",
  search: "Search",
} as const

interface InputProps extends Omit<React.ComponentProps<"input">, "onChange" | "onInput"> {
  onChange?: React.ChangeEventHandler<HTMLInputElement>
  onInput?: React.ChangeEventHandler<HTMLInputElement>
}

function Input({ className, type = "text", onChange, onInput, value, defaultValue, placeholder, disabled, readOnly, name, id, required, ...props }: InputProps) {
  // For file inputs, fall back to native input since UI5 Input doesn't support file type
  if (type === "file") {
    return (
      <input
        type="file"
        data-slot="input"
        className={cn(
          "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
          className,
        )}
        onChange={onChange}
        disabled={disabled}
        name={name}
        id={id}
        required={required}
        {...(props as React.ComponentProps<"input">)}
      />
    )
  }

  // For hidden inputs, render native input
  if (type === "hidden") {
    return (
      <input
        type="hidden"
        name={name}
        id={id}
        value={value}
        defaultValue={defaultValue}
        {...(props as React.ComponentProps<"input">)}
      />
    )
  }

  const ui5Type = TYPE_MAP[type] ?? "Text"

  const handleInput = (e: Ui5CustomEvent) => {
    const target = e.target as HTMLInputElement
    const syntheticEvent = {
      ...e,
      target,
      currentTarget: target,
      type: "change",
    } as unknown as React.ChangeEvent<HTMLInputElement>
    onChange?.(syntheticEvent)
    onInput?.(syntheticEvent)
  }

  // Determine aria-invalid from props
  const ariaInvalid = props["aria-invalid"]
  const valueState = ariaInvalid ? "Negative" : "None"

  return (
    <UI5Input
      data-slot="input"
      type={ui5Type}
      value={value != null ? String(value) : undefined}
      placeholder={placeholder}
      disabled={disabled}
      readonly={readOnly}
      name={name}
      id={id}
      required={required}
      valueState={valueState}
      onInput={handleInput}
      className={cn(
        "h-9 w-full min-w-0 rounded-md text-base md:text-sm",
        className,
      )}
      {...({ "aria-invalid": ariaInvalid } as Record<string, unknown>)}
    />
  )
}

export { Input }
