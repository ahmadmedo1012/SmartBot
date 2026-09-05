import { cn } from "@/lib/utils"

export function DefaultLoading({ className }: { className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("flex items-center justify-center min-h-[60vh]", className)}>
      <div className="flex flex-col items-center gap-4">
        <div className="size-8 rounded-full border-2 border-accent-foreground/30 border-t-accent-foreground animate-spin" />
        <p className="text-sm text-muted-foreground animate-pulse" aria-hidden="true">جاري التحميل...</p>
        <span className="sr-only">جاري تحميل المحتوى</span>
      </div>
    </div>
  )
}
