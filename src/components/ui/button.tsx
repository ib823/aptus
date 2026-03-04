"use client"

import * as React from "react"
import { Slot } from "radix-ui"
import { cn } from "@/lib/utils"

type ButtonVariant = "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
type ButtonSize = "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg"

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  default:
    "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
  destructive:
    "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20",
  outline:
    "border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
  secondary:
    "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
  ghost:
    "hover:bg-accent hover:text-accent-foreground",
  link:
    "text-primary underline-offset-4 hover:underline",
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  default: "h-9 px-4 py-2",
  xs: "h-6 px-2 text-xs rounded-md",
  sm: "h-8 px-3 rounded-md",
  lg: "h-10 px-6 rounded-md",
  icon: "size-9 min-w-0 p-0",
  "icon-xs": "size-6 min-w-0 p-0 rounded-md",
  "icon-sm": "size-8 min-w-0 p-0",
  "icon-lg": "size-10 min-w-0 p-0",
}

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
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium cursor-pointer transition-all min-h-[44px] sm:min-h-0",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0",
    SIZE_CLASSES[(size ?? "default") as ButtonSize],
    VARIANT_CLASSES[(variant ?? "default") as ButtonVariant],
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

  return (
    <button
      data-slot="button"
      data-variant={resolvedVariant}
      data-size={resolvedSize}
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(buttonVariants({ variant: resolvedVariant, size: resolvedSize, className }))}
      {...props}
    >
      {children}
    </button>
  )
}

export { Button, buttonVariants }
