"use client"

import * as React from "react"
import { XIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/* ------------------------------------------------------------------ */
/*  Sheet context (manages open/close state)                           */
/* ------------------------------------------------------------------ */
interface SheetCtx {
  open: boolean
  setOpen: (v: boolean) => void
}

const SheetContext = React.createContext<SheetCtx>({
  open: false,
  setOpen: () => {},
})

/* ------------------------------------------------------------------ */
/*  Sheet (root)                                                        */
/* ------------------------------------------------------------------ */
interface SheetProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  defaultOpen?: boolean
  modal?: boolean
  children: React.ReactNode
}

function Sheet({ open: controlledOpen, onOpenChange, defaultOpen, children }: SheetProps) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen

  const setOpen = React.useCallback(
    (v: boolean) => {
      if (!isControlled) setInternalOpen(v)
      onOpenChange?.(v)
    },
    [isControlled, onOpenChange],
  )

  return (
    <SheetContext.Provider value={{ open, setOpen }}>
      {children}
    </SheetContext.Provider>
  )
}

/* ------------------------------------------------------------------ */
/*  SheetTrigger                                                        */
/* ------------------------------------------------------------------ */
function SheetTrigger({
  asChild,
  children,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const { setOpen } = React.useContext(SheetContext)

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    props.onClick?.(e)
    setOpen(true)
  }

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
      onClick: handleClick,
    })
  }

  return (
    <button
      data-slot="sheet-trigger"
      type="button"
      {...props}
      onClick={handleClick}
    >
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/*  SheetClose                                                          */
/* ------------------------------------------------------------------ */
function SheetClose({
  asChild,
  children,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const { setOpen } = React.useContext(SheetContext)

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    props.onClick?.(e)
    setOpen(false)
  }

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
      onClick: handleClick,
    })
  }

  return (
    <button
      data-slot="sheet-close"
      type="button"
      {...props}
      onClick={handleClick}
    >
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/*  SheetContent                                                        */
/* ------------------------------------------------------------------ */
const SIDE_CLASSES: Record<string, string> = {
  right: "inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm translate-x-0 data-[state=closed]:translate-x-full",
  left: "inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm translate-x-0 data-[state=closed]:-translate-x-full",
  top: "inset-x-0 top-0 h-auto border-b translate-y-0 data-[state=closed]:-translate-y-full",
  bottom: "inset-x-0 bottom-0 h-auto border-t translate-y-0 data-[state=closed]:translate-y-full",
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: React.ComponentProps<"div"> & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
}) {
  const { open, setOpen } = React.useContext(SheetContext)

  // Close on escape key
  React.useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [open, setOpen])

  if (!open) return null

  return (
    <>
      {/* Overlay */}
      <div
        data-slot="sheet-overlay"
        className="fixed inset-0 z-50 bg-black/50 animate-in fade-in-0"
        onClick={() => setOpen(false)}
      />
      {/* Content panel */}
      <div
        data-slot="sheet-content"
        data-state={open ? "open" : "closed"}
        role="dialog"
        aria-modal="true"
        className={cn(
          "bg-background fixed z-50 flex flex-col gap-4 shadow-lg transition-transform duration-300 ease-in-out",
          SIDE_CLASSES[side],
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <button
            type="button"
            className="absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none"
            onClick={() => setOpen(false)}
          >
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </button>
        )}
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  SheetHeader / Footer / Title / Description                          */
/* ------------------------------------------------------------------ */
function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="sheet-title"
      className={cn("text-foreground font-semibold", className)}
      {...props}
    />
  )
}

function SheetDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="sheet-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
