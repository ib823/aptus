"use client"

import * as React from "react"
import {
  Select as UI5Select,
  Option,
} from "@ui5/webcomponents-react"
import type { Ui5CustomEvent } from "@ui5/webcomponents-react"
import { cn } from "@/lib/utils"
import { DialogPresenceContext } from "@/components/ui/dialog"

/* ------------------------------------------------------------------ */
/*  Internal context to collect SelectItems and bridge the composed    */
/*  shadcn pattern (Select > SelectTrigger > SelectContent > items)   */
/*  into the flat UI5 Select > Option pattern.                         */
/* ------------------------------------------------------------------ */
interface SelectCtx {
  value?: string
  onValueChange?: (value: string) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  disabled?: boolean
  required?: boolean
  name?: string
}

const SelectContext = React.createContext<SelectCtx>({})

/* ------------------------------------------------------------------ */
/*  Select (root) — wraps children, renders UI5 Select                 */
/* ------------------------------------------------------------------ */
interface SelectProps {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  disabled?: boolean
  required?: boolean
  name?: string
  children?: React.ReactNode
}

function Select({
  value,
  defaultValue,
  onValueChange,
  open,
  onOpenChange,
  disabled,
  required,
  name,
  children,
}: SelectProps) {
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
    <SelectContext.Provider
      value={{
        value: resolvedValue,
        onValueChange: handleValueChange,
        open,
        onOpenChange,
        disabled,
        required,
        name,
      }}
    >
      {children}
    </SelectContext.Provider>
  )
}

/* ------------------------------------------------------------------ */
/*  SelectTrigger — renders UI5 Select collecting items from content   */
/* ------------------------------------------------------------------ */
function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<"button"> & { size?: "sm" | "default" }) {
  return (
    <SelectTriggerRenderer className={className} size={size} {...props}>
      {children}
    </SelectTriggerRenderer>
  )
}

/**
 * SelectTriggerRenderer actually renders the UI5 Select.
 * It collects item information via context from SelectContent's children.
 */
function SelectTriggerRenderer({
  className,
  size,
  children: _triggerChildren,
  ...props
}: React.ComponentProps<"button"> & { size?: "sm" | "default" }) {
  const ctx = React.useContext(SelectContext)
  const [items, setItems] = React.useState<Array<{ value: string; label: string; disabled?: boolean }>>([])
  React.useContext(DialogPresenceContext) // consume context for compatibility

  return (
    <SelectItemsCollector.Provider value={{ items, setItems }}>
      <UI5Select
        data-slot="select"
        data-size={size}
        disabled={ctx.disabled}
        required={ctx.required}
        name={ctx.name}
        onChange={(e: Ui5CustomEvent) => {
          const selectedOption = (e.detail as Record<string, unknown>)?.selectedOption as HTMLElement | undefined
          const val = selectedOption?.getAttribute("data-value") ?? ""
          ctx.onValueChange?.(val)
        }}
        className={cn(
          "w-fit min-w-[8rem] rounded-md text-sm",
          size === "sm" ? "[&]:h-8" : "[&]:h-9",
          className,
        )}
        {...(props as Record<string, unknown>)}
      >
        {items.map((item) => (
          <Option
            key={item.value}
            data-value={item.value}
            selected={item.value === ctx.value}
            disabled={item.disabled}
          >
            {item.label}
          </Option>
        ))}
      </UI5Select>
    </SelectItemsCollector.Provider>
  )
}

/* Collector context for items */
interface ItemsCollectorCtx {
  items: Array<{ value: string; label: string; disabled?: boolean }>
  setItems: React.Dispatch<React.SetStateAction<Array<{ value: string; label: string; disabled?: boolean }>>>
}

const SelectItemsCollector = React.createContext<ItemsCollectorCtx>({
  items: [],
  setItems: () => {},
})

/* ------------------------------------------------------------------ */
/*  SelectValue — placeholder display (handled by UI5 Select)          */
/* ------------------------------------------------------------------ */
function SelectValue(_props: { placeholder?: string; children?: React.ReactNode }) {
  // UI5 Select handles display internally; this is a no-op for compatibility
  return null
}

/* ------------------------------------------------------------------ */
/*  SelectContent — collects children items                             */
/* ------------------------------------------------------------------ */
function SelectContent({
  className: _className,
  children,
  position: _position,
  align: _align,
  portal: _portal,
  ..._props
}: React.ComponentProps<"div"> & {
  position?: string
  align?: string
  portal?: boolean
}) {
  const collector = React.useContext(SelectItemsCollector)

  // Collect items from children on mount
  React.useEffect(() => {
    const collected: Array<{ value: string; label: string; disabled?: boolean }> = []

    function extractItems(nodes: React.ReactNode) {
      React.Children.forEach(nodes, (child) => {
        if (!React.isValidElement(child)) return
        const childProps = child.props as Record<string, unknown>

        // SelectItem
        if (childProps.value !== undefined && typeof childProps.value === "string") {
          const label =
            typeof childProps.children === "string"
              ? childProps.children
              : String(childProps.children ?? childProps.value)
          collected.push({
            value: childProps.value as string,
            label,
            disabled: childProps.disabled as boolean | undefined,
          })
        }

        // SelectGroup — recurse into children
        if (childProps.children && childProps.value === undefined) {
          extractItems(childProps.children as React.ReactNode)
        }
      })
    }

    extractItems(children)
    collector.setItems(collected)
  }, [children, collector])

  // Render nothing — items are collected and rendered by SelectTriggerRenderer
  return null
}

/* ------------------------------------------------------------------ */
/*  SelectItem                                                          */
/* ------------------------------------------------------------------ */
function SelectItem(_props: React.ComponentProps<"div"> & { value: string; disabled?: boolean }) {
  // Items are collected by SelectContent, not rendered directly
  return null
}

/* ------------------------------------------------------------------ */
/*  Compat exports (no-ops for API compatibility)                       */
/* ------------------------------------------------------------------ */
function SelectGroup({ children }: React.ComponentProps<"div">) {
  return <>{children}</>
}

function SelectLabel(_props: React.ComponentProps<"div">) {
  return null
}

function SelectSeparator(_props: React.ComponentProps<"div">) {
  return null
}

function SelectScrollUpButton(_props: Record<string, unknown>) {
  return null
}

function SelectScrollDownButton(_props: Record<string, unknown>) {
  return null
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
