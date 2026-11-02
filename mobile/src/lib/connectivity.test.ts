/**
 * GAP-X2 (P42-5b) — عقود مسند الاتصال المشترك (lib/connectivity.ts).
 *
 * السلوك الحرج الذي تثبته هذه العقود (لا يمكن رسم المكوّنات في بيئة
 * node — نمط theme.parity §4/§6 — لكن المسند نفسه TS صافٍ فيستورد):
 *
 *   - لا واجهة شبكة (isConnected=false) → انقطاع مؤكد مهما كانت بقية
 *     الحقول (null لا تنقذها — null تعني «لم يُفحص» لا «يعمل»).
 *   - واجهة موجودة لكن الإنترنت لا يصل (isInternetReachable=false —
 *     بوابة خانقة/DNS ميت) → انقطاع مؤكد كذلك: اللافتة تظهر والجلب
 *     يتوقف، فلا ترمي الشاشات أخطاء وهمية على شبكة ميتة.
 *   - isInternetReachable=null (بعض المنصات لا تفحصه) → نقرّه اتصالًا:
 *     اللافتة لا تظهر إلا عند انقطاع مؤكد، والفشل الفعلي إن حدث يظهر
 *     كخطأ صادق بإعادة محاولة (ErrorState) — هذا هو التمييز بين
 *     انقطاع الجهاز وفشل الخادم.
 */
import { describe, expect, it } from 'vitest'
import type { NetInfoState } from '@react-native-community/netinfo'

import { isNetReachable } from '@/lib/connectivity'

/** مصنع حالة شبكة أدنى — الحقول الأخرى لا تدخل المسند أصلًا. */
function state(isConnected: boolean | null, isInternetReachable: boolean | null): NetInfoState {
  return { isConnected, isInternetReachable } as unknown as NetInfoState
}

describe('isNetReachable — مسند الاتصال المشترك (GAP-X2)', () => {
  it('اتصال كامل (isConnected=true, isInternetReachable=true) → متصل', () => {
    expect(isNetReachable(state(true, true))).toBe(true)
  })

  it('لا واجهة شبكة (isConnected=false) → انقطاع مؤكد مهما كان الباقي', () => {
    expect(isNetReachable(state(false, false))).toBe(false)
    // null في قابلية الوصول لا «تنقذ» غياب الواجهة — null = لم يُفحص
    expect(isNetReachable(state(false, null))).toBe(false)
  })

  it('واجهة موجودة لكن الإنترنت لا يصل (isInternetReachable=false — بوابة خانقة) → انقطاع', () => {
    expect(isNetReachable(state(true, false))).toBe(false)
  })

  it('قابلية الوصول غير محسومة (null) → نقرّها اتصالًا: اللافتة تظهر عند الانقطاع المؤكد فقط', () => {
    expect(isNetReachable(state(true, null))).toBe(true)
  })
})
