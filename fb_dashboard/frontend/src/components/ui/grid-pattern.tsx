"use client";

import { cn } from "@/lib/utils";
import { useId } from "react";

interface GridPatternProps {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  squares?: [number, number][];
  className?: string;
  strokeDasharray?: string;
  style?: React.CSSProperties;
}

export function GridPattern({
  width = 60,
  height = 60,
  x = -1,
  y = -1,
  squares = [],
  strokeDasharray,
  className,
  style,
}: GridPatternProps) {
  const id = useId();

  return (
    <svg
      aria-hidden="true"
      className={cn(
        "pointer-events-none fixed inset-0 -z-10 size-full text-foreground",
        className,
      )}
      style={{ opacity: 0.25, ...style }}
    >
      <defs>
        <pattern
          id={id}
          width={width}
          height={height}
          patternUnits="userSpaceOnUse"
          x={x}
          y={y}
        >
          <path
            d={`M ${height} 0 L 0 0 0 ${width}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="0.5"
            {...(strokeDasharray ? { strokeDasharray } : {})}
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
      {squares.length > 0 && (
        <svg x={x} y={y} className="overflow-visible">
          {squares.map(([sqX, sqY], i) => (
            <rect
              key={i}
              width={width - 1}
              height={height - 1}
              x={sqX * width + 1}
              y={sqY * height + 1}
              fill="currentColor"
              strokeWidth="0"
            />
          ))}
        </svg>
      )}
    </svg>
  );
}
