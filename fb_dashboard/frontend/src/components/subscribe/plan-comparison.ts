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
 * Formats a numeric cap as an Arabic phrase with correct plural forms.
 */
export function formatCap(count: number, singular: string, plural: string): string {
  if (count >= UNLIMITED_PAGES) return "غير محدود"
  const noun = getArabicPlural(count, singular, undefined, plural)
  if (count === 1) return `${noun} واحد`
  if (count === 2) {
    // Mechanical dual already ends in ان — don't append a digit.
    return noun.endsWith("ان") ? noun : `${noun} اثنان`
  }
  return `${toArabicNumber(count)} ${noun}`
}

/**
 * The headline differentiator phrase under the plan price — SmartBot's
 * equivalent of Smart-Menu's itemsPhrase (menu items → bot replies).
 */
export function repliesPhrase(plan: ComparisonPlan): string {
  if (plan.maxReplies >= UNLIMITED_REPLIES) return "ردود غير محدودة"
  return `حتى ${toArabicNumber(plan.maxReplies)} ${getArabicPlural(plan.maxReplies, "رد", undefined, "ردود")}`
}

/** Maps SmartBot's snake_case API plan into the comparison shape. */
export function toComparisonPlan(p: {
  id: number
  name: string
  name_ar?: string
  price: number
  features?: string[] | string
  max_replies?: number
  max_pages?: number
  max_rules?: number | string
  sort_order?: number
}): ComparisonPlan {
  const features: string[] = Array.isArray(p.features)
    ? p.features
    : typeof p.features === "string" && p.features
      ? p.features.split(/[\n,،]/).map((s) => s.trim()).filter(Boolean)
      : []
  return {
    id: p.id,
    name: p.name,
    nameAr: p.name_ar || p.name,
    price: Number(p.price),
    features,
    maxReplies: Number(p.max_replies ?? 0),
    maxPages: Number(p.max_pages ?? 0),
    maxRules: Number(p.max_rules ?? 0),
    sortOrder: Number(p.sort_order ?? 0),
  }
}
