import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

function CardGridSkeleton({ count = 6, className }) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-28 rounded-xl" />
      ))}
    </div>
  )
}

function TableRowsSkeleton({ rows = 5 }) {
  return (
    <div className="space-y-2 p-1">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 h-12 rounded-lg bg-muted/20 px-4">
          <Skeleton className="size-8 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-3/5 rounded" />
            <Skeleton className="h-2.5 w-2/5 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}

function StatCardsSkeleton({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-28 rounded-xl" />
      ))}
    </div>
  )
}

export { CardGridSkeleton, TableRowsSkeleton, StatCardsSkeleton }
