"use client"

import * as React from "react"
import { TextArea as UI5TextArea } from "@ui5/webcomponents-react"
import { cn } from "@/lib/utils"

interface TextareaProps extends Omit<React.ComponentProps<"textarea">, "onChange" | "onInput"> {
  onChange?: React.ChangeEventHandler<HTMLTextAreaElement>
  onInput?: React.ChangeEventHandler<HTMLTextAreaElement>
}

function Textarea({
  className,
  onChange,
  onInput,
  value,
  defaultValue: _defaultValue,
  placeholder,
  disabled,
  readOnly,
  name,
  id,
  required,
  rows,
  maxLength,
  ...props
}: TextareaProps) {
  const handleInput = (e: unknown) => {
    const event = e as { target: unknown }
    const target = event.target as HTMLTextAreaElement
    const syntheticEvent = {
      ...event,
      target,
      currentTarget: target,
      type: "change",
    } as unknown as React.ChangeEvent<HTMLTextAreaElement>
    onChange?.(syntheticEvent)
    onInput?.(syntheticEvent)
  }

  const ariaInvalid = props["aria-invalid"]
  const valueState = ariaInvalid ? "Negative" : "None"

  return (
    <UI5TextArea
      data-slot="textarea"
      value={value != null ? String(value) : ""}
      placeholder={placeholder ?? ""}
      disabled={disabled ?? false}
      readonly={readOnly ?? false}
      name={name ?? ""}
      id={id}
      required={required ?? false}
      rows={rows ?? 3}
      maxlength={maxLength ?? 0}
      growing
      valueState={valueState as "None" | "Negative" | "Positive" | "Critical" | "Information"}
      onInput={handleInput}
      className={cn("w-full min-h-16 rounded-md text-base md:text-sm", className)}
      {...({ "aria-invalid": ariaInvalid } as Record<string, unknown>)}
    />
  )
}

export { Textarea }
