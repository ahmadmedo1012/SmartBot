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
        /* Madarek modal grammar (§5.10): scrim fades FAST (160ms) with the
           4px --scrim-blur; the popup surface pops BASE (240ms) — the same
           fast-backdrop / slower-surface split the bottom-nav sheet uses.
           r127-F5b: z-40/z-50 → the --z-modal rung (400) on BOTH backdrop
           and surface (canonical ladder; DOM order keeps the surface on
           top — the Smart-Menu/Order dialog recipe). */
        "fixed inset-0 isolate z-(--z-modal) backdrop-blur-xs transition-opacity duration-(--duration-fast) ease-smooth",
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
          /* Madarek modal-card: solid surface + 1px hairline ring + elev-4
             (the --shadow-modal recipe) + the copper top hairline
             (.mdrk-modal-card::before in globals.css — inset-inline 30%,
             3px, transparent→accent→transparent — the SO recipe verbatim).
             r130 (W1-E D-3): radius 20px → 16px (rounded-xl = --r-xl).
             r131-F7 (A4 P2-7, fleet ruling "dialog solid r16 + top hairline
             + 560"): width cap 384px → min(560px,100%) — the canonical
             modal-card inline-size (madarek components.css:1491; SO twin);
             entrance re-based on the canonical madarek-pop (240ms,
             translateY(8px) scale(.98)) — was translate-y-4/scale-95. */
          "mdrk-modal-card fixed left-1/2 top-1/2 z-(--z-modal) grid w-full max-w-[calc(100%-2rem)] max-h-[90dvh] overflow-y-auto overscroll-contain -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-6 text-sm text-popover-foreground ring-1 ring-border/50 shadow-(--shadow-modal) outline-none sm:max-w-[560px]",
          "transition-[opacity,scale,translate,filter] duration-(--duration-base) ease-smooth data-starting-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:translate-y-2",
          "data-ending-style:opacity-0 data-ending-style:scale-[0.98] data-ending-style:translate-y-2",
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
      /* r131-F7 (A4 P2-7): 16/500 → the canonical modal-title rung
       * text-lg/600 (SO dialog twin; madarek .modal-title rides the
       * headline display rung). */
      className={cn("font-heading text-lg leading-none font-semibold", className)}
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
 * Overlay/Portal stay module-internal (used by DialogContent).
 * r132-F3a: Overlay/Portal removed from the re-export block too — the
 * comment above already declared them internal; the export was dead. */
export {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
}
