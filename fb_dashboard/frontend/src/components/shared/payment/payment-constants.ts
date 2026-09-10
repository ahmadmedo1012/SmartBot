/* v11-A3: extracted from PaymentDialog.tsx — shared types, fallback values
   and Arabic label constants for the subscription payment dialog. Every
   literal here must stay byte-identical to the pre-decomposition value
   (zero visual/behavioral change gate). */

// SmartBot backend contract for POST /api/subscriptions `provider`
export type Provider = "liyana" | "madar" | "bank"

/* v18 (1-b): the pending-request probe contract — GET /api/subscriptions/
 * pending answers with the user's live pending row (or ok(null)). The dialog
 * probes it on open and lands directly on the pending screen when a row
 * exists, closing the 400 «لديك طلب دفع معلق» dead end BEFORE the user ever
 * fills the form. Mirrors the backend field set in plans.py verbatim. */
export interface PendingPayment {
  payment_id: number
  status: string
  plan_id: number
  plan_name: string
  amount: number
  provider: string
  created_at: string | null
}

// Balance-transfer destination numbers. Admin-editable via SystemConfig
// (balance_transfer_phone_1 / _2) — these are the pre-config fallbacks.
// v22 (FIX-C verified — DO NOT "swap"): Libyan operator prefixes are
// Libyana 092/094 and Al Madar 091/093 (libyana.ly transfer example
// `*122*092/94XXXXXXX*1000#`; wazi.almadar.ly; en.wikipedia "Telephone
// numbers in Libya"). So 0910089975 (091) IS the Al Madar number →
// DEFAULT_MADAR_PHONE, and 0942119637 (094) IS the Libyana number →
// DEFAULT_LIBYANA_PHONE. The mapping phone_1→مدار / phone_2→ليبيانا
// (index.tsx) matches the production SystemConfig rows exactly — the
// W1-D5 "swapped wallets" finding was a false positive (inverted prefix
// assumption). Pinned by PaymentDialog.test.tsx (wallet mapping regression).
export const DEFAULT_MADAR_PHONE = "0910089975"
export const DEFAULT_LIBYANA_PHONE = "0942119637"

// Bank transfer details. Admin-editable via SystemConfig; empty-string
// fallbacks keep the rows rendered (copy copies "") until configured.
export const DEFAULT_BANK_NAME = ""
export const DEFAULT_BANK_ACCOUNT = ""
export const DEFAULT_BANK_IBAN = ""

// Provider display labels (Arabic)
export const LIBYANA_LABEL = "ليبيانا"
export const MADAR_LABEL = "مدار"
export const BANK_TRANSFER_LABEL = "تحويل بنكي"

// Bank-account row labels
export const BANK_NAME_ROW_LABEL = "المصرف"
export const BANK_ACCOUNT_ROW_LABEL = "رقم الحساب"
export const BANK_IBAN_ROW_LABEL = "IBAN"

// Clipboard toast messages
export const COPY_SUCCESS_MESSAGE = "تم النسخ"
export const COPY_ERROR_MESSAGE = "فشل النسخ"
