import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn(
        "animate-shimmer rounded-lg bg-gradient-to-r from-muted via-muted/70 to-muted bg-[length:400%_100%]",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton }
