'use client';

/**
 * Unified KPI stat card — ported from Smart-Menu (world-class launch plan v3
 * §6.2). Replaces the per-page StatCard pattern in SmartBot dashboards.
 *
 * Card chrome, entrance motion, and the stretched-link a11y pattern follow
 * the Smart-Menu owner variant (reduced-motion aware, staggered entrance).
 * v11-A7: entrance is a CSS twin (enter-motion.css) — no framer-motion
 * import (see the v11-A7 note above the imports). */

import { memo } from 'react';
import Link from 'next/link';
/* v11-A7 — framer-free rewrite. `import { motion, useReducedMotion } from
 * 'framer-motion'` here (KpiCard renders in the default view of /dashboard)
 * kept the ~116KB motion engine in every dashboard route's first-load JS.
 * The card entrance now runs as a CSS twin (.sb-kpi-enter — same 0.28s
 * ease-out, same opacity/y-12 start, same per-index 0.06s stagger set inline,
 * disabled under prefers-reduced-motion) and useReducedMotion is replaced
 * with the shared matchMedia twin from scroll-parallax (v6 §D precedent) —
 * the counter still skips its count-up for reduced-motion users. */
import { cn } from '@/lib/utils';
import { toArabicNumber } from '@/lib/format';
import { MiniSparkline } from '@/components/shared/MiniSparkline';
/* v17-E-F11 (D2-P2): the AnimatedCounter's inline rAF tween (800ms
 * easeOutCubic, tween-from-current, reduced-motion snap) moved to the
 * shared hook — the same engine now also drives the landing StatsSection
 * counter. usePrefersReducedMotion is the shared v11-A7 matchMedia twin
 * (this file's local copy was the original home). */
import { useCountUp, usePrefersReducedMotion } from '@/hooks/useCountUp';
import type { LucideIcon } from 'lucide-react';
import '@/components/shared/enter-motion.css';

/* ---------- Animated Counter ---------- */

function AnimatedCounter({ value, suffix = '' }: { value: number; suffix?: string }) {
        // Unified count-up (src/hooks/useCountUp.ts): 800ms easeOutCubic tween
        // from the current value, final value instantly under reduced motion.
        const display = useCountUp(value);

        return <span className="tabular-nums">{toArabicNumber(display)}{suffix}</span>;
}

/* ---------- Unified card ---------- */

export interface KpiCardProps {
        label: string;
        value: number;
        icon: LucideIcon;
        /** Icon tile background class. Default 'bg-accent'. */
        iconBg?: string;
        /** Icon glyph color class. Default 'text-accent-foreground'. */
        iconColor?: string;
        /** Text appended to the value (static mode only). */
        suffix?: string;
        /** Small muted line under the value (owner dashboards). */
        subtitle?: string;
        /** Percent trend badge with arrow (admin dashboards). */
        trend?: number;
        /** Sparkline rendered next to the trend badge (admin dashboards). */
        sparklineData?: number[];
        /** Count-up value animation (owner dashboards). */
        animated?: boolean;
        /** When set the whole card becomes a real stretched link. */
        href?: string;
        /** Entrance stagger position (cards animate in sequence). */
        index?: number;
}

export const KpiCard = memo(function KpiCard({
        label,
        value,
        icon: Icon,
        iconBg,
        iconColor,
        suffix = '',
        subtitle,
        trend,
        sparklineData,
        animated = false,
        href,
        index = 0,
}: KpiCardProps) {
        const reduceMotion = usePrefersReducedMotion();

        const body = (
                <>
                        <div className="flex items-start justify-between">
                                <div className="space-y-1.5">
                                        <p className="text-xs font-medium text-muted-foreground">{label}</p>
                                        <p className="text-3xl font-bold tracking-normal">
                                                {animated ? <AnimatedCounter value={value} /> : <>{toArabicNumber(value)}{suffix}</>}
                                        </p>
                                        {subtitle && <p className="text-2xs text-muted-foreground">{subtitle}</p>}
                                        {(sparklineData !== undefined || trend !== undefined) && (
                                                <div className="flex items-center gap-2">
                                                        {sparklineData && sparklineData.length > 1 && <MiniSparkline data={sparklineData} />}
                                                        {trend !== undefined && (
                                                                <span
                                                                        className={cn(
                                                                                'text-xs font-medium flex items-center gap-0.5',
                                                                                trend >= 0 ? 'text-success' : 'text-destructive'
                                                                        )}
                                                                >
                                                                        {trend >= 0 ? '↑' : '↓'} {toArabicNumber(Math.abs(trend))}%
                                                                </span>
                                                        )}
                                                </div>
                                        )}
                                </div>
                                <div className={cn('rounded-xl p-3 ring-1 ring-border/30 shadow-sm shrink-0', iconBg || 'bg-accent')}>
                                        <Icon className={cn('size-5', iconColor || 'text-accent-foreground')} aria-hidden="true" />
                                </div>
                        </div>
                </>
        );

        /* Entrance: soft fade/slide ≤300ms with a light stagger per card —
         * now the CSS twin (.sb-kpi-enter in enter-motion.css: 0.28s ease-out,
         * delay index×0.06s set inline, disabled under prefers-reduced-motion). */

        /* a11y (4.1.2 / keyboard): clickable cards are real stretched Links — a native
                 anchor gives role=link + Enter activation + focus for free. */
        if (href) {
                return (
                        <div
                                className={cn(
                                        'sb-kpi-enter',
                                        'group relative rounded-2xl border border-border/50 bg-card shadow-sm backdrop-blur-sm transition-[border-color,box-shadow,transform] duration-300',
                                        'hover:border-accent-foreground/40 hover:shadow-lg hover:shadow-accent-foreground/10 hover:-translate-y-1',
                                )}
                                style={reduceMotion ? undefined : { animationDelay: `${index * 0.06}s` }}
                        >
                                {/* stretched-link pattern: whole card is one link target */}
                                <Link
                                        href={href}
                                        className="absolute inset-0 z-10 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-foreground/60"
                                >
                                        <span className="sr-only">{label}</span>
                                </Link>
                                <div className="p-5">{body}</div>
                        </div>
                );
        }

        return (
                <div
                        className={cn(
                                'sb-kpi-enter',
                                'rounded-2xl border border-border/50 bg-card p-5 shadow-sm backdrop-blur-sm',
                        )}
                        style={reduceMotion ? undefined : { animationDelay: `${index * 0.06}s` }}
                >
                        {body}
                </div>
        );
});
