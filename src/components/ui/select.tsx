"use client"

import * as React from "react"
import { ChevronDownIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/* ------------------------------------------------------------------ */
/*  Internal context to bridge the composed shadcn Select pattern      */
/*  (Select > SelectTrigger > SelectContent > SelectItem)              */
/*  into a flat native <select> + <option>.                            */
/* ------------------------------------------------------------------ */
interface SelectCtx {
  value?: string | undefined
  onValueChange?: ((value: string) => void) | undefined
  disabled?: boolean | undefined
  required?: boolean | undefined
  name?: string | undefined
}

const SelectContext = React.createContext<SelectCtx>({})

/* ------------------------------------------------------------------ */
/*  Select (root)                                                      */
/* ------------------------------------------------------------------ */
interface SelectProps {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  disabled?: boolean | undefined
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
/*  Collector context — gathers items from SelectContent children      */
/* ------------------------------------------------------------------ */
interface ItemDef {
  value: string
  label: string
  disabled?: boolean | undefined
}

interface ItemsCollectorCtx {
  items: ItemDef[]
  setItems: React.Dispatch<React.SetStateAction<ItemDef[]>>
}

const SelectItemsCollector = React.createContext<ItemsCollectorCtx>({
  items: [],
  setItems: () => {},
})

/* ------------------------------------------------------------------ */
/*  SelectTrigger — renders the native <select>                        */
/* ------------------------------------------------------------------ */
function SelectTrigger({
  className,
  size = "default",
  children: _triggerChildren,
  ...props
}: React.ComponentProps<"button"> & { size?: "sm" | "default" }) {
  const ctx = React.useContext(SelectContext)
  const [items, setItems] = React.useState<ItemDef[]>([])

  return (
    <SelectItemsCollector.Provider value={{ items, setItems }}>
      <div className="relative inline-flex" data-slot="select">
        <select
          data-size={size}
          disabled={ctx.disabled}
          required={ctx.required}
          name={ctx.name}
          value={ctx.value}
          onChange={(e) => ctx.onValueChange?.(e.target.value)}
          className={cn(
            "appearance-none border-input bg-background text-foreground placeholder:text-muted-foreground flex w-full min-w-[8rem] items-center rounded-md border pr-8 pl-3 text-sm shadow-xs transition-[color,box-shadow] outline-none",
            "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
            "disabled:cursor-not-allowed disabled:opacity-50",
            size === "sm" ? "h-8 text-xs" : "h-9",
            className,
          )}
          {...(props as React.ComponentProps<"select">)}
        >
          {items.map((item) => (
            <option key={item.value} value={item.value} disabled={item.disabled}>
              {item.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
      </div>
    </SelectItemsCollector.Provider>
  )
}

/* ------------------------------------------------------------------ */
/*  SelectValue — no-op for compat (native select shows value)         */
/* ------------------------------------------------------------------ */
function SelectValue(_props: { placeholder?: string; children?: React.ReactNode }) {
  return null
}

/* ------------------------------------------------------------------ */
/*  SelectContent — collects children items via context                 */
/* ------------------------------------------------------------------ */
function SelectContent({
  children,
  ..._props
}: React.ComponentProps<"div"> & {
  position?: string
  align?: string
  portal?: boolean
}) {
  const collector = React.useContext(SelectItemsCollector)

  React.useEffect(() => {
    const collected: ItemDef[] = []

    function extractItems(nodes: React.ReactNode) {
      React.Children.forEach(nodes, (child) => {
        if (!React.isValidElement(child)) return
        const childProps = child.props as Record<string, unknown>

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

        if (childProps.children && childProps.value === undefined) {
          extractItems(childProps.children as React.ReactNode)
        }
      })
    }

    extractItems(children)
    collector.setItems(collected)
  }, [children, collector])

  return null
}

/* ------------------------------------------------------------------ */
/*  SelectItem                                                          */
/* ------------------------------------------------------------------ */
function SelectItem(_props: React.ComponentProps<"div"> & { value: string; disabled?: boolean | undefined }) {
  return null
}

/* ------------------------------------------------------------------ */
/*  Compat exports (no-ops)                                             */
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
