مؤرشف — راجع SmartBot-Full-Remediation-Plan.md للحالة الحالية
# SmartBot Transformation Plan — Multi-Phase Execution

## المشروع: تحويل SmartBot ليكون منصة SaaS متطابقة مع Smart-Menu

---

## 🏗️ Phase 0 — Database Schema Migration

### New Tables (matching Smart-Menu logic)

**subscription_plans** — 5 باقات (DB-driven, not hardcoded)
```sql
CREATE TABLE subscription_plans (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,    -- "Free", "Basic", "Premium", "Pro", "Enterprise"
  name_ar VARCHAR(100) NOT NULL,       -- "مجاني", "أساسي", ...
  price DECIMAL(10,2) DEFAULT 0,
  period_days INT DEFAULT 30,
  max_replies INT DEFAULT 100,         -- monthly auto-reply limit
  max_pages INT DEFAULT 1,             -- Facebook pages count
  max_rules INT DEFAULT 5,             -- auto-reply rules
  max_team INT DEFAULT 0,              -- team members (0 = none)
  has_dm BOOLEAN DEFAULT FALSE,        -- private reply to comments
  has_ai BOOLEAN DEFAULT FALSE,        -- AI-powered replies
  has_broadcast BOOLEAN DEFAULT FALSE, -- mass messaging
  has_scheduling BOOLEAN DEFAULT FALSE, -- post scheduling
  has_reports BOOLEAN DEFAULT FALSE,   -- PDF reports
  has_flows BOOLEAN DEFAULT FALSE,     -- visual flows
  has_offers BOOLEAN DEFAULT FALSE,    -- offer engine
  has_sequences BOOLEAN DEFAULT FALSE, -- drip campaigns
  has_analytics_advanced BOOLEAN DEFAULT FALSE,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  features JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**subscription_payments** — like Smart-Menu SubscriptionPayment
```sql
CREATE TABLE subscription_payments (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  tenant_id INT REFERENCES tenants(id),
  phone VARCHAR(50) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  provider VARCHAR(20) DEFAULT 'libyana',
  plan_id INT REFERENCES subscription_plans(id),
  plan_name VARCHAR(100) DEFAULT '',
  status VARCHAR(20) DEFAULT 'pending', -- pending, verified, cancelled
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Update tenants table** — add subscription fields
```sql
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_id INT REFERENCES subscription_plans(id);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_start TIMESTAMP;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_end TIMESTAMP;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(20) DEFAULT 'UNPAID';
```

**Update users table** — match Smart-Menu
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(200) DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(20) DEFAULT 'UNPAID';
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_id INT REFERENCES subscription_plans(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(100);
```

**Update payment_requests** — migrate to new system
(or just replace with subscription_payments)

**system_config** — for admin-configurable payment details (like Smart-Menu SystemConfig)
```sql
CREATE TABLE system_config (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  value TEXT NOT NULL,
  category VARCHAR(50) DEFAULT 'general',
  is_secret BOOLEAN DEFAULT FALSE,
  description TEXT DEFAULT '',
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Seed Data — 5 Subscription Plans

| # | Name | NameAr | Price | Max Replies | Max Pages | Max Rules | DM | AI | Broadcast | Scheduling | Reports | Flows | Sequences | Offers | Advanced Analytics | Team |
|---|------|--------|-------|-------------|-----------|-----------|----|----|-----------|------------|---------|-------|-----------|--------|-------------------|------|
| 1 | Free | مجاني | 0 | 100 | 1 | 5 | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | 0 |
| 2 | Basic | أساسي | 19 | 2,000 | 1 | 20 | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | 1 |
| 3 | Premium | مميز | 29 | 10,000 | 2 | 50 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | 2 |
| 4 | Pro | احترافي | 129 | 50,000 | 5 | 100 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 5 |
| 5 | Enterprise | مؤسسي | 299 | ∞ | ∞ | ∞ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ∞ |

---

## 🏗️ Phase 1 — Landing Page Redesign

### What Changes
Rewrite `fb_dashboard/frontend/src/pages/landing.jsx` to match Smart-Menu's landing page structure:

1. **Header** — شعار SmartBot + روابط: الرئيسية، الميزات، الخطط، الأسعار، تواصل معنا ← زر "ابدأ الآن"
2. **Hero Section** — مثل Smart-Menu لكن مخصصة للبوت (إدارة صفحات فيسبوك بالذكاء الاصطناعي)
3. **Stats Section** — إحصائيات متحركة (صفحة نشطة، رد تلقائي، نسبة رضا، دعم فني)
4. **Features Section** — 6-8 مميزات الرئيسية
5. **How It Works** — 3 خطوات لربط البوت
6. **Demo Section** — زر "جرب البوت الآن" → لوحة تحكم تجريبية ببيانات وهمية
7. **Pricing Section** — 5 باقات مستوحاة من تصميم Smart-Menu (بطاقات، toggle شهري/سنوي، شارة "الأكثر شعبية")
8. **Testimonials** — آراء العملاء
9. **FAQ** — أسئلة شائعة عن البوت والاشتراك
10. **CTA** — قسم الحث على الاشتراك
11. **Footer** — روابط الخدمة وسياسة الخصوصية والشروط

### Files
- `fb_dashboard/frontend/src/pages/landing.jsx` — Full rewrite
- `fb_dashboard/frontend/src/pages/pricing.jsx` — New standalone pricing page (optional, can be section in landing)
- `fb_dashboard/frontend/src/pages/demo.jsx` — New demo dashboard page

---

## 🏗️ Phase 2 — Demo Dashboard (بيانات وهمية)

### What
صفحة `/demo` تعرض لوحة تحكم SmartBot كاملة ببيانات وهمية (بدون تسجيل دخول، بدون اتصال بفيسبوك)

### Key Elements
- إحصائيات وهمية (ردود، متابعين، تفاعل، قواعد)
- رسم بياني للنشاط اليومي (بيانات مولّدة عشوائياً)
- جدول آخر الردود
- قائمة القواعد
- شريط جانبي كامل (كما في الواجهة الحقيقية)
- زر "جرب البوت الآن" → يوجه لصفحة الاشتراك
- زر "أنشئ حسابك مجاناً"

### Files
- `fb_dashboard/frontend/src/pages/demo.jsx` — New
- `fb_dashboard/frontend/src/App.jsx` — Add `/demo` route
- Mock data generator utility

---

## 🏗️ Phase 3 — Registration & Subscription System

### What
نظام اشتراك كامل مثل Smart-Menu:

**3a. Pricing Page API**
- `GET /api/plans` → list active plans from `subscription_plans` table
- مصدر واحد للبيانات (DB-driven) لا hardcoded

**3b. Subscribe Page**
- صفحة `/subscribe` كاملة:
  1. اختيار الباقة (مع read-only نموذج)
  2. نموذج التسجيل: الاسم، اسم المستخدم، كلمة المرور، رقم الهاتف، الإيميل
  3. إذا الباقة مدفوعة → نافذة الدفع
  4. إذا الباقة مجانية → إنشاء مباشر

**3c. Payment Flow**
- `POST /api/subscriptions` → إنشاء طلب دفع + إرسال تليجرام للمشرفين
- `POST /api/subscriptions/validate` → التحقق من اسم المستخدم
- `GET /api/subscriptions/status?id=X` → استعلام حالة الدفع
- `POST /api/subscriptions/upgrade` → ترقية الباقة
- Rate limit 5/min لكل IP

**3d. Payment Dialog**
- نافذة دفع (React component) مثل PaymentDialog في Smart-Menu
- اختيار مزود الدفع (ليبيانا / مدار)
- عرض رقم المحفظة + كود USSD
- عداد 30 ثانية مع SSE للحصول على الموافقة/الرفض
- حالة نجاح → redirect إلى `/onboarding`
- حالة رفض → رسالة خطأ

**3e. Subscription Enforcement (تقدير الباقة)**
- Middleware/helper يتحقق من `subscription_status` وعدد الردود المستخدم
- عند تجاوز حد الباقة: تعطيل البوت + إشعار للعميل
- كل طلب API للبوت يتحقق من الحدود

### Files
- `fb_dashboard/runner.py` — New endpoints
- `fb_dashboard/models.py` — New SQLAlchemy models
- `fb_dashboard/subscription_engine.py` — New engine
- `fb_dashboard/frontend/src/pages/subscribe.jsx` — New
- `fb_dashboard/frontend/src/pages/pricing.jsx` — New
- `fb_dashboard/frontend/src/components/PaymentDialog.jsx` — New
- `fb_dashboard/frontend/src/lib/api.js` — New API calls

---

## 🏗️ Phase 4 — Telegram Admin Approval

### What
تكامل تليجرام كامل (مطابق لـ Smart-Menu):

**4a. Telegram Admin Bot**
- `POST /api/telegram/webhook` — استقبال webhook من تليجرام
- أزرار: 🟢 موافقة على التفعيل / 🔴 رفض الطلب
- `sub_app:{paymentId}` → موافقة
- `sub_rej:{paymentId}` → رفض

**4b. Subscription Decisions Engine**
- `resolve_subscription_payment(payment_id, decision)`
  - `verified`: تحديث subscription_status → PAID, إرسال إشعار للعميل عبر SSE
  - `cancelled`: تحديث subscription_status → REJECTED, إرسال إشعار رفض

**4c. Admin Panel (Super Admin)**
- صفحة `/admin/subscriptions` — قائمة بكل طلبات الدفع
- فلترة حسب: pending / verified / cancelled / all
- Pagination (20/page)
- زر موافقة/رفض مع Confirmation Dialog

### Files
- `fb_dashboard/telegram_bot.py` — Rewrite with webhook + callback handling
- `fb_dashboard/subscription_decisions.py` — New
- `fb_dashboard/frontend/src/pages/admin/subscriptions.jsx` — New
- `fb_dashboard/frontend/src/components/admin/` — Admin layout

---

## 🏗️ Phase 5 — Onboarding Wizard

### What
بعد دفع الاشتراك، معالج إعداد تدريجي مكون من 4-5 خطوات أنيقة:

**Step 1: 🎉 مرحباً بك**
- "البوت جاهز، دعنا نربط صفحتك على فيسبوك"
- شرح سريع لماذا يحتاج Page ID + Token

**Step 2: 🔑 ربط فيسبوك**
- إدخال `Page ID`
- إدخال `Page Access Token`
- زر "اختبار الاتصال" → `GET /api/test-connection`
- إذا نجح → أخضر ✓ "تم الاتصال بالصفحة: [اسم الصفحة]"
- إذا فشل → أحمر ✗ "فشل الاتصال، تحقق من البيانات"

**Step 3: 📋 دليل استخراج البيانات**
- دليل تفاعلي خطوة بخطوة:
  1. اذهب إلى developers.facebook.com
  2. أنشئ تطبيق
  3. اذهب إلى Graph API Explorer
  4. اختر صفحتك
  5. انسخ Page ID
  6. أنشئ Token طويل الأمد
  7. الصقه هنا
- صور توضيحية أو روابط للشرح

**Step 4: ⚙️ الإعدادات الأولية**
- اختر اسم البوت (اختياري)
- تفعيل/تعطيل الردود التلقائية
- تفعيل/تعطيل الـ DM على التعليقات
- إضافة أول قاعدة رد: "مرحباً بك في [اسم الصفحة]"

**Step 5: ✅ البوت جاهز!**
- "تم بنجاح! البوت الآن نشط على صفحتك"
- رابط لصفحة فيسبوك
- زر "اذهب إلى لوحة التحكم"

### Files
- `fb_dashboard/frontend/src/pages/onboarding.jsx` — New
- `fb_dashboard/frontend/src/components/onboarding/` — New components
- `fb_dashboard/runner.py` — `/api/test-connection` endpoint
- `fb_dashboard/frontend/src/lib/api.js` — New API calls

---

## 🏗️ Phase 6 — Admin Panel (Super Admin)

### What
لوحة تحكم خاصة بالمشرفين على المنصة:

- `/admin/subscriptions` — إدارة طلبات الاشتراك
- `/admin/restaurants` — إدارة العملاء (tenants)
- `/admin/stats` — إحصائيات المنصة (عدد المستخدمين، الإيرادات...)
- `/admin/telegram` — إعدادات تليجرام
- `/admin/settings` — إعدادات المنصة (SystemConfig)

### Files
- `fb_dashboard/frontend/src/pages/admin/layout.jsx` — Admin layout
- `fb_dashboard/frontend/src/pages/admin/dashboard.jsx` — Admin dashboard
- `fb_dashboard/frontend/src/pages/admin/subscriptions.jsx` — Pending
- `fb_dashboard/frontend/src/pages/admin/tenants.jsx` — Clients
- `fb_dashboard/frontend/src/pages/admin/settings.jsx` — Config

---

## 🏗️ Phase 7 — Plan Enforcement & Usage Tracking

### What
تصعيد تنفيذ حدود الباقات على مستوى API + Bot Engine:

**7a. Usage Tracking**
- `usage_counters` table: tenant_id + metric + period_start + current_value
- Metrics: `replies_used`, `dms_used`, `broadcasts_used`, `rules_count`
- تحديث في كل عملية بوت
- إعادة تعيين شهري تلقائي

**7b. Plan Enforcement Middleware**
- في كل طلب API، تحقق من حدود الباقة
- `GET /api/usage` → استعلام الاستخدام الحالي
- تعطيل البوت تلقائياً عند تجاوز الحد
- إشعار للعميل

**7c. Upgrade/Downgrade Flow**
- ترقية: تغيير plan_id + تحديث plan_start
- تخفيض: عند انتهاء الفترة، تغيير الحدود
- إلغاء الاشتراك: تعطيل البوت، تخزين البيانات

### Files
- `fb_dashboard/models.py` — `UsageCounter` model
- `fb_dashboard/bot.py` — Enforcement in pipeline
- `fb_dashboard/runner.py` — `/api/usage`, middleware
- `fb_dashboard/frontend/src/pages/usage.jsx` — Usage display

---

## 🏗️ Phase 8 — Design & UX Alignment

### What
محاذاة SmartBot مع Smart-Menu في التصميم:

- التأكد من نفس نظام الألوان (OKLCH orange)
- نفس الخطوط (Cairo + Noto Naskh + Readex Pro)
- نفس أنماط CSS (`glass`, `card-premium`, `mesh-bg`, `stagger-children`)
- نفس Icon library (lucide-react + framer-motion)
- إضافة نظام الثيم (dark/light) مطابق
- مراجعة index.css وتوحيد التصميم

### Files
- `fb_dashboard/frontend/src/index.css` — Review & align

---

## 🏗️ Phase 9 — Testing & Deployment

### What
- اختبار شامل لكل تدفق الاشتراك
- نشر على Vercel مع المتغيرات البيئية الجديدة
- اختبار Webhook تليجرام
- اختبار SSE للاشتراكات
- تأكد من عمل bot engine مع النظام الجديد

### Deployment
```bash
vercel env add DATABASE_URL
vercel env add TELEGRAM_BOT_TOKEN
vercel env add TELEGRAM_ADMIN_IDS
vercel env add JWT_SECRET
# ... etc
vercel --prod
```

---

## Execution Order

```
Phase 0: Schema & Models → تحضير قواعد البيانات
Phase 3a: Plans API → نقطة نهاية الباقات
Phase 8: Design Alignment → توحيد التصميم أولاً
Phase 1: Landing Page → إعادة بناء الصفحة الرئيسية
Phase 2: Demo Dashboard → صفحة تجريبية
Phase 3b-e: Subscribe Flow → التسجيل والدفع
Phase 4: Telegram Approval → موافقة المشرفين
Phase 5: Onboarding Wizard → معالج الإعداد
Phase 6: Admin Panel → لوحة المشرفين
Phase 7: Enforcement → تطبيق حدود الباقات
Phase 9: Testing & Deploy → اختبار ونشر
```

---

## Risk Points & Decisions

1. **Existing data migration**: Clean slate recommended (all existing data is test data)
2. **JWT → Session**: Smart-Menu uses Session model. Keep JWT for SmartBot (less disruptive) but add session table for subscription auth flows
3. **Vercel function timeout**: Max 10s currently. Bot cycle via cron-job.org still works. Payment/SSE may need longer timeout → increase to 30s or use Neon's branch for heavy queries
4. **Telegram webhook**: Needs public HTTPS URL. Vercel provides this. Register once during deployment
5. **SSE requirement**: SSE needs persistent connection. On Vercel free tier, limited to 10s execution. May need to use polling as fallback

---

## Council Questions

1. Schema approach: Extend SQLAlchemy with new tables vs full migration to new schema?
2. Payment flow: Keep existing top-up balance approach alongside new subscription system, or replace entirely?
3. SSE vs polling for payment status (Vercel 10s limit)?
4. How to handle the bot engine enforcement without breaking existing free test users?
