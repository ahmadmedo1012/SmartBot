"use client"

import { useEffect, useRef, useState } from "react"

/**
 * v17-E-F11 (D2-P2) — THE single count-up engine for the whole app.
 *
 * Before this module the codebase shipped TWO divergent count-up
 * implementations for the exact same job:
 *   - KpiCard's AnimatedCounter (src/components/shared/KpiCard.tsx):
 *     requestAnimationFrame tween, 800ms, easeOutCubic, tweening from the
 *     CURRENT displayed value, reduced-motion → final value instantly
 *     (the v11-A7 framer-free rewrite).
 *   - StatsSection's AnimatedNumber
 *     (src/components/landing/sections/StatsSection.tsx):
 *     setInterval stepping (≈30 × 30ms, linear, always 0 → target),
 *     in-view gated, reduced-motion honored only since v14-E5 (D2-M6).
 *
 * Both now call this hook, so there is ONE duration (800ms), ONE curve
 * (easeOutCubic), and ONE reduced-motion rule (final value immediately,
 * no ticking) everywhere a number counts up.
 *
 * Display formatting stays at the call sites (KpiCard → toArabicNumber,
 * StatsSection → formatNumber "ar-LY") — the hook returns a number, not
 * a string; formatting is lib/format.ts's job (v6 §A single seam).
 *
 * `paused` exists for view-gating (StatsSection waits for IntersectionObserver
 * in-view before counting): the counter holds at its current value until the
 * gate opens.
 *
 * usePrefersReducedMotion is exported alongside the hook because KpiCard's
 * entrance stagger (and any other motion decision) needs the same live
 * matchMedia subscription — it is the v11-A7 local framer twin, now shared
 * instead of copied per file.
 */

/* ---------- Reduced-motion hook (v11-A7 local framer twin, shared) ---------- */

/** Live prefers-reduced-motion subscription (no framer-motion bundle cost). */
export function usePrefersReducedMotion(): boolean {
	const [reduced, setReduced] = useState(false)
	useEffect(() => {
		const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
		setReduced(mq.matches)
		const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
		mq.addEventListener("change", onChange)
		return () => mq.removeEventListener("change", onChange)
	}, [])
	return reduced
}

/* ---------- Unified count-up ---------- */

export interface UseCountUpOptions {
	/** Hold the counter at its current value (e.g. StatsSection's in-view gate). Default false. */
	paused?: boolean
}

/** One duration for every count-up in the app. */
const DURATION_MS = 800

/** One curve for every count-up in the app (matches the pre-unification KpiCard behavior). */
const easeOutCubic = (progress: number): number => 1 - Math.pow(1 - progress, 3)

/**
 * Animates `target` from the currently displayed value (initially 0) and
 * returns the value to render. Re-tweens from wherever the display stands
 * when `target` changes — never snaps back to zero (KpiCard contract).
 */
export function useCountUp(target: number, { paused = false }: UseCountUpOptions = {}): number {
	const [display, setDisplay] = useState(0)
	const reduced = usePrefersReducedMotion()
	const raf = useRef<number | null>(null)
	// Last value painted — a re-tween starts here, not from 0.
	const current = useRef(0)

	useEffect(() => {
		if (paused) return
		// Reduced motion: skip the count-up entirely and show the final value.
		if (reduced || current.current === target) {
			current.current = target
			setDisplay(target)
			return
		}
		const from = current.current
		const start = performance.now()
		function step(now: number) {
			const progress = Math.min((now - start) / DURATION_MS, 1)
			const next = Math.round(from + (target - from) * easeOutCubic(progress))
			current.current = next
			setDisplay(next)
			if (progress < 1) raf.current = requestAnimationFrame(step)
		}
		raf.current = requestAnimationFrame(step)
		return () => {
			if (raf.current !== null) cancelAnimationFrame(raf.current)
		}
	}, [target, paused, reduced])

	return display
}
