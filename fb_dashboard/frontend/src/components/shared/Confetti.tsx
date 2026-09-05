"use client";

import { useEffect, useState } from "react";

/** Festive palettes — centralized as --confetti-* CSS variables (Track D.1).
 *  A natural multi-hue spread is intentional for celebration; the VALUES live
 *  in globals.css, this file only references them. */
const SHAPE_COLOR_VARS = [
  "var(--confetti-gold)",
  "var(--confetti-red)",
  "var(--confetti-accent)",
  "var(--confetti-green)",
  "var(--confetti-violet)",
  "var(--confetti-pink)",
  "var(--confetti-gold-bright)",
]
const SHAPES = ["■", "●", "▲", "★", "♦"];
const RECT_COLOR_VARS = [
  "var(--confetti-gold-bright)",
  "var(--confetti-coral)",
  "var(--confetti-teal)",
  "var(--confetti-sky)",
  "var(--confetti-sage)",
  "var(--confetti-gold)",
  "var(--confetti-plum)",
  "var(--confetti-orange)",
]

type Variant = "shapes" | "rects";

interface Particle {
  id: number;
  x: number;
  color: string;
  shape: string;
  size: number;
  delay: number;
  duration: number;
  rotation: number;
}

interface ConfettiProps {
  active: boolean;
  variant?: Variant;
  count?: number;
  loop?: boolean;
  /** Override the default container className ("fixed inset-0 pointer-events-none z-50 overflow-hidden"). */
  className?: string;
}

const DEFAULT_CLASS = "fixed inset-0 pointer-events-none z-50 overflow-hidden";

export default function Confetti({
  active,
  variant = "shapes",
  count = 50,
  loop = false,
  className,
}: ConfettiProps) {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (!active) {
      setParticles([]);
      return;
    }

    const colors = variant === "rects" ? RECT_COLOR_VARS : SHAPE_COLOR_VARS;
    const sizeMin = variant === "rects" ? 4 : 8;
    const sizeRange = variant === "rects" ? 8 : 12;
    const delayMax = variant === "rects" ? 1.5 : 2;
    const durMin = variant === "rects" ? 2.5 : 2;
    const durRange = variant === "rects" ? 2 : 3;

    const newParticles: Particle[] = Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      color: colors[Math.floor(Math.random() * colors.length)],
      shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
      size: sizeMin + Math.random() * sizeRange,
      delay: Math.random() * delayMax,
      duration: durMin + Math.random() * durRange,
      rotation: Math.random() * 360,
    }));
    setParticles(newParticles);

    if (!loop) {
      const timer = setTimeout(() => setParticles([]), 5000);
      return () => clearTimeout(timer);
    }
  }, [active, variant, count, loop]);

  if (particles.length === 0) return null;

  return (
    <div className={className ?? DEFAULT_CLASS} aria-hidden="true">
      {particles.map((p) =>
        variant === "rects" ? (
          <div
            key={p.id}
            className="absolute rounded-sm opacity-80"
            style={{
              left: `${p.x}%`,
              top: "-8px",
              width: `${p.size}px`,
              height: `${p.size * 0.6}px`,
              backgroundColor: p.color,
              animation: `confetti-fall ${p.duration}s ease-in ${p.delay}s ${loop ? "infinite" : "forwards"}`,
              transform: `rotate(${p.rotation}deg)`,
            }}
          />
        ) : (
          <div
            key={p.id}
            className="absolute animate-confetti"
            style={{
              left: `${p.x}%`,
              top: "-5%",
              color: p.color,
              fontSize: `${p.size}px`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              transform: `rotate(${p.rotation}deg)`,
            }}
          >
            {p.shape}
          </div>
        ),
      )}
    </div>
  );
}
