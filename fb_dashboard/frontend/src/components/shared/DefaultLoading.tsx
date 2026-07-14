import { cn } from "@/lib/utils"

export function DefaultLoading({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center min-h-[60vh]", className)}>
      <div className="flex flex-col items-center gap-4">
        <div className="size-8 rounded-full border-2 border-orange/30 border-t-orange animate-spin" />
        <p className="text-sm text-muted-foreground animate-pulse">جاري التحميل...</p>
      </div>
    </div>
  )
}
