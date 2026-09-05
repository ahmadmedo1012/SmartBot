'use client';

/**
 * Unified KPI stat card — ported from Smart-Menu (world-class launch plan v3
 * §6.2). Replaces the per-page StatCard pattern in SmartBot dashboards.
 *
 * Card chrome, entrance motion, and the stretched-link a11y pattern follow
 * the Smart-Menu owner variant (reduced-motion aware, staggered entrance).
 * framer-motion import instead of motion/react (identical API).
 */

import { memo, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { toArabicNumber } from '@/lib/format';
import { MiniSparkline } from '@/components/shared/MiniSparkline';
import type { LucideIcon } from 'lucide-react';

/* ---------- Animated Counter ---------- */

function AnimatedCounter({ value, suffix = '' }: { value: number; suffix?: string }) {
	const [display, setDisplay] = useState(0);
	const ref = useRef<number | null>(null);
	const mounted = useRef(false);
	// Reduced motion: skip the count-up entirely and show the final value.
	const reduceMotion = useReducedMotion();

	useEffect(() => {
		mounted.current = true;
		if (reduceMotion) {
			setDisplay(value);
			return;
		}
		const start = performance.now();
		const from = display;
		const to = value;
		const duration = 800;

		function tick(now: number) {
			if (!mounted.current) return;
			const elapsed = now - start;
			const progress = Math.min(elapsed / duration, 1);
			const eased = 1 - Math.pow(1 - progress, 3);
			setDisplay(Math.round(from + (to - from) * eased));
			if (progress < 1) ref.current = requestAnimationFrame(tick);
		}
		ref.current = requestAnimationFrame(tick);
		return () => {
			mounted.current = false;
			if (ref.current) cancelAnimationFrame(ref.current);
		};
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [value, reduceMotion]);

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
	const reduceMotion = useReducedMotion();

	const body = (
		<>
			<div className="flex items-start justify-between">
				<div className="space-y-1.5">
					<p className="text-xs font-medium text-muted-foreground">{label}</p>
					<p className="text-3xl font-bold tracking-normal">
						{animated ? <AnimatedCounter value={value} /> : <>{toArabicNumber(value)}{suffix}</>}
					</p>
					{subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
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

	/* Entrance: soft fade/slide ≤300ms with a light stagger per card.
		 Disabled entirely under prefers-reduced-motion. */
	const entranceTransition = reduceMotion
		? undefined
		: { duration: 0.28, ease: 'easeOut' as const, delay: index * 0.06 };

	/* a11y (4.1.2 / keyboard): clickable cards are real stretched Links — a native
		 anchor gives role=link + Enter activation + focus for free. */
	if (href) {
		return (
			<motion.div
				initial={reduceMotion ? false : { opacity: 0, y: 12 }}
				animate={{ opacity: 1, y: 0 }}
				transition={entranceTransition}
				className={cn(
					'group relative rounded-2xl border border-border/50 bg-card/80 shadow-sm backdrop-blur-sm transition-[border-color,box-shadow,transform] duration-300',
					'hover:border-accent-foreground/40 hover:shadow-lg hover:shadow-accent-foreground/10 hover:-translate-y-1',
				)}
			>
				{/* stretched-link pattern: whole card is one link target */}
				<Link
					href={href}
					className="absolute inset-0 z-10 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-foreground/60"
				>
					<span className="sr-only">{label}</span>
				</Link>
				<div className="p-5">{body}</div>
			</motion.div>
		);
	}

	return (
		<motion.div
			initial={reduceMotion ? false : { opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={entranceTransition}
			className={cn(
				'rounded-2xl border border-border/50 bg-card/80 p-5 shadow-sm backdrop-blur-sm',
			)}
		>
			{body}
		</motion.div>
	);
});
