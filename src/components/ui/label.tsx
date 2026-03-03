"use client"

import * as React from "react"
import { Label as UI5Label } from "@ui5/webcomponents-react"
import { cn } from "@/lib/utils"

interface LabelProps extends React.ComponentProps<"label"> {
  required?: boolean
}

function Label({
  className,
  children,
  htmlFor,
  required,
  ...props
}: LabelProps) {
  return (
    <UI5Label
      data-slot="label"
      for={htmlFor ?? ""}
      required={required ?? false}
      showColon={false}
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...(props as Record<string, unknown>)}
    >
      {children}
    </UI5Label>
  )
}

export { Label }
