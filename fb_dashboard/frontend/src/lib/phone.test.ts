/**
 * r140 — unit pins for the Libyan phone seam (src/lib/phone.ts).
 *
 * toWaMe/isWaMeNumber are NEW this round (the Smart-Link r138 "wa.me gate"
 * lesson ported to SmartBot): the LIVE production config stores
 * support_whatsapp in LOCAL form (0910089975) while wa.me requires the
 * international spelling with no leading zero — every wa.me link on the
 * site (root-layout FAB + Footer + support page) was dead until toWaMe.
 * These pins lock the transformation, including the r138 short mobile and
 * the fleet doctrine (a landline NEVER becomes a wa.me target — raw text,
 * no dead links — Smart-Menu r103-F8 lesson).
 *
 * normalizeLibyanPhone pins document the four-twin family contract
 * (_utils.py / web phone.ts / mobile phone.ts / SO origin — r138 #1: any
 * change to one twin applies to all four in the same round) at its web
 * home, mirroring mobile/src/lib/phone.test.ts.
 */
import { describe, expect, it } from "vitest"

import { isWaMeNumber, normalizeLibyanPhone, toWaMe } from "./phone"

describe("toWaMe — raw support number → wa.me-ready international digits", () => {
  it("flips the LOCAL long mobile to 218 international (the LIVE production value)", () => {
    // (r140) قيمة الإنتاج الحالية نفسها — كانت تولّد wa.me/0910089975 ميتًا
    expect(toWaMe("0910089975")).toBe("218910089975")
  })

  it("flips the r138 SHORT mobile (9 digits) too — the partial normalization missed it", () => {
    expect(toWaMe("091234567")).toBe("21891234567")
  })

  it("keeps an already-international mobile as is", () => {
    expect(toWaMe("218910089975")).toBe("218910089975")
    expect(toWaMe("+218 91 234 5678")).toBe("218912345678")
  })

  it("folds Eastern digits and separators before the flip", () => {
    expect(toWaMe("٠٩١٠٠٨٩٩٧٥")).toBe("218910089975")
    expect(toWaMe("091-008 9975")).toBe("218910089975")
  })

  it("never converts a LANDLINE — the fleet doctrine: no dead wa.me links", () => {
    // الأرضي لا يطابق نمط المحمول فيرجع كما نُظّف — المستهلك يعرضه نصًا
    // خامًا (isWaMeNumber=false) ولا يولد رابطًا ميتًا
    expect(toWaMe("0211234567")).toBe("0211234567")
    expect(toWaMe("00218910089975")).toBe("00218910089975") // 00218 prefix is NOT stripped here
  })

  it("keeps the legacy fallback: foreign/garbage passes through cleaned", () => {
    expect(toWaMe(" 155-5123 4567 ")).toBe("15551234567")
    expect(toWaMe("")).toBe("")
  })
})

describe("isWaMeNumber — link-vs-text decision for consumers that display the number", () => {
  it("true for a Libyan mobile in any spelling (local long/short, international)", () => {
    expect(isWaMeNumber("0910089975")).toBe(true)
    expect(isWaMeNumber("091234567")).toBe(true)
    expect(isWaMeNumber("218910089975")).toBe(true)
    expect(isWaMeNumber("+218912345678")).toBe(true)
  })

  it("false for a landline, a foreign number or garbage — displayed as raw text", () => {
    expect(isWaMeNumber("0211234567")).toBe(false)
    expect(isWaMeNumber("15551234567")).toBe(false)
    expect(isWaMeNumber("")).toBe(false)
  })
})

describe("normalizeLibyanPhone — the four-twin family contract (r138)", () => {
  it("accepts the unified Libyan contract: mobile 09 long/short + trunk + landline", () => {
    expect(normalizeLibyanPhone("0912345678")).toBe("0912345678")
    expect(normalizeLibyanPhone("091234567")).toBe("091234567") // (r138) short
    expect(normalizeLibyanPhone("912345678")).toBe("0912345678") // trunk-0 restored
    expect(normalizeLibyanPhone("91234567")).toBe("091234567") // short trunk
    expect(normalizeLibyanPhone("+218 91 234 5678")).toBe("0912345678")
    expect(normalizeLibyanPhone("00218912345678")).toBe("0912345678")
    expect(normalizeLibyanPhone("٠٩١٢٣٤٥٦٧٨")).toBe("0912345678")
    expect(normalizeLibyanPhone("0211234567")).toBe("0211234567") // landline 0[1-9]
    expect(normalizeLibyanPhone("0411234567")).toBe("0411234567")
  })

  it("rejects garbage, foreign numbers and trunk-less landlines", () => {
    expect(normalizeLibyanPhone("123456789")).toBeNull()
    expect(normalizeLibyanPhone("212345678")).toBeNull() // landline without trunk
    expect(normalizeLibyanPhone("021123456")).toBeNull() // landline too short
    expect(normalizeLibyanPhone("15551234567")).toBeNull() // foreign
    expect(normalizeLibyanPhone("")).toBeNull()
  })
})
