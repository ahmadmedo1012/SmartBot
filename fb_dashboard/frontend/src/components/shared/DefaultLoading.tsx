import { cn } from "@/lib/utils"
import { RobotMark } from "@/components/shared/RobotMark"

/* r131-F8 (A4 P1-3) ruled the canonical loading anatomy (a 22px spinner on
 * the 700ms turn register — retired by phase6); the caption stays static
 * (the pulse blink on a loading label was the A4 P1-2 idiom) and the whole
 * region keeps role=status + the sr-only sentence for screen readers.
 * phase6 r154 (P6-2-d1): the machine grammar — the ONE robot in its
 * thinking register (lime AI scan bar sweeping the teal visor, drifting
 * eyes) replaces the generic spinner; the rb-* loop dies under
 * prefers-reduced-motion (globals belt). Same a11y contract, same
 * className passthrough. */
export function DefaultLoading({ className }: { className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("flex items-center justify-center min-h-[60vh]", className)}>
      <div className="flex flex-col items-center gap-4">
        <RobotMark state="thinking" className="size-16" aria-hidden={true} />
        <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
        <span className="sr-only">جارٍ تحميل المحتوى</span>
      </div>
    </div>
  )
}
