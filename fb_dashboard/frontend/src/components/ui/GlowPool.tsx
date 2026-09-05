import { cn } from "@/lib/utils";

type GlowPoolProps = {
  position?: string;
  size?: string;
  /** v4 Team 4 §4.3 — alpha percent of the brand token (e.g. "10" = 10%).
   * Legacy "orange/N" strings still work (the brand prefix is ignored). */
  color?: string;
  className?: string;
};

export function GlowPool({
  position = "top-1/2 left-1/2",
  size = "size-[50vmin]",
  color = "orange/5",
  className,
}: GlowPoolProps) {
  // v4: the raw oklch literal is gone — the glow now derives from the
  // single-source brand token (no more scattered hex/oklch in components).
  const alpha = parseFloat(color.split("/")[1] || "0.05");
  return (
    <div
      className={cn(
        `pointer-events-none absolute ${position} -translate-x-1/2 -translate-y-1/2 ${size} rounded-full blur-[100px]`,
        className,
      )}
      style={{
        background: `color-mix(in oklch, var(--accent-foreground) ${(alpha * 100).toFixed(2)}%, transparent)`,
      }}
    />
  );
}
