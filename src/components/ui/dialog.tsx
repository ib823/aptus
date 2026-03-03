"use client"

import * as React from "react"
import {
  Dialog as UI5Dialog,
  Bar,
} from "@ui5/webcomponents-react"

import { XIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

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
  return (
    <DialogPresenceContext.Provider value={true}>
      <DialogContextProvider open={open} onOpenChange={onOpenChange}>
        {children}
      </DialogContextProvider>
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
function DialogTrigger({
  asChild,
  children,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const { setOpen } = React.useContext(DialogCtxInner)

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
  return null // UI5 Dialog handles its own overlay
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
  const dialogRef = React.useRef(null)

  const handleAfterClose = () => {
    setOpen(false)
  }

  // Separate header, footer, and body content from children
  const childArray = React.Children.toArray(children)
  const headerChildren: React.ReactNode[] = []
  const footerChildren: React.ReactNode[] = []
  const bodyChildren: React.ReactNode[] = []

  for (const child of childArray) {
    if (React.isValidElement(child)) {
      const slotProp = (child.props as Record<string, unknown>)?.["data-slot"]
      if (slotProp === "dialog-header") {
        headerChildren.push(child)
      } else if (slotProp === "dialog-footer") {
        footerChildren.push(child)
      } else {
        bodyChildren.push(child)
      }
    } else {
      bodyChildren.push(child)
    }
  }

  return (
    <UI5Dialog
      ref={dialogRef}
      data-slot="dialog-content"
      open={open}
      onClose={handleAfterClose}
      className={cn(
        "rounded-lg max-w-[calc(100%-2rem)] sm:max-w-lg",
        className,
      )}
      header={
        showCloseButton ? (
          <Bar
            design={"Header"}
            endContent={
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <XIcon className="size-4" />
              </Button>
            }
          >
            {headerChildren.length > 0 ? headerChildren : null}
          </Bar>
        ) : headerChildren.length > 0 ? (
          <Bar design={"Header"}>
            {headerChildren}
          </Bar>
        ) : undefined
      }
      footer={
        footerChildren.length > 0 ? (
          <Bar design={"Footer"}>
            <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {footerChildren}
            </div>
          </Bar>
        ) : undefined
      }
      {...(props as Record<string, unknown>)}
    >
      <div className="p-6 grid gap-4">{bodyChildren}</div>
    </UI5Dialog>
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
          <Button variant="outline">Close</Button>
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
