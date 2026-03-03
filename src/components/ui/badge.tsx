"use client"

import * as React from "react"
import { Tag } from "@ui5/webcomponents-react"
import { Slot } from "radix-ui"
import { cn } from "@/lib/utils"

type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "ghost" | "link"

/**
 * Maps badge variants to a combination of Tailwind classes that complement
 * the UI5 Tag styling. We keep the CSS-based approach for variants that
 * don't have direct UI5 Tag design equivalents.
 */
const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: "bg-primary text-primary-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  destructive: "bg-destructive text-white",
  outline: "border border-border text-foreground bg-transparent",
  ghost: "bg-transparent text-foreground",
  link: "text-primary underline-offset-4 hover:underline bg-transparent",
}

function badgeVariants({
  variant = "default",
}: {
  variant?: BadgeVariant | null
} = {}) {
  return cn(
    "inline-flex items-center justify-center rounded-full border border-transparent px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none transition-[color,box-shadow] overflow-hidden",
    VARIANT_CLASSES[(variant ?? "default") as BadgeVariant],
  )
}

interface BadgeProps extends React.ComponentProps<"span"> {
  variant?: BadgeVariant | null
  asChild?: boolean
}

function Badge({
  className,
  variant = "default",
  asChild = false,
  children,
  ...props
}: BadgeProps) {
  const resolvedVariant = (variant ?? "default") as BadgeVariant

  // For outline/ghost/link variants or asChild, use styled span/slot
  if (asChild) {
    return (
      <Slot.Root
        data-slot="badge"
        data-variant={resolvedVariant}
        className={cn(badgeVariants({ variant: resolvedVariant }), className)}
        {...props}
      >
        {children}
      </Slot.Root>
    )
  }

  // Use UI5 Tag for standard badge rendering
  return (
    <Tag
      data-slot="badge"
      data-variant={resolvedVariant}
      className={cn(
        badgeVariants({ variant: resolvedVariant }),
        className,
      )}
      {...(props as Record<string, unknown>)}
    >
      {children}
    </Tag>
  )
}

export { Badge, badgeVariants }
