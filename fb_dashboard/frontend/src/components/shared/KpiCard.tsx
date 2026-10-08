'use client';

/**
 * Unified KPI stat card — ported from Smart-Menu (world-class launch plan v3
 * §6.2). Replaces the per-page StatCard pattern in SmartBot dashboards.
 *
 * r131-F8 (A4 P2-2, fleet ruling "KPI 132/30 tnum/44 well"): the card rides
 * the canonical Madarek MetricCard anatomy verbatim (madarek
 * components.css:144-219 + SO r130 W2-2 twin):
 *   · min-height 132px, padding 24px (canonical card rung)
 *   · value = 30px display-metric slot, 700 weight, tnum+lnum,
 *     lh 1.10, 700ms scale-0.92 pop-in (.sb-kpi-pop)
 *   · icon well = 44px (size-11) pastel-family ground (--c-{family}-bg)
 *     + 1.5px inset family-ink/30% rim — was a 48px rounded-xl alpha
 *     wash tile (`bg-success/10`…). The legacy iconBg/iconColor props
 *     still override for un-migrated callers.
 *   · hover = 2px accent leading-edge rail (after: scaleY spring) +
 *     −2px lift + border-strong on EVERY variant (was href-only lift;
 *     non-href cards had no hover at all)
 *   · entrance stagger stays (.sb-kpi-enter, index × 60ms)
 */

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

/* ---------- Canonical pastel-family icon wells (r131-F8) ---------- */
/* tone → the 9 canonical pastel families (globals.css "9 PASTEL SECTION
 * FAMILIES"); each well = 44px family -bg ground + 1.5px inset family-ink
 * 30% rim + family-ink glyph. Never invent a 10th family. */
type KpiTone = 'copper' | 'mint' | 'sky' | 'yellow' | 'rose' | 'grey' | 'peach' | 'lavender' | 'sand';

const TONE_WELL: Record<KpiTone, string> = {
        copper:   'bg-(--c-copper-bg) text-(--c-copper-ink) shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--c-copper-ink)_30%,transparent)]',
        mint:     'bg-(--c-mint-bg) text-(--c-mint-ink) shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--c-mint-ink)_30%,transparent)]',
        sky:      'bg-(--c-sky-bg) text-(--c-sky-ink) shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--c-sky-ink)_30%,transparent)]',
        yellow:   'bg-(--c-yellow-bg) text-(--c-yellow-ink) shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--c-yellow-ink)_30%,transparent)]',
        rose:     'bg-(--c-rose-bg) text-(--c-rose-ink) shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--c-rose-ink)_30%,transparent)]',
        grey:     'bg-(--c-grey-bg) text-(--c-grey-ink) shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--c-grey-ink)_30%,transparent)]',
        peach:    'bg-(--c-peach-bg) text-(--c-peach-ink) shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--c-peach-ink)_30%,transparent)]',
        lavender: 'bg-(--c-lavender-bg) text-(--c-lavender-ink) shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--c-lavender-ink)_30%,transparent)]',
        sand:     'bg-(--c-sand-bg) text-(--c-sand-ink) shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--c-sand-ink)_30%,transparent)]',
};

/* Card chrome shared by both variants (r131-F8): min-h 132, hover rail +
 * −2px lift + border-strong — the canonical hover contract on ALL cards. */
const CARD_CHROME =
        'relative min-h-[132px] rounded-xl border border-border/50 bg-card p-6 shadow-sm ' +
        'transition-[border-color,box-shadow,transform] duration-(--t-base) ' +
        'hover:border-foreground/25 hover:shadow-(--shadow-card-h) hover:-translate-y-[2px] ' +
        /* 2px accent leading-edge rail — scaleY spring in on hover,
         * direction-flipped in RTL by the physical `end` inset. */
        'after:absolute after:inset-y-3 after:end-0 after:w-0.5 after:origin-bottom after:scale-y-0 ' +
        'after:rounded-s-sm after:bg-primary after:transition-transform after:duration-(--t-slow) after:ease-spring-soft ' +
        'hover:after:scale-y-100';

/* ---------- Unified card ---------- */

export interface KpiCardProps {
        label: string;
        /** number → toArabicNumber/count-up; string renders verbatim
         *  (formatted money/grouped counts — the SO MetricCard pattern);
         *  null/undefined renders `fallback` ("—" default) — honest no-data. */
        value: number | string | null | undefined;
        icon: LucideIcon;
        /** Canonical pastel family for the 44px icon well (r131-F8). Default 'copper' (the accent family). */
        tone?: KpiTone;
        /** @deprecated use `tone` — legacy wash override, still honored. */
        iconBg?: string;
        /** @deprecated use `tone` — legacy glyph-color override, still honored. */
        iconColor?: string;
        /** Text appended to the value (static mode only). */
        suffix?: string;
        /** Rendered when value is null/undefined (no data yet). Default "—". */
        fallback?: string;
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
        tone = 'copper',
        iconBg,
        iconColor,
        suffix = '',
        fallback = '—',
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
                        <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 space-y-1.5">
                                        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
                                        {/* value = the 30px display-metric slot (tnum+lnum, lh 1.10)
                                         * with the 700ms pop-in (scale .92 backout, RM-killed) */}
                                        <p className="sb-kpi-pop font-heading text-[30px] leading-[1.1] font-bold tabular-nums [font-feature-settings:'tnum'_1,'lnum'_1]">
                                                {value == null
                                                        ? fallback
                                                        : typeof value === 'string'
                                                                ? value
                                                                : animated
                                                                        ? <AnimatedCounter value={value} />
                                                                        : <>{toArabicNumber(value)}{suffix}</>}
                                        </p>
                                        {subtitle && <p className="text-2xs text-muted-foreground">{subtitle}</p>}
                                        {(sparklineData !== undefined || trend !== undefined) && (
                                                <div className="flex items-center gap-2">
                                                        {sparklineData && sparklineData.length > 1 && <MiniSparkline data={sparklineData} />}
                                                        {trend !== undefined && (
                                                                <span
                                                                        className={cn(
                                                                                'text-xs font-semibold flex items-center gap-0.5 tabular-nums',
                                                                                /* r131-F8 (A7 Cluster B): status-as-text rides the
                                                                                 * AA -ink tier in both themes (was the raw base). */
                                                                                trend >= 0 ? 'text-success-ink' : 'text-destructive-ink'
                                                                        )}
                                                                >
                                                                        {trend >= 0 ? '↑' : '↓'} {toArabicNumber(Math.abs(trend))}%
                                                                </span>
                                                        )}
                                                </div>
                                        )}
                                </div>
                                {/* 44px pastel-family well + 1.5px inset family-ink rim */}
                                <div
                                        className={cn(
                                                'flex size-11 shrink-0 items-center justify-center rounded-lg',
                                                TONE_WELL[tone],
                                                iconBg,
                                                iconColor
                                        )}
                                >
                                        <Icon className="size-5" aria-hidden="true" />
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
                                className={cn('sb-kpi-enter group', CARD_CHROME)}
                                style={reduceMotion ? undefined : { animationDelay: `${index * 0.06}s` }}
                        >
                                {/* stretched-link pattern: whole card is one link target */}
                                <Link
                                        href={href}
                                        className="absolute inset-0 z-10 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-foreground/60"
                                >
                                        <span className="sr-only">{label}</span>
                                </Link>
                                <div className="relative">{body}</div>
                        </div>
                );
        }

        return (
                <div
                        className={cn('sb-kpi-enter', CARD_CHROME)}
                        style={reduceMotion ? undefined : { animationDelay: `${index * 0.06}s` }}
                >
                        {body}
                </div>
        );
});

/* r131-F8 (A4 P2-2): the height-stable loading twin — same chrome as
 * KpiCard (min-h 132, p-6) with .skeleton slabs in the label/value/well
 * slots, so the strip doesn't shift height when data lands (the audience
 * page's per-value Skeleton idiom, promoted to the card anatomy). */
export function KpiCardSkeleton() {
        return (
                <div className="min-h-[132px] rounded-xl border border-border/50 bg-card p-6 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 space-y-1.5">
                                        <div className="skeleton h-3 w-16" />
                                        <div className="skeleton h-[30px] w-14" />
                                </div>
                                <div className="skeleton size-11 shrink-0 rounded-lg" />
                        </div>
                </div>
        );
}
