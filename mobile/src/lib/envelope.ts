/**
 * SmartBot Mobile — فك مغلفات القوائم من الباكند.
 *
 * الباكند (Track A) يرجع قوائم بأشكال متعددة بعد فك الـ envelope المركزي
 * (services/api.ts يفك {success,data} وي سلّم data):
 *  - مغلّف مقسّم:   data = {items: [...], total, page, per_page}
 *    (comments · subscribers · crm/customers · marketing/campaigns ·
 *     support/tickets · ads/accounts ...)
 *  - مصفوفة مجردة (عقد قديم): data = [...]
 *    (broadcasts · offers · templates · logs · payments/history ...)
 *
 * الدالة الموحدة أدناه تتقبّل الشكلين — الشاشات لا تفترض مصفوفة أبدًا
 * (درس M-01..M-06 من تدقيق v25: انحراف العقد كان يكسر 6 شاشات).
 */

/** مغلّف القوائم المقسّمة (عقد Paginated<T> في الباكند). */
export interface PaginatedEnvelope<T> {
  items: T[]
  total?: number
  page?: number
  per_page?: number
}

/**
 * يستخرج مصفوفة العناصر من رد القائمة أيًّا كان شكله:
 *  - {items: [...]} → العناصر (مفتاح items حصرًا — العقد الحالي).
 *  - مصفوفة مجردة → المصفوفة نفسها (توافق عقد القوائم القديمة).
 *  - أي شيء آخر (null/كائن بلا items/غير مصفوفة) → [] (لا انهيار).
 */
export function extractItems<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[]
  if (payload !== null && typeof payload === 'object') {
    const items = (payload as Record<string, unknown>).items
    if (Array.isArray(items)) return items as T[]
  }
  return []
}
