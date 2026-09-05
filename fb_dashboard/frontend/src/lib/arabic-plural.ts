/**
 * Arabic pluralization for count + noun phrases.
 *
 * Arabic has six noun-number states (unlike English singular/plural):
 *   0        → zero form      ("لا أصناف" / custom, e.g. "لا طلبات")
 *   1        → singular       ("صنف واحد")
 *   2        → dual           ("صنفان")
 *   3–10     → plural         ("5 أصناف")
 *   11+      → singular       ("15 صنفاً")
 *
 * The dual and plural are derived mechanically when not supplied
 * (sound masculine/feminine patterns). For broken plurals pass the
 * explicit forms.
 *
 * Ported verbatim from Smart-Menu (smart-link.ly shared identity) —
 * both projects must pluralize Arabic identically.
 */

/** Number state used to pick the noun form. */
export type ArabicNumberState = "zero" | "one" | "two" | "few" | "many"

/**
 * Classifies a non-negative integer into the Arabic number state.
 */
export function arabicNumberState(count: number): ArabicNumberState {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`arabicNumberState expects a non-negative integer, got ${count}`)
  }
  if (count === 0) return "zero"
  if (count === 1) return "one"
  if (count === 2) return "two"
  if (count >= 3 && count <= 10) return "few"
  return "many" // 11+
}

/**
 * Sound-dual of an Arabic noun.
 * Feminine nouns ending in ة drop it and add ان ("قائمة" → "قائمتان").
 * Everything else appends ان ("صنف" → "صنفان", "مطعم" → "مطعمان").
 */
function soundDual(singular: string): string {
  if (singular.endsWith("ة")) {
    return `${singular.slice(0, -1)}تان`
  }
  return `${singular}ان`
}

export interface ArabicPluralForms {
  /** Form used with 0. Default 'لا ' + plural. */
  zero?: string
  /** Form used with 1. Defaults to the singular itself. */
  one?: string
  /** Form used with 2. Defaults to the mechanical sound dual. */
  two?: string
  /** Form used with 3–10. Defaults to the mechanical sound plural. */
  few?: string
  /** Form used with 11+. Defaults to the singular. */
  many?: string
}

/**
 * Returns the correct noun form for `count`.
 */
export function getArabicPlural(
  count: number,
  singular: string,
  dualOrForms?: string | ArabicPluralForms,
  plural?: string,
): string {
  // Merge the positional signature (singular, dual?, plural?) with the
  // richer object signature without mutating caller-supplied objects.
  let forms: ArabicPluralForms = {}
  if (typeof dualOrForms === "string") {
    forms = { two: dualOrForms }
  } else if (dualOrForms) {
    forms = dualOrForms
  }
  if (plural !== undefined && forms.few === undefined) {
    forms = { ...forms, few: plural }
  }
  // Positional form with no explicit plural → mechanical derivation.
  const resolveFew = () => forms.few ?? derivePlural(singular)

  switch (arabicNumberState(count)) {
    case "zero":
      return forms.zero ?? `لا ${resolveFew()}`
    case "one":
      return forms.one ?? singular
    case "two":
      return forms.two ?? soundDual(singular)
    case "few":
      return resolveFew()
    case "many":
      return forms.many ?? singular
  }
}

/**
 * Mechanical sound plural (جمع مذكر سالم) fallback:
 * feminine nouns ending in ة → ات ("طبقة" → "طبقات"),
 * everything else → ون. Broken plurals MUST be passed explicitly.
 */
function derivePlural(singular: string): string {
  return singular.endsWith("ة") ? `${singular.slice(0, -1)}ات` : `${singular}ون`
}
