"use client"

import * as React from "react"
import { XIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export const DialogPresenceContext = React.createContext<boolean>(false)

/* ------------------------------------------------------------------ */
/*  Dialog (root) — manages open/onOpenChange declaratively            */
/* ------------------------------------------------------------------ */
interface DialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  defaultOpen?: boolean
  modal?: boolean
  children: React.ReactNode
}

function Dialog({ open, onOpenChange, children }: DialogProps) {
  const triggerRef = React.useRef<HTMLElement | null>(null)
  return (
    <DialogPresenceContext.Provider value={true}>
      <TriggerRefCtx.Provider value={triggerRef}>
        <DialogContextProvider open={open} onOpenChange={onOpenChange}>
          {children}
        </DialogContextProvider>
      </TriggerRefCtx.Provider>
    </DialogPresenceContext.Provider>
  )
}

/* Internal context to share open state between trigger/content/close */
interface DialogCtx {
  open: boolean
  setOpen: (v: boolean) => void
}
const DialogCtxInner = React.createContext<DialogCtx>({
  open: false,
  setOpen: () => {},
})

function DialogContextProvider({
  open: controlledOpen,
  onOpenChange,
  children,
}: {
  open?: boolean | undefined
  onOpenChange?: ((open: boolean) => void) | undefined
  children: React.ReactNode
}) {
  const [internalOpen, setInternalOpen] = React.useState(false)
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
    <DialogCtxInner.Provider value={{ open, setOpen }}>
      {children}
    </DialogCtxInner.Provider>
  )
}

/* ------------------------------------------------------------------ */
/*  DialogTrigger                                                       */
/* ------------------------------------------------------------------ */
const TriggerRefCtx = React.createContext<React.RefObject<HTMLElement | null>>({ current: null })

function DialogTrigger({
  asChild,
  children,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const { setOpen } = React.useContext(DialogCtxInner)
  const triggerRef = React.useContext(TriggerRefCtx)
  const localRef = React.useRef<HTMLButtonElement>(null)

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    props.onClick?.(e)
    triggerRef.current = localRef.current
    setOpen(true)
  }

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
      onClick: handleClick,
      ref: localRef,
    })
  }

  return (
    <button
      ref={localRef}
      data-slot="dialog-trigger"
      type="button"
      {...props}
      onClick={handleClick}
    >
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/*  DialogPortal / DialogOverlay — no-ops for API compat               */
/* ------------------------------------------------------------------ */
function DialogPortal({ children }: { children?: React.ReactNode; container?: Element | null }) {
  return <>{children}</>
}

function DialogOverlay(_props: React.ComponentProps<"div">) {
  return null
}

/* ------------------------------------------------------------------ */
/*  DialogContent                                                       */
/* ------------------------------------------------------------------ */
function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<"div"> & { showCloseButton?: boolean }) {
  const { open, setOpen } = React.useContext(DialogCtxInner)
  const triggerRef = React.useContext(TriggerRefCtx)
  const overlayRef = React.useRef<HTMLDivElement>(null)

  // Close on Escape
  React.useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [open, setOpen])

  // Return focus on close
  React.useEffect(() => {
    if (!open) {
      requestAnimationFrame(() => {
        triggerRef.current?.focus()
      })
    }
  }, [open, triggerRef])

  // Prevent body scroll when open
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden"
      return () => { document.body.style.overflow = "" }
    }
  }, [open])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-50 bg-black/50 animate-in fade-in-0"
        onClick={(e) => {
          if (e.target === overlayRef.current) setOpen(false)
        }}
      />
      {/* Dialog panel */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          data-slot="dialog-content"
          role="dialog"
          aria-modal="true"
          className={cn(
            "bg-background relative w-full rounded-lg border shadow-lg animate-in fade-in-0 zoom-in-95",
            "max-w-lg max-h-[85vh] overflow-y-auto",
            className,
          )}
          onClick={(e) => e.stopPropagation()}
          {...props}
        >
          {showCloseButton && (
            <button
              type="button"
              className="absolute right-4 top-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden z-10"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              <XIcon className="size-4" />
            </button>
          )}
          <div className="p-6 grid gap-4">{children}</div>
        </div>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  DialogClose                                                         */
/* ------------------------------------------------------------------ */
function DialogClose({
  asChild,
  children,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const { setOpen } = React.useContext(DialogCtxInner)

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
      data-slot="dialog-close"
      type="button"
      {...props}
      onClick={handleClick}
    >
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/*  DialogHeader / Footer / Title / Description                         */
/* ------------------------------------------------------------------ */
function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & { showCloseButton?: boolean }) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogClose asChild>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground"
          >
            Close
          </button>
        </DialogClose>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
