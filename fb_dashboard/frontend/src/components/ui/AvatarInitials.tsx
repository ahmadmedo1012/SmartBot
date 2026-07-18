import { cn } from "@/lib/utils";

type AvatarInitialsProps = {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[0]?.charAt(0)?.toUpperCase() || "?";
}

const sizeMap = {
  sm: "size-10 text-sm",
  md: "size-11 sm:size-12 text-base",
  lg: "size-14 text-lg",
};

export function AvatarInitials({ name, size = "md", className }: AvatarInitialsProps) {
  return (
    <div
      className={cn(
        "rounded-full bg-gradient-to-br flex items-center justify-center text-white font-bold shrink-0",
        sizeMap[size],
        className,
      )}
      style={{ backgroundImage: `linear-gradient(135deg, var(--orange), var(--orange-muted))` }}
      aria-label={name}
    >
      {getInitials(name)}
    </div>
  );
}
