/**
 * Plan comparison logic shared by /pricing and /subscribe.
 * Ported from Smart-Menu (smart-link.ly shared identity) — pure functions
 * only, no React. The plan shape mirrors SmartBot's GET /api/plans
 * response (SubscriptionPlan with parsed features): replies/pages/rules
 * caps instead of Smart-Menu's menus/items/orders.
 */
import { getArabicPlural } from "@/lib/arabic-plural"
import { toArabicNumber } from "@/lib/format"

/** Plan shape from GET /api/plans. */
export type ComparisonPlan = {
  id: number
  name: string
  nameAr: string
  price: number
  features: string[]
  maxReplies: number
  maxPages: number
  maxRules: number
  sortOrder: number
}

/** Sentinel values the DB uses for "unlimited" caps. */
const UNLIMITED_REPLIES = 999999
const UNLIMITED_PAGES = 999
const UNLIMITED_RULES = 999

/**
 * The headline differentiator phrase under the plan price — SmartBot's
 * equivalent of Smart-Menu's itemsPhrase (menu items → bot replies).
 */
export function repliesPhrase(plan: ComparisonPlan): string {
  if (plan.maxReplies >= UNLIMITED_REPLIES) return "ردود غير محدودة"
  return `حتى ${toArabicNumber(plan.maxReplies)} ${getArabicPlural(plan.maxReplies, "رد", undefined, "ردود")}`
}

/** Input shape of a plan row from GET /api/plans (trusted backend contract:
 *  features is Column(JSON, default=list) on the backend — always an
 *  array on the wire; the legacy string-split branch was dead code,
 *  removed in v16-E4 per the D7 slop-scan). */
export type ComparisonPlanInput = {
  id: number
  name: string
  name_ar?: string
  price: number
  features?: string[]
  max_replies?: number
  max_pages?: number
  max_rules?: string | number
  sort_order?: number
}

export function toComparisonPlan(p: ComparisonPlanInput): ComparisonPlan {
  return {
    id: p.id,
    name: p.name,
    nameAr: p.name_ar || p.name,
    price: Number(p.price),
    features: p.features ?? [],
    maxReplies: Number(p.max_replies ?? 0),
    maxPages: Number(p.max_pages ?? 0),
    maxRules: Number(p.max_rules ?? 0),
    sortOrder: Number(p.sort_order ?? 0),
  }
}
