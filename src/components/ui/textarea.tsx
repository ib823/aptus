"use client"

import * as React from "react"
import { TextArea as UI5TextArea } from "@ui5/webcomponents-react"
import type { Ui5CustomEvent } from "@ui5/webcomponents-react"
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
  const handleInput = (e: Ui5CustomEvent) => {
    const target = e.target as unknown as HTMLTextAreaElement
    const syntheticEvent = {
      ...e,
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
      value={value != null ? String(value) : undefined}
      placeholder={placeholder}
      disabled={disabled}
      readonly={readOnly}
      name={name}
      id={id}
      required={required}
      rows={rows ?? 3}
      maxlength={maxLength}
      growing
      valueState={valueState}
      onInput={handleInput}
      className={cn("w-full min-h-16 rounded-md text-base md:text-sm", className)}
      {...({ "aria-invalid": ariaInvalid } as Record<string, unknown>)}
    />
  )
}

export { Textarea }
