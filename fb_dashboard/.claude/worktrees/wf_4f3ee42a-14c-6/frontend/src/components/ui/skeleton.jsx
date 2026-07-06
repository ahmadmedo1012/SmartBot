import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-gradient-to-r from-muted via-muted/70 to-muted bg-[length:400%_100%]",
        className
      )}
      style={{ animation: "shimmer 2s ease-in-out infinite" }}
      {...props}
    />
  );
}

export { Skeleton }
