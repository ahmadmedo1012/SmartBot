import { cn } from "@/lib/utils"

/* r131-F8 (A4 P1-3, fleet ruling "spinner 700ms"): canonical spinner
 * anatomy — 22px, 2px track at 8% ink + the accent top arc (was a 32px
 * gold-ring border-2 accent-foreground/30). The turn rate is inherited
 * from the global .animate-spin register (globals.css r131-F7:
 * --motion-duration-stat 700ms linear), so this markup carries NO
 * duration of its own. The caption stays static (the pulse blink on a
 * loading label was the A4 P1-2 idiom); the whole region keeps
 * role=status + the sr-only sentence for screen readers. */
export function DefaultLoading({ className }: { className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("flex items-center justify-center min-h-[60vh]", className)}>
      <div className="flex flex-col items-center gap-4">
        <div
          className="size-[22px] rounded-full border-2 border-foreground/8 border-t-accent animate-spin"
          aria-hidden="true"
        />
        <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
        <span className="sr-only">جارٍ تحميل المحتوى</span>
      </div>
    </div>
  )
}
