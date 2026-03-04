"use client"

import * as React from "react"
import { ChevronDownIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/* ------------------------------------------------------------------ */
/*  Internal context to bridge the composed shadcn Select pattern      */
/*  (Select > SelectTrigger > SelectContent > SelectItem)              */
/*  into a flat native <select> + <option>.                            */
/* ------------------------------------------------------------------ */
interface ItemDef {
  value: string
  label: string
  disabled?: boolean | undefined
}

interface SelectCtx {
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean | undefined
  required?: boolean | undefined
  name?: string | undefined
  registerItem: (item: ItemDef) => void
  unregisterItem: (value: string) => void
  items: ItemDef[]
}

const SelectContext = React.createContext<SelectCtx | null>(null)

/* ------------------------------------------------------------------ */
/*  Select (root)                                                      */
/* ------------------------------------------------------------------ */
interface SelectProps {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  disabled?: boolean
  required?: boolean
  name?: string
  children?: React.ReactNode
}

function Select({
  value,
  defaultValue,
  onValueChange,
  disabled,
  required,
  name,
  children,
}: SelectProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? "")
  const [itemsMap, setItemsMap] = React.useState<Record<string, ItemDef>>({})
  
  const resolvedValue = value !== undefined ? value : internalValue

  const registerItem = React.useCallback((item: ItemDef) => {
    setItemsMap(prev => {
      if (prev[item.value]?.label === item.label && prev[item.value]?.disabled === item.disabled) {
        return prev;
      }
      return { ...prev, [item.value]: item };
    })
  }, [])

  const unregisterItem = React.useCallback((val: string) => {
    setItemsMap(prev => {
      if (!prev[val]) return prev;
      const next = { ...prev };
      delete next[val];
      return next;
    })
  }, [])

  const handleValueChange = React.useCallback(
    (v: string) => {
      if (value === undefined) setInternalValue(v)
      onValueChange?.(v)
    },
    [value, onValueChange],
  )

  const items = React.useMemo(() => Object.values(itemsMap), [itemsMap])

  const contextValue = React.useMemo(() => ({
    value: resolvedValue,
    onValueChange: handleValueChange,
    disabled,
    required,
    name,
    registerItem,
    unregisterItem,
    items
  }), [resolvedValue, handleValueChange, disabled, required, name, registerItem, unregisterItem, items])

  return (
    <SelectContext.Provider value={contextValue}>
      {children}
    </SelectContext.Provider>
  )
}

/* ------------------------------------------------------------------ */
/*  SelectTrigger — renders the native <select>                        */
/* ------------------------------------------------------------------ */
interface SelectValueProps {
  placeholder?: string;
  children?: React.ReactNode;
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<"button"> & { size?: "sm" | "default" }) {
  const ctx = React.useContext(SelectContext)
  if (!ctx) throw new Error("SelectTrigger must be used within a Select")

  // Find placeholder from children if SelectValue is present
  let placeholder: string | undefined
  React.Children.forEach(children, (child) => {
    if (React.isValidElement<SelectValueProps>(child) && 
        typeof child.type !== 'string' && 
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (child.type as any).displayName === "SelectValue") {
      placeholder = child.props.placeholder
    }
  })

  return (
    <div className="relative inline-flex w-full" data-slot="select-trigger">
      <select
        data-size={size}
        disabled={ctx.disabled}
        required={ctx.required}
        name={ctx.name}
        value={ctx.value || ""}
        onChange={(e) => ctx.onValueChange(e.target.value)}
        className={cn(
          "appearance-none border-input bg-background text-foreground placeholder:text-muted-foreground flex w-full min-w-[8rem] items-center rounded-md border pr-8 pl-3 text-sm shadow-xs transition-[color,box-shadow] outline-none",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          size === "sm" ? "h-8 text-xs" : "h-11 sm:h-9",
          className,
        )}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...(props as any)}
      >
        {placeholder && (
          <option value="" disabled={ctx.required}>
            {placeholder}
          </option>
        )}
        {ctx.items.map((item) => (
          <option key={item.value} value={item.value} disabled={item.disabled}>
            {item.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground z-10" />
      {/* Hidden children to allow SelectItem to mount and register */}
      <div className="hidden" aria-hidden="true">
        {children}
      </div>
    </div>
  )
}

function SelectValue({ placeholder: _p }: SelectValueProps) {
  return null
}
SelectValue.displayName = "SelectValue"

function SelectContent({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

/* ------------------------------------------------------------------ */
/*  SelectItem — Registers itself with the parent Select context       */
/* ------------------------------------------------------------------ */
interface SelectItemProps {
  children: React.ReactNode;
  value: string | number;
  disabled?: boolean;
}

function SelectItem({ children, value, disabled }: SelectItemProps) {
  const ctx = React.useContext(SelectContext)
  const valStr = String(value)
  const label = typeof children === "string" ? children : valStr

  React.useEffect(() => {
    if (!ctx) return
    ctx.registerItem({ value: valStr, label, disabled })
    return () => ctx.unregisterItem(valStr)
  }, [ctx, valStr, label, disabled])

  return null
}

/* ------------------------------------------------------------------ */
/*  Compat exports                                                      */
/* ------------------------------------------------------------------ */
function SelectGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function SelectLabel() { return null }
function SelectSeparator() { return null }
function SelectScrollUpButton() { return null }
function SelectScrollDownButton() { return null }

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
