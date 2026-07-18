"use client";
import { cn } from "@/lib/utils";

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border border-orange/20 bg-orange/5 px-4 py-1 text-[0.65rem] font-medium text-orange mb-5", className)}>
      {children}
    </span>
  );
}
