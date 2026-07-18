import { cn } from "@/lib/utils";

type GlowPoolProps = {
  position?: string;
  size?: string;
  color?: string;
  className?: string;
};

export function GlowPool({
  position = "top-1/2 left-1/2",
  size = "size-[50vmin]",
  color = "orange/5",
  className,
}: GlowPoolProps) {
  return (
    <div
      className={cn(
        `pointer-events-none absolute ${position} -translate-x-1/2 -translate-y-1/2 ${size} rounded-full blur-[100px]`,
        className,
      )}
      style={{ background: `oklch(0.55 0.19 45 / ${parseFloat(color.split("/")[1] || "0.05")})` }}
    />
  );
}
