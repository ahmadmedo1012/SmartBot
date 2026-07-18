"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { AvatarInitials } from "./AvatarInitials";

/* ── Premium tokens ── */
const SPRING = { type: "spring" as const, stiffness: 100, damping: 16 };
const VELVET: [number, number, number, number] = [0.32, 0.72, 0, 1];

interface Testimonial {
  quote: string;
  name: string;
  designation: string;
  src?: string;
}

interface CircularTestimonialsProps {
  testimonials: Testimonial[];
  autoplay?: boolean;
  autoplayInterval?: number;
}

/* ── Orbital thumbnail ── */
function OrbitalThumb({
  t,
  i,
  n,
  active,
  radius,
  onSelect,
}: {
  t: Testimonial;
  i: number;
  n: number;
  active: number;
  radius: number;
  onSelect: () => void;
}) {
  const isActive = i === active;

  /* Compute ring position offset by active index */
  const angle = (360 / n) * i - 90;
  const ringAngle = (360 / n) * active;
  const rx =
    Math.cos(((angle - ringAngle) * Math.PI) / 180) * radius;
  const ry =
    Math.sin(((angle - ringAngle) * Math.PI) / 180) * radius;

  return (
    <motion.button
      onClick={onSelect}
      className={cn(
        "absolute left-1/2 top-1/2",
        "size-11 sm:size-12 rounded-full overflow-hidden shrink-0",
        "transition-shadow duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange",
        isActive
          ? "z-20 ring-[2.5px] ring-orange ring-offset-[3px] ring-offset-background shadow-[0_0_20px_-4px_var(--orange)]"
          : "z-10 ring-[1.5px] ring-border/30 hover:ring-orange/60",
      )}
      style={{ x: rx, y: ry, translateX: "-50%", translateY: "-50%" }}
      animate={{ x: rx, y: ry, scale: isActive ? 1.1 : 1 }}
      transition={SPRING}
      aria-label={`View ${t.name} review`}
    >
      <div className="size-full p-[2px]">
        <div className="size-full rounded-full overflow-hidden bg-background flex items-center justify-center">
          <AvatarInitials name={t.name} size="sm" />
        </div>
      </div>
    </motion.button>
  );
}

/* ── Arrow (Button-in-Button) ── */
function ArrowBtn({
  onClick,
  Icon,
  label,
}: {
  onClick: () => void;
  Icon: typeof ChevronLeft;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group size-10 rounded-full",
        "bg-background/80",
        "border border-border/40",
        "shadow-sm",
        "hover:bg-orange hover:border-orange/50 hover:shadow-[0_0_16px_-4px_var(--orange)]",
        "active:scale-[0.92]",
        "transition-all duration-400 ease-[cubic-bezier(0.32,0.72,0,1)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange",
      )}
      aria-label={label}
    >
      <span
        className={cn(
          "mx-auto flex size-8 items-center justify-center rounded-full",
          "text-muted-foreground/50",
          "group-hover:text-white",
          "transition-colors duration-400 ease-[cubic-bezier(0.32,0.72,0,1)]",
        )}
      >
        <Icon className="size-[17px]" />
      </span>
    </button>
  );
}

/* ── Root ── */
export default function CircularTestimonials({
  testimonials,
  autoplay = true,
  autoplayInterval = 5000,
}: CircularTestimonialsProps) {
  const [active, setActive] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const n = testimonials.length;

  const goTo = useCallback(
    (i: number) => setActive(((i % n) + n) % n),
    [n],
  );
  const next = useCallback(() => goTo(active + 1), [active, goTo]);
  const prev = useCallback(() => goTo(active - 1), [active, goTo]);

  useEffect(() => {
    if (!autoplay || n < 2) return;
    timerRef.current = setInterval(next, autoplayInterval);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoplay, autoplayInterval, next, n]);

  const activeT = testimonials[active];
  const isRtl =
    typeof document !== "undefined" &&
    document.documentElement.dir === "rtl";

  if (!n) return null;

  return (
    /* ── Cohesive panel: Double-Bezel shell wraps everything ── */
    <div className="relative mx-auto max-w-lg">
      {/* Outer shell */}
      <div
        className={cn(
          "relative rounded-[1.75rem] p-px",
          "bg-gradient-to-b from-white/[0.08] to-white/[0.02]",
          "shadow-[0_12px_48px_-12px_rgba(0,0,0,0.3)]",
        )}
      >
        {/* Inner core */}
        <div
          className={cn(
            "relative rounded-[calc(1.75rem-1px)]",
            "bg-card",
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
            "overflow-hidden",
          )}
        >
          {/* ── Orbit ring ── */}
          <div className="relative pt-10 sm:pt-12 pb-2">
            <div className="relative size-[200px] sm:size-[220px] mx-auto">
              {/* ring glow */}
              <div
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{
                  background:
                    "radial-gradient(circle, oklch(0.68 0.19 45 / 0.05) 0%, transparent 70%)",
                }}
              />
              {/* ring track */}
              <div className="absolute inset-[14px] rounded-full border border-white/[0.04] dark:border-white/[0.03]" />

              {testimonials.map((t, i) => (
                <OrbitalThumb
                  key={i}
                  t={t}
                  i={i}
                  n={n}
                  active={active}
                  radius={82}
                  onSelect={() => goTo(i)}
                />
              ))}
            </div>
          </div>

          {/* ── Active content ── */}
          <div className="px-6 sm:px-8 pb-2 min-h-[140px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.5, ease: VELVET }}
                className="text-center"
              >
                {/* Stars */}
                <div className="flex justify-center gap-1 mb-4">
                  {[...Array(5)].map((_, j) => (
                    <Star
                      key={j}
                      className="size-[13px] sm:size-[14px] fill-orange text-orange/80"
                    />
                  ))}
                </div>

                <blockquote className="text-[0.9rem] sm:text-[1rem] leading-[1.75] text-muted-foreground/85 mb-5 sm:mb-6 font-[430]">
                  &ldquo;{activeT.quote}&rdquo;
                </blockquote>

                <div className="flex items-center justify-center gap-3">
                  <AvatarInitials name={activeT.name} />
                  <div className="text-left">
                    <p className="text-sm font-[500] text-foreground/90">
                      {activeT.name}
                    </p>
                    <p className="text-[0.75rem] text-muted-foreground/60 mt-0.5">
                      {activeT.designation}
                    </p>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* ── Arrow footer ── */}
          {n > 1 && (
            <div className="flex items-center justify-center gap-4 px-6 sm:px-8 py-4 sm:py-5 border-t border-border/30 mt-4">
              <ArrowBtn
                onClick={isRtl ? next : prev}
                Icon={ChevronRight}
                label="Previous"
              />
              {/* dot indicators */}
              <div className="flex gap-1.5">
                {testimonials.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => goTo(i)}
                    className={cn(
                      "rounded-full transition-all duration-400 ease-[cubic-bezier(0.32,0.72,0,1)]",
                      i === active
                        ? "w-5 h-[5px] bg-orange"
                        : "w-[5px] h-[5px] bg-border/60 hover:bg-border",
                    )}
                    aria-label={`Go to review ${i + 1}`}
                  />
                ))}
              </div>
              <ArrowBtn
                onClick={isRtl ? prev : next}
                Icon={ChevronLeft}
                label="Next"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
