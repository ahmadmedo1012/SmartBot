import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div role="status" aria-label="جارٍ التحميل..." className={cn("skeleton", className)} {...props} />
}

export { Skeleton }
