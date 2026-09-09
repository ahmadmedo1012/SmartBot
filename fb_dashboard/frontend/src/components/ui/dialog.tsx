"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import AnimatedX from "@/components/ui/x-icon"

/* Ported from Smart-Menu (smart-link.ly shared identity) — identical
   overlay/popup treatment: blurred backdrop, spring-eased scale-in,
   popover surface, RTL direction, AnimatedX close affordance. */

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" modal {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        /* v17-S3 (D2 §3.2): duration-250 was the only raw 250ms value in the
           project — off every scale. Now the motion tokens: backdrop fades
           FAST (200ms), the popup surface pops BASE (300ms) — the same
           fast-backdrop / slower-surface split the bottom-nav sheet uses
           (sheet-backdrop 0.25s vs sheet-panel 0.32s). */
        "fixed inset-0 isolate z-40 backdrop-blur-md transition-opacity duration-(--duration-fast) ease-smooth",
        "data-starting-style:opacity-0 data-ending-style:opacity-0",
        className,
      )}
      style={{ backgroundColor: "var(--overlay)" }}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        aria-modal="true"
        dir="rtl"
        className={cn(
          "fixed left-1/2 top-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] max-h-[90dvh] overflow-y-auto overscroll-contain -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl bg-popover/95 p-6 text-sm text-popover-foreground ring-1 ring-border/50 shadow-2xl backdrop-blur-xl outline-none sm:max-w-sm",
          "transition-[opacity,scale,translate,filter] duration-(--duration-base) ease-smooth data-starting-style:opacity-0 data-starting-style:scale-95 data-starting-style:translate-y-4",
          "data-ending-style:opacity-0 data-ending-style:scale-95 data-ending-style:translate-y-4",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-3 end-3 min-h-[48px] min-w-[48px]"
                size="icon"
                aria-label="إغلاق"
              />
            }
          >
            <AnimatedX />
            <span className="sr-only">إغلاق</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-heading text-base leading-none font-medium", className)}
      {...props}
    />
  )
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className,
      )}
      {...props}
    />
  )
}

/* v10-W4: DialogTrigger/Header/Footer/Close deleted (zero importers);
 * Overlay/Portal stay module-internal (used by DialogContent). */
export {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
}
