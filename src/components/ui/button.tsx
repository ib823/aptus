"use client"

import * as React from "react"
import { Button as UI5Button } from "@ui5/webcomponents-react"
import { Slot } from "radix-ui"
import { cn } from "@/lib/utils"

type ButtonVariant = "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
type ButtonSize = "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg"

const VARIANT_TO_DESIGN = {
  default: "Emphasized",
  destructive: "Negative",
  outline: "Default",
  secondary: "Default",
  ghost: "Transparent",
  link: "Transparent",
} as const

const SIZE_CLASSES: Record<ButtonSize, string> = {
  default: "[&]:h-9 [&]:px-4 [&]:py-2",
  xs: "[&]:h-6 [&]:px-2 [&]:text-xs [&]:rounded-md",
  sm: "[&]:h-8 [&]:px-3 [&]:rounded-md",
  lg: "[&]:h-10 [&]:px-6 [&]:rounded-md",
  icon: "[&]:size-9 [&]:min-w-0 [&]:p-0",
  "icon-xs": "[&]:size-6 [&]:min-w-0 [&]:p-0 [&]:rounded-md",
  "icon-sm": "[&]:size-8 [&]:min-w-0 [&]:p-0",
  "icon-lg": "[&]:size-10 [&]:min-w-0 [&]:p-0",
}

const LINK_VARIANT_CLASSES = "underline-offset-4 hover:underline"

/**
 * Generates class names for button variants (for consumers that use buttonVariants directly).
 */
function buttonVariants({
  variant = "default",
  size = "default",
  className,
}: {
  variant?: ButtonVariant | null | undefined
  size?: ButtonSize | null | undefined
  className?: string | undefined
} = {}) {
  return cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium cursor-pointer transition-all",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0",
    SIZE_CLASSES[(size ?? "default") as ButtonSize],
    (variant ?? "default") === "link" && LINK_VARIANT_CLASSES,
    className,
  )
}

interface ButtonProps extends Omit<React.ComponentProps<"button">, "type"> {
  variant?: ButtonVariant | null
  size?: ButtonSize | null
  asChild?: boolean
  type?: "button" | "submit" | "reset"
}

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  disabled,
  onClick,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  const resolvedVariant = (variant ?? "default") as ButtonVariant
  const resolvedSize = (size ?? "default") as ButtonSize

  // asChild: render as the child element (e.g. a Next.js Link) with button styling
  if (asChild) {
    return (
      <Slot.Root
        data-slot="button"
        data-variant={resolvedVariant}
        data-size={resolvedSize}
        className={cn(buttonVariants({ variant: resolvedVariant, size: resolvedSize, className }))}
        {...props}
        onClick={onClick as React.MouseEventHandler}
      >
        {children}
      </Slot.Root>
    )
  }

  const design = VARIANT_TO_DESIGN[resolvedVariant]
  const sizeClass = SIZE_CLASSES[resolvedSize]

  return (
    <UI5Button
      data-slot="button"
      data-variant={resolvedVariant}
      data-size={resolvedSize}
      design={design}
      disabled={disabled ?? false}
      type={type === "submit" ? "Submit" : type === "reset" ? "Reset" : "Button"}
      onClick={(e: unknown) => {
        if (onClick) {
          onClick(e as React.MouseEvent<HTMLButtonElement>)
        }
      }}
      className={cn(
        sizeClass,
        resolvedVariant === "link" && LINK_VARIANT_CLASSES,
        "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...(props as Record<string, unknown>)}
    >
      {children}
    </UI5Button>
  )
}

export { Button, buttonVariants }
