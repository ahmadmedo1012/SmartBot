/**
 * v14-E7 (تصميم D13 §6.2) — بذرة الشخصيات الثمانية لبطارية المحاكاة.
 * v15-E8 (تصميم D13 §4.2-§4.7) — الشخصيات الست الجديدة p09-p14 (إلحاق فقط).
 * بيانات ثابتة قابلة للتوليد: كل شخصية تُشتق اسم مستخدمها من بادئتها +
 * طابع زمني عند التسجيل (helpers/session.ts) حتى تكون كل جولة قابلة
 * للتكرار على قاعدة نظيفة (السكربت يحذف v15-sim.db في كل تشغيل).
 */

export interface PersonaRule {
  keyword: string
  reply: string
}

export interface Persona {
  id: string
  name: string
  /** false = زائر بلا حساب (P01) */
  register: boolean
  /** بادئة اسم المستخدم عند التسجيل */
  usernamePrefix?: string
  password?: string
  viewport?: { width: number; height: number }
  network3g?: boolean
  pageId?: string
  pageName?: string
  accessToken?: string
  rule?: PersonaRule
  phone?: string
  provider?: string
  receipt?: string
  /** شخصية تعيد استخدام حساب p02 (P04 = «منال عائدة») */
  reuse?: string
  admin?: boolean
  operatorPrefix?: string
  hijackPageId?: string
  ownPageId?: string
  attack?: boolean
  fbUserId?: string
}

export const personas: Record<string, Persona> = {
  p01: {
    id: 'p01',
    name: 'سالم الزائر',
    register: false,
    viewport: { width: 375, height: 812 },
    network3g: true,
  },
  p02: {
    id: 'p02',
    name: 'منال المشتركة',
    register: true,
    usernamePrefix: 'p02',
    password: 'Sim#P02pass',
    pageId: '1002003001',
    pageName: 'متجر منال',
    accessToken: 'sim-token-p02',
    rule: {
      keyword: 'السعر',
      reply: 'السعر يبدأ من 50 د.ل مع توصيل مجاني داخل طرابلس',
    },
    phone: '0910000001',
    provider: 'liyana',
  },
  p03: {
    id: 'p03',
    name: 'عبدالسلام البنكي',
    register: true,
    usernamePrefix: 'p03',
    password: 'Sim#P03pass',
    receipt: 'fixtures/receipt.png',
    provider: 'bank',
  },
  p04: {
    id: 'p04',
    name: 'منال عائدة',
    register: false,
    reuse: 'p02',
  },
  p05: {
    id: 'p05',
    name: 'أنس أدمن المنصة',
    register: false,
    admin: true,
    operatorPrefix: 'p05op',
  },
  p06: {
    id: 'p06',
    name: 'رامي المستأجر الثاني',
    register: true,
    usernamePrefix: 'p06',
    password: 'Sim#P06pass',
    hijackPageId: '1002003001',
    ownPageId: '1002003002',
  },
  p07: {
    id: 'p07',
    name: 'خالد المهاجم',
    register: false,
    attack: true,
  },
  p08: {
    id: 'p08',
    name: 'فاطمة زبونة البوت',
    register: false,
    fbUserId: '9001',
    pageId: '1002003001',
  },

  // ── v15-E8: الشخصيات الست الجديدة (تصميم D13 §4.2-§4.7) ──────────────
  p09: {
    id: 'p09',
    name: 'هادي الزبون متعدد الأجهزة',
    register: false,
    fbUserId: '9010',
    pageId: '1002003001', // صفحة p02 — نفس الزبون من هاتف وحاسوب
  },
  p10: {
    id: 'p10',
    name: 'وسام مدير الخطة',
    register: true,
    usernamePrefix: 'p10',
    password: 'Sim#P10pass',
    pageId: '1002003003',
    pageName: 'متجر وسام',
    accessToken: 'sim-token-p10',
    rule: {
      keyword: 'السعر',
      reply: 'أسعارنا تبدأ من 30 د.ل والشحن داخل بنغازي مجاني',
    },
    phone: '0910000010',
    provider: 'liyana',
  },
  p11: {
    id: 'p11',
    name: 'ياسر المتصفح العربي',
    register: false,
    reuse: 'p02',
    viewport: { width: 390, height: 844 },
    network3g: true,
  },
  p12: {
    id: 'p12',
    name: 'عبدالرؤوف قارئ الشاشة',
    register: false,
    reuse: 'p02',
  },
  p13: {
    id: 'p13',
    name: 'مروان المهاجم الموسّع',
    register: false,
    attack: true,
  },
  p14: {
    id: 'p14',
    name: 'أنس أدمن التدوير',
    register: false,
    admin: true,
  },
}

/** المشغل (P05-B) — التسجيلة الرابعة؛ v15: الخامسة p10 (§6.4 ميزانية D13). */
export const operatorPersona: Persona = {
  id: 'p05op',
  name: 'مشغل منال (مالك المستأجر)',
  register: true,
  usernamePrefix: 'p05op',
  password: 'Sim#P05pass',
}

/** بادئة طابع زمني قصيرة لاسم المستخدم (حروف/أرقام فقط — عقد register). */
export function tsSuffix(): string {
  return Date.now().toString(36).slice(-6)
}
