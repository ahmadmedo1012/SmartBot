/**
 * P21-W6-B5 — عقد وحدة قوالب القواعد (gap #1).
 *
 * Pure module contract (no DOM): every template must produce a payload the
 * REAL POST /api/rules accepts (routers/rules.py RulePayload — verified
 * read-only, no assumptions):
 *   - name non-empty after strip (422 «الحقول المطلوبة ناقصة» otherwise)
 *   - keywords non-empty after the backend's own comma-split — a blank
 *     after split is a 400 («الكلمات المفتاحية مطلوبة») AND an empty list
 *     would silently become a catch-all rule (matching.py contract)
 *   - reply_template non-empty after strip (422 otherwise)
 *   - the page sends priority "50" (PRIORITY_DEFAULT 1-999) — clamped into
 *     the backend's 1-999 window before the request
 *   - count within the mission's 6-10 band (ManyChat-template gap answer)
 */
import { describe, expect, it } from "vitest"

import {
  RULE_TEMPLATES,
  RULE_TEMPLATES_COUNT,
  type RuleTemplate,
} from "./rule-templates"

/** The backend's exact split (rules.py _keywords_list): comma + strip. */
function backendKeywordSplit(raw: string): string[] {
  return raw.split(",").map((k) => k.trim()).filter(Boolean)
}

describe("rule templates — real API payload contract", () => {
  it("ships 6-10 templates (the mission band; ManyChat-gap answer)", () => {
    expect(RULE_TEMPLATES_COUNT).toBeGreaterThanOrEqual(6)
    expect(RULE_TEMPLATES_COUNT).toBeLessThanOrEqual(10)
    expect(RULE_TEMPLATES).toHaveLength(RULE_TEMPLATES_COUNT)
  })

  it("every template id is unique (stable React keys)", () => {
    const ids = RULE_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("every template produces a payload POST /api/rules accepts", () => {
    for (const t of RULE_TEMPLATES as RuleTemplate[]) {
      // name — 422 family guard
      expect(t.title.trim().length, `name empty: ${t.id}`).toBeGreaterThan(0)
      // keywords — the 400 + catch-all family guard (backend comma-split)
      const kws = backendKeywordSplit(t.keywords)
      expect(kws.length, `keywords empty after split: ${t.id}`).toBeGreaterThan(0)
      for (const k of kws) {
        expect(k.includes(",")).toBe(false) // no un-split compound leaking through
      }
      // reply_template — 422 family guard
      expect(t.reply.trim().length, `reply empty: ${t.id}`).toBeGreaterThan(0)
    }
  })

  it("the page's form fields map 1:1 — no extra/missing field on the template", () => {
    for (const t of RULE_TEMPLATES) {
      expect(Object.keys(t).sort()).toEqual([
        "description",
        "id",
        "keywords",
        "reply",
        "title",
      ])
    }
  })
})
