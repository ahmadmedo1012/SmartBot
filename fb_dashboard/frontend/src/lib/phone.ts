// Libyan phone normalization — r133 (A12 S10): the SO phone.ts twin, ported
// so the payment paths accept what Smart-Order accepts (+218 / 00218 /
// Eastern digits / missing trunk-0) while every request still leaves the
// client in the CANONICAL local 09XXXXXXXX mask (R10).
// Libyan mobile prefixes: 091/093 (Al Madar), 092/094 (Libyana),
// 095 (Aljeel Aljadeed/LTT).

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function normalizeDigits(input: string): string {
  return input.replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)));
}

/** Extract bare digits from any user-typed phone string. */
function phoneDigits(input: string): string {
  return normalizeDigits(String(input ?? "")).replace(/\D/g, "");
}

/**
 * Normalize a Libyan phone number to the canonical local 10-digit mask
 * (09XXXXXXXX). Accepts: 0912345678, 218912345678, +218 91 234 5678,
 * ٩١٢٣٤٥٦٧٨, 912345678. Returns null when it cannot be a valid Libyan
 * mobile/landline number.
 */
export function normalizeLibyanPhone(input: string): string | null {
  let d = phoneDigits(input);
  if (!d) return null;
  if (d.startsWith("00218")) d = d.slice(5);
  else if (d.startsWith("218")) d = d.slice(3);
  if (d.length === 9 && d.startsWith("9")) d = "0" + d; // 91xxxxxxx missing trunk 0
  if (d.length !== 10 || !d.startsWith("0")) return null;
  if (!/^0[125-9]/.test(d)) return null; // Libyan national prefixes
  return d;
}
