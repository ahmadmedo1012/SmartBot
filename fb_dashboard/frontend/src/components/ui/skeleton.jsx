import { cn } from "@/lib/utils"

function Skeleton({ className, variant = "default", ...props }) {
  const base = "animate-shimmer rounded-lg bg-gradient-to-r from-muted via-muted-foreground/10 to-muted bg-[length:400%_100%]"
  const variants = {
    default: "h-4 w-full",
    text: "h-3 w-full",
    circle: "h-10 w-10 rounded-full",
    card: "h-32 w-full",
    "table-row": "h-8 w-full",
  }
  return (
    <div
      className={cn(base, variants[variant] || variants.default, className)}
      {...props}
    />
  );
}

function SkeletonText({ lines = 3, className, ...props }) {
  return (
    <div className={cn("space-y-2", className)} {...props}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          className={i === lines - 1 ? "w-2/3" : "w-full"} />
      ))}
    </div>
  );
}

export { Skeleton, SkeletonText }
