# SmartBot 2.0 — خطة إعادة البناء الشاملة
## Improved Rebuild Plan — Post-Deep Audit

> Based on: comprehensive source audit of SmartBot + Smart-Menu (reference project)
> Date: September 3, 2026

---

## ⚠️ ملاحظة مهمة: نظام الدفع موجود بالفعل

**كلا المشروعين (SmartBot و Smart-Menu) يستخدمان نفس الطريقة:**
- محافظ موبايل (ليبيانا/مدار) + تحويل بنكي
- موافقة أدمن عبر بوت Telegram
- لا يوجد Stripe أو PayPal أو أي بوابة دفع خارجية

الفرق: **جودة التنفيذ**. Smart-Menu أكثر اكتمالاً. المطلوب هو **رفع مستوى تنفيذ SmartBot** ليطابق Smart-Menu وليس بناء نظام جديد.

---

## 🔴 أولوية الصفر: إصلاح تسريب بيانات المستأجرين (Tenant Data Leak) — قبل أي شيء

**هذا تسريب أمني حقيقي وليس مشكلة جمالية.**

### 🔴 Issue 1: WebSocket Cross-Tenant Broadcast (حرج)
**الملف:** `fb_dashboard/ws_manager.py` + `fb_dashboard/_services.py`

```python
# المشكلة: event_bus و ws_manager هما singleton عالمي
# كل حدث يُبث لجميع العملاء المتصلين بغض النظر عن tenant_id
ws_manager.broadcast(event_data)  # يُرسل لكل مستأجر!
```

**الحل:** إضافة tenant_id إلى WebSocket connection و filter:
```python
class WSConnection:
    def __init__(self, websocket, tenant_id: int, user_id: int):
        self.websocket = websocket
        self.tenant_id = tenant_id
        self.user_id = user_id

# في broadcast: فقط tenant_id مطابق
async def broadcast_to_tenant(self, tenant_id: int, event: dict):
    for conn in self.connections:
        if conn.tenant_id == tenant_id:
            await conn.send_json(event)
```

### 🔴 Issue 2: `/api/system/stats` يُرجع بيانات كل المستأجرين
**الملف:** `fb_dashboard/routers/plans_config.py` السطور 99-118

```python
# المشكلة:
total_replies = await db.scalar(select(func.count(Reply.id)))  # بلا filter!
# الحل:
total_replies = await db.scalar(
    select(func.count(Reply.id)).where(Reply.tenant_id == current_user._tenant_id)
)
```

### 🟠 Issue 3: Webhook BotEngine Inline Instantiation
**الملف:** `fb_dashboard/runner.py` السطور 856-881

```python
# المشكلة: new BotEngine inline بدلاً من get_bot_engine()
await BotEngine(fb_client, tenant_id=bs.tenant_id).process_single_comment(...)
# الحل: استخدام Registry
engine = get_bot_engine(fb_client, tenant_id=bs.tenant_id)
```

### 🟡 Issue 4: `/api/bot/state` Generic Error Handler
**الملف:** `fb_dashboard/runner.py`

```python
# fallback tenant_id=0 يمكن أن يعرّض بيانات مستأجرين آخرين
engine = get_bot_engine()  # tenant_id=0
```

---

## ✅ المرحلة 1: إصلاح البنية التحتية والاستقرار (أسبوع 1-2)

### 1.1 إصلاح WebSocket Tenant Isolation
**الأولوية:** 🔴 Critical — تسريب بيانات
**الملفات:** `ws_manager.py`, `_services.py`, `runner.py`

```
المتطلبات:
1. إضافة tenant_id و user_id لكل WebSocket connection
2. إنشاء broadcast_to_tenant(tenant_id, event) method
3. إصلاح event_bus.py لبث الأحداث فقط للمستأجر المعني
4. إزالة broadcast() العام نهائياً
5. اختبار: مستأجر A لا يرى أحداث مستأجر B
```

### 1.2 إصلاح API Endpoints لتسريب البيانات
**الأولوية:** 🔴 Critical
**الملفات:** `routers/plans_config.py`, `routers/analytics.py`

```
المتطلبات:
1. /api/system/stats → إضافة where(tenant_id=current_user._tenant_id)
2. /api/analytics/* → مراجعة كل endpoints إضافية
3. /api/bot/state → إزالة fallback tenant_id=0
4. /api/bot/config → التحقق من tenant_id في كل endpoint
```

### 1.3 إصلاح Webhook Tenant Routing
**الأولوية:** 🟠 High
**الملف:** `runner.py`

```
المتطلبات:
1. استخدام get_bot_engine(fb_client, tenant_id=bs.tenant_id) في webhook handler
2. إزالة fallback get_bot_engine() بدون tenant_id
3. إضافة logging عند فشل tenant lookup
```

### 1.4 تفعيل Branch Protection في GitHub
**الأولوية:** 🟠 High

```
المتطلبات:
1. GitHub Settings → Branch Protection على main:
   - Require pull request reviews (1 approval)
   - Dismiss stale reviews
   - Require linear history
   - Do NOT allow force pushes
2. إنشاء فرع develop للتطوير
3. جميع التغييرات تذهب لـ develop ثم تُراجع ثم تُدمج لـ main
```

### 1.5 إصلاح next.config.ts
**الأولوية:** 🔴 Critical — يمنع API Routes
**الملف:** `fb_dashboard/frontend/next.config.ts`

```typescript
// الحالي (معطوب):
const nextConfig = { output: "export", ... }

// المطلوب:
const nextConfig = {
  images: { unoptimized: false },
  // API proxy ليس ضروري لأن next.config.ts output: "export"
  // يجعل كل شيء static — API calls تذهب مباشرة لـ api.smart-link.ly
  // CORS already configured in FastAPI runner.py
}
```

**ملاحظة:** `output: "export"` معطل في البيئة الحالية (لأن الـ Next.js build ينتج `.next/` وليس `out/`). التحقق:
```bash
ls fb_dashboard/frontend/.next  # يجب أن يكون موجود
grep "output.*export" fb_dashboard/frontend/next.config.ts  # لا يوجد output: export
```

---

## ✅ المرحلة 2: نظام الدفع والاشتراكات (أسبوع 3-4)

### 2.1 مطابقة PaymentDialog مع Smart-Menu
**الأولوية:** 🔴 Critical — Core feature
**الملفات:** `routers/payments.py`, `frontend/src/app/subscribe/SubscribeContent.tsx`

**ماذا ينقص SmartBot مقارنة بـ Smart-Menu:**

| الميزة | Smart-Menu | SmartBot | المطلوب |
|--------|-----------|---------|---------|
| اختيار مزود الدفع (ليبيانا/مدار/بنكي) | ✅ Tab UI | ⚠️ Basic | ✅移植 |
| USSD code للتحويل السريع | ✅ `*122*...#` | ❌ مفقود | ✅ إضافة |
| Bank transfer details (اسم المصرف/رقم الحساب/IBAN) | ✅ من SystemConfig | ❌ مفقود | ✅ إضافة |
| Bank transfer form (اسم صاحب الحساب/رقم الحساب) | ✅ | ❌ مفقود | ✅ إضافة |
| رفع صورة الإيصال (receipt upload) | ✅ | ❌ مفقود | ✅ إضافة |
| Auto-switch to bank عند > 99 LYD | ✅ | ❌ مفقود | ✅ إضافة |
| Copilot/Trial period | ✅ | ❌ مفقود | ✅ إضافة |
| Polling with visibility API | ✅ | ⚠️ Basic | ✅ تحسين |
| Server-side price validation | ✅ | ⚠️ Basic | ✅ تقوية |
| Rate limiting على /subscriptions | ✅ | ❌ مفقود | ✅ إضافة |

### 2.2 Backend Subscription Flow — Refactor
**الملف:** `routers/payments.py`

```python
# 1. إضافة rate limiting (copied from Smart-Menu)
from _rate_limit import check_rate_limit

@router.post("/api/subscriptions")
async def create_subscription(...):
    # Rate limit: 5 attempts per minute per IP
    ip = request.client.host
    if not await check_rate_limit(db, f"sub:{ip}", max_attempts=5, window_seconds=60):
        raise HTTPException(429, "محاولات كثيرة")

# 2. Server-side price validation (إجبارية)
plan = await db.get(SubscriptionPlan, plan_id)
if not plan or not plan.is_active:
    raise HTTPException(400, "الباقة غير صالحة")
if float(amount) != float(plan.price):
    raise HTTPException(400, "المبلغ لا يطابق سعر الباقة")

# 3. Bank transfer bypass for > 99 LYD
if provider == "bank":
    pass  # لا cap
elif provider in ("libyana", "madar"):
    if float(amount) > 99:
        raise HTTPException(400, "المبالغ فوق 99 د.ل تتطلب تحويل بنكي")
```

### 2.3 Frontend Subscribe Page — Full Rewrite
**الملف:** `frontend/src/app/subscribe/SubscribeContent.tsx`

```
الهيكل المطلوب (من Smart-Menu):
Step 1: PlanSelector — عرض البطاقات مع مقارنة الميزات
Step 2: RestaurantInfo — معلومات الحساب + معلومات المطعم
Step 3: PaymentDialog — اختيار مزود الدفع + إرسال
Step 4: Waiting — polling كل 5 ثواني (مع visibility API)
Step 5: Approved/Rejected — رسالة النتيجة

PaymentDialog المطلوب:
- 3 tabs: ليبيانا | مدار | تحويل بنكي
- ليبيانا/مدار: رقم المزود + USSD code + رقم هاتف المستخدم
- بنكي: بيانات الحساب من SystemConfig + نموذج التحويل + رفع الإيصال
- Auto-switch to bank when price > 99
- Countdown: 30 ثانية (للتأكيد اليدوي)
```

### 2.4 SystemConfig للحسابات البنكية
**الملف:** `routers/admin.py` (جديد)

```python
# GET /api/config → يعرض bank_transfer_bank_name, bank_transfer_account_number, bank_transfer_iban
# SET /api/admin/config → للأدمن يحدد بيانات الحساب البنكي
```

### 2.5 Trial Period
**الملف:** `routers/payments.py` + `models.py`

```python
# في SubscriptionPlan:
trial_days: int = Column(Integer, default=0)

# عند تسجيل حساب جديد:
if plan.trial_days > 0:
    tenant.subscription_status = "TRIAL"
    tenant.plan_end = utcnow() + timedelta(days=plan.trial_days)
else:
    # يحتاج دفع
```

### 2.6 Subscription Enforcement في BotEngine
**الملف:** `bot.py`

```python
# التحقق من انتهاء الخطة:
if tenant.subscription_status == "TRIAL" and tenant.plan_end < utcnow():
    tenant.subscription_status = "EXPIRED_TRIAL"
    # لا يمنع BotEngine من العمل لكن يوقف features مدفوعة
```

---

## ✅ المرحلة 3: Landing Page — أرقام حقيقية (أسبوع 3)

### 3.1 إزالة الأرقام الوهمية
**الملف:** `frontend/src/components/landing/sections/StatsSection.tsx`

```typescript
// الحالي (وهمي):
const items = [
  { value: 500,  suffix: "+", label: "صفحة نشطة" },   // 500 FAKE
  { value: 50000, suffix: "+", label: "رد تلقائي" }, // 50000 FAKE
  { value: 98,   suffix: "%", label: "معدل رضا" },  // 98% FAKE
  { value: 24,   suffix: "/7", label: "دعم فني" },  // 24/7 OPERATION
];

// المطلوب: fetch من API حقيقي
interface PublicStats {
  activeTenants: number;
  totalReplies: number;
  activeUsers30d: number;
  uptimePercent: number;
}

// GET /api/public/stats (public endpoint, no auth)
async function fetchStats() {
  const res = await fetch("/api/public/stats");
  return res.json();
}
```

### 3.2 Testimonials — إما حقيقية أو بدون
**الملف:** `frontend/src/app/page.tsx`

```typescript
// الخيار أ: إظهار testimonials حقيقية من DB
// الخيار ب: إخفائها تماماً (أفضل من أرقام وهمية)
const testimonials = realTestimonials.length > 0 ? realTestimonials : [];
```

### 3.3 Public Stats API
**الملف:** `routers/plans_config.py` (السطر 119+)

```python
@router.get("/api/public/stats")
async def public_stats(db=Depends(get_db)):
    """إحصائيات عامة عامة (لا تكشف بيانات مستأجرين)"""
    from models import Tenant, Reply, User
    active_tenants = await db.scalar(
        select(func.count(Tenant.id)).where(Tenant.subscription_status.in_(["PAID", "TRIAL"]))
    total_replies = await db.scalar(select(func.count(Reply.id)))
    return {
        "activeTenants": active_tenants or 0,
        "totalReplies": total_replies or 0,
        "activeUsers30d": 0,  # تقريبي
        "uptimePercent": 99.9,
    }
```

---

## ✅ المرحلة 4: إكمال صفحات Dashboard المفقودة (أسبوع 5-6)

### 4.1 Priority: صفحات FAKE/Placeholder

| الصفحة | الحالة الحالية | المطلوب | الأولوية |
|--------|-------------|---------|---------|
| `notifications/` | 🔴 Fake (useState only) | Backend API + Toast | 🔴 Critical |
| `support/` | 🟠 Fake (FAQ وهمية) | Backend ticket system | 🟠 High |
| `marketing/` | 🟡 Read-only | Full campaign builder | 🟡 Medium |

### 4.2 Notifications System
**الملفات:** `routers/notifications.py` (جديد) + `frontend/src/app/dashboard/notifications/`

```python
# Backend: routers/notifications.py
@router.get("/api/notifications")
async def list_notifications(
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
    limit: int = 50
):
    rows = await db.execute(
        select(Notification)
        .where(Notification.tenant_id == current_user._tenant_id)
        .order_by(desc(Notification.created_at))
        .limit(limit)
    )
    return {"success": True, "data": [...]}

# Model:
class Notification(Base):
    tenant_id = Column(Integer, nullable=False)
    user_id = Column(Integer, nullable=True)
    type: str        # "reply", "payment", "system", "mention"
    title: str
    body: str
    read: bool = False
    link: str = ""
    created_at: datetime
```

**Frontend:** استخدام `sonner` (موجود في package.json) للـ toast + صفحة إشعارات كاملة.

### 4.3 Support Tickets
**الملفات:** `routers/support.py` (جديد) + `frontend/src/app/dashboard/support/`

```
User Flow:
1. إنشاء تذكرة (عنوان + وصف + priority)
2. Admin يرد من dashboard
3. User sees replies in UI

جدار Priority: low | medium | high | urgent
```

### 4.4 Marketing Campaigns
**الملفات:** `routers/marketing.py` (جديد) + `frontend/src/app/dashboard/marketing/`

```
الوظائف المطلوبة:
1. إنشاء حملة (اسم + وصف + تاريخ البدء/النهاية)
2. استهداف (جميع المتابعين / النشطين / المتفاعلين / مخصص)
3. جدولة الإرسال
4. تقارير (مفتوحة/نقر/ردود)
```

### 4.5 Ads Integration
**الملف:** `routers/ads.py` ( موجود لكن لا يعمل)

```
المشكلة: /api/ads/* routes غير موجودة في أي router
الحل: إما تنفيذ كامل أو إزالة الـ page من sidebar
الواقعي: Facebook Marketing API requires app review + business verification
الأفضل: placeholder page مع "قريباً" Until Facebook approves the app
```

### 4.6 Reports + Autoreply + Inbox (موجودة لكن تحتاج تحسين)
```
Reports: OK — لكن PDF export مفقود
Autoreply: OK — لكن bulk rules import مفقود
Inbox: OK — لكن bulk reply مفقود
```

---

## ✅ المرحلة 5: Onboarding Flow (أسبوع 5-6)

### 5.1 المطلوب: 5 خطوات

```
Step 1: إنشاء حساب ( موجود )
Step 2: ربط صفحة Facebook
  - OAuth flow محسّن
  - Test connection قبل التأكيد
Step 3: اختيار الخطة ( موجود لكن يحتاج تحسين UI )
Step 4: إعداد أول Rule
  - Wizard يوجه المستخدم لإنشاء أول rule
  - AI assistance لكتابة الرد
Step 5: شرح لوحة التحكم
  - Interactive tour (React Joyride — موجود في package.json)
  - Highlight key features
```

### 5.2 React Joyride Integration
**الملف:** `frontend/src/components/onboarding/OnboardingTour.tsx`

```typescript
import Joyride, { CallBackProps } from 'react-joyride';

// Tour steps:
const steps = [
  { target: '#sidebar-rules', content: 'هنا تُدارة قواعد الردود التلقائية' },
  { target: '#sidebar-analytics', content: 'شاشة الإحصائيات تُظهر أداء بوتك' },
  { target: '#sidebar-pages', content: 'ربط صفحات فيسبوك متعددة' },
  // ...
];
```

---

## ✅ المرحلة 6: Engine Cleanup (أسبوع 7-8)

### 6.1 Dead Code Elimination

```
DEAD (لا يُستخدم في production flow):
- flow_engine.py (مفعّل لكن لا يعمل)
- pdf_reports_engine.py (مفعّل لكن لا يُستدعى)
- commerce_engine.py (مفصول)
- sequence_engine.py (مفصول)

ALIVE (يُستخدم فعلاً):
- bot.py (BotEngine) ✅
- analytics_engine.py ✅
- broadcast_engine.py ✅
- subscriber_engine.py ✅
- inbox_engine.py ✅
- offer_engine.py ✅
- team_engine.py ✅
```

**الخطة:** لا تحذف — فقط أضف `@deprecated` comment. المستقبل قد يحتاجها.

### 6.2 WebSocket Event Bus Fix
**الملف:** `fb_dashboard/event_bus.py`

```
المشكلة: event_bus هو singleton — لا يميز tenant_id
الحل:
1. event.publish("tenant:123:reply_received", payload)
2. WS handler ي订阅 "tenant:123:*"
3. WSManager يرسل فقط للمستأجر المعني
```

---

## ✅ المرحلة 7: الأمان (أسبوع 9)

### 7.1 Security Checklist

```
[ ] CSRF: موجود ✅ (csrf_origin_check middleware)
[ ] Rate Limiting: موجود لكن ليس شاملاً
    - /api/login: 10/min ✅
    - /api/register: 5/min ✅
    - /api/subscriptions: مفقود ❌ → أضف
    - /api/payments: مفقود ❌ → أضف
[ ] SQL Injection: SQLAlchemy ORM ✅
[ ] XSS: FastAPI auto-escapes JSON ✅
[ ] Password Hashing: Argon2 ✅
[ ] JWT Blacklist: موجود ✅
[ ] 2FA: مفقود ❌ → لاحقاً (بعد MVP)
[ ] CSP Headers: مفقود ❌ → أضف في runner.py
[ ] CORS: موجود ✅
```

### 7.2 CSP Headers
**الملف:** `runner.py`

```python
# في middleware:
response.headers["Content-Security-Policy"] = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: https:; "
    "connect-src 'self' https://api.smart-link.ly; "
    "frame-ancestors 'none';"
)
```

---

## ✅ المرحلة 8: SEO والتوثيق (أسبوع 10-12)

### 8.1 SEO
```
[ ] sitemap.xml موجود ✅ — لكن يحتاج update تلقائي عند إضافة صفحات جديدة
[ ] robots.ts موجود ✅
[ ] OpenGraph: موجود لكن بسيط ❌ → تحسين
[ ] Schema.org: مفقود ❌ → إضافة Organization + Product + FAQPage
[ ] Core Web Vitals: غير معروف ❌ → تفعيل Vercel Speed Insights
```

### 8.2 التوثيق
```
docs/Structure:
- getting-started.md
- installation.md
- deployment.md
- API reference (FastAPI auto-generated at /api/docs)
- user-guide-ar.md
```

---

## 📅 الجدول الزمني المحدث (12 أسبوعاً)

| الأسبوع | المهام |
|---------|--------|
| **1** | 🔴 إصلاح WebSocket leak + API data leak + GitHub protection |
| **2** | إصلاح next.config.ts + webhook routing + rate limiting |
| **3** | PaymentDialog rewrite (من Smart-Menu) + Backend subscription fix |
| **4** | Subscribe page rewrite + Trial period + SystemConfig bank accounts |
| **5** | Landing page (real stats) + Onboarding flow |
| **6** | Notifications system + Support tickets |
| **7** | Marketing campaigns + Ads placeholder |
| **8** | Reports PDF + Autoreply bulk + Inbox bulk |
| **9** | Security audit + 2FA prep + CSP |
| **10** | SEO + Schema.org + Speed Insights |
| **11** | التوثيق + Demo environment |
| **12** | Testing + Buffer + Release |

---

## 🔑 الفرق الجوهري: SmartBot vs Smart-Menu

| الجانب | SmartBot | Smart-Menu | المطلوب |
|---------|---------|-----------|---------|
| Payment | Basic (يظهر USSD string) | Full UI (tabs, bank form, receipt upload) | ✅ Full match |
| Plans | 5 tiers (Free/Basic/Premium/Pro/Enterprise) | 4 tiers (Free/Basic/Premium/Pro) | Different scope |
| Currency | LYD | LYD | ✅ Match |
| Admin Approval | Telegram (callback_query) | Telegram (callback_query) | ✅ Match |
| Pricing UI | Basic cards | Animated cards + monthly/yearly toggle | → Improve |
| Stats | Hardcoded fake | Real from DB | → Fix |
| Multi-tenancy | Application-level (manual) | Application-level (manual) | ✅ Match |
| Frontend | Next.js 16 (App Router) | Next.js 16 (App Router) | ✅ Match |
| Backend | FastAPI | Next.js API Routes | Different architecture |
| Database | SQLAlchemy + SQLite/Postgres | Prisma + Postgres | Different ORM |

---

## 🚫 ما لا يجب بناؤه (ليس في الخطة)

1. **Stripe/PayPal integration** — ليس مطلوباً. الدفع اليدوي (ليبيانا/مدار/بنكي) هو المعتمد وهو كافي للسوق الليبي.
2. **Redis session store** — الـ in-memory dicts كافية لـ Vercel serverless (كل lambda مستقلة).
3. **Row-Level Security (RLS)** — PostgreSQL RLS معقد وغير ضروري حالياً. Application-layer tenancy كافية.
4. **Full RBAC** — الأدوار (admin/editor/viewer) موجودة لكن editor/viewer dead code. لا تبنّي more قبل أن تُصلح existing.
5. **Flow Engine** — موجود لكن لا يعمل. لا تُصلحه الآن — لاحقاً فقط.

---

## 📋 KPI Dashboard

| المقياس | الحالي | المستهدف |
|--------|--------|---------|
| Tenant data leak via WebSocket | 🔴 Yes | ✅ None |
| API endpoints without tenant filter | 🟠 Unknown | ✅ All filtered |
| Landing page fake stats | 🔴 4 fake numbers | ✅ Real from DB |
| Subscribe page payment methods | ⚠️ Basic | ✅ Full (libyana/madar/bank) |
| Notifications backend | 🔴 Fake useState | ✅ Real API |
| Support tickets | 🔴 Static FAQ | ✅ Real system |
| Onboarding flow | ❌ None | ✅ 5-step wizard |
| Test coverage | ~30% | > 80% |
| Git force-push protection | ❌ None | ✅ Branch protection |
