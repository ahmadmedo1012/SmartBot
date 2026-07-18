مؤرشف — راجع SmartBot-Full-Remediation-Plan.md للحالة الحالية
# SmartBot Execution Plan — خطة التنفيذ التفصيلية

بناءً على: `smartbot-master-plan-live-audit.md`

---

## مرحلة ما قبل التنفيذ — تحقق من الوضع الراهن

### ✅ التأكيدات المسبقة (تم التحقق منها):
- قيمة `--accent` في `:root` (داكن): **oklch(0.55 0.19 45)** ← صحيحة ✅
- قيمة `--accent` في `.light` (فاتح): **oklch(0.48 0.19 45)** ← صحيحة ✅
- `--primary: var(--accent)` و `--orange: var(--accent)` موجودة ✅
- لا توجد قيم قديمة خاطئة (`c84e00` / `oklch(0.68 0.19 45)`) في المصدر ❌ موجودة فقط في الملف المبني (`messages-DrJAUv_G.js`) — سيتم إصلاحها عند إعادة البناء

---

## القسم 1 — 🔴 كسر الموقع (أولوية قصوى)

**الملف**: `vercel.json`

**المشكلة**: Vercel لا يضمّن `fb_dashboard/static/**` في حزمة Python function لأن `runner.py` يقرأها في وقت التشغيل (عبر `StaticFiles.mount`)، وليس عبر import.

**الإصلاح**: إضافة `includeFiles` في `functions` config:

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/api/index.py" }
  ],
  "functions": {
    "api/index.py": {
      "maxDuration": 10,
      "includeFiles": "fb_dashboard/static/**"
    }
  },
  "buildCommand": null
}
```

**خطوات**:
1. تعديل `vercel.json`
2. تجربة curl على الموقع الحي للتحقق
3. في حال فشل: إضافة مسار static explicit في rewrites

**بوابة التحقق**:
```bash
curl -I https://bot.smart-link.ly/static/assets/index-D1d9pIot.js  # ← يجب أن يعيد 200
```

**الكوميت**: `fix: include static assets in Vercel Python function bundle`

---

## القسم 2 — 🟠 نظام الألوان (تطهير)

**الملفات**: `fb_dashboard/frontend/src/index.css`

**الوضع الراهن**: القيم صحيحة بالفعل. المتبقي:
- حذف كلاسات `.border-orange` و `.border-orange-soft` و `.border-orange-light` من CSS (غير مستخدمة في JSX)
- البحث عن أي `--border-orange` أو `--ring-orange` في باقي المشروع

**خطوات**:
1. حذف الأسطر 529-531 من `index.css`
2. grep للتأكد من عدم استخدامها في أي JSX
3. إعادة بناء (`npm run build`)

**بوابة التحقق**:
```bash
grep -rn "border-orange\|ring-orange" src/
```

**الكوميت**: `fix: remove unused border-orange CSS classes`

---

## القسم 3 — 🟡 صفحة الأسعار (تطوير)

**الملف**: `fb_dashboard/frontend/src/pages/landing.jsx`

**التغييرات**:
1. إعادة هيكلة `PricingSection` لتشمل:
   - Toggle شهري/سنوي
   - 3-5 خطط مع بيانات كمية قبل الميزات
   - Badges مميزة لكل خطة (مو بس "الأكثر طلباً")
   - صف بيانات (الصفحات / الردود / التقارير)
2. الحفاظ على أسعار SmartBot الحالية (مجاني/49/129 د.ل)

**بوابة التحقق**: screenshot للمقطع الجديد

**الكوميت**: `feat: upgrade pricing section with plans toggle, data rows, and badges`

---

## القسم 4 — 🟡 عملاء وهميون (تعديل بيانات)

**الملف**: `fb_dashboard/frontend/src/pages/landing.jsx` (سطر 43)

**التغيير**:
- استبدال `clients` بأسماء مناسبة لسياق SmartBot (تسويق إلكتروني، متاجر أونلاين، صفحات فيسبوك)
- الحفاظ على عدد متساوٍ من الأسماء
- لا تستخدم أي اسم من Smart Menu

**مثال بديل** (يجب أن يكون مستقلاً تماماً):
```js
const clients = ["متجر نور الإلكتروني", "أكاديمية التعليم الذكي", "وكالة تسويق 360", ...]
```

**بوابة التحقق**:
```bash
grep -f <(echo -e "مقهى الواحة\nمطعم الأصيل\nبيتزا روما\nSOHO") fb_dashboard/frontend/src/ --include="*.jsx" -r
```

**الكوميت**: `fix: replace cloned Smart Menu clients with original ones`

---

## القسم 5 — 🟡 واجهة تليجرام (تطوير جديد)

**الملفات الجديدة**: `fb_dashboard/frontend/src/pages/telegram.jsx`

**المتطلبات**:
1. صفحة إعدادات تليجرام بنفس نمط SmartBot
2. حالة الاتصال (متصل/غير متصل)
3. حقل Bot Token
4. معرف القروب/الأدمن
5. زر اختبار الاتصال
6. سجل آخر الإشعارات

**ال endpoints المطلوبة في الباك-إند**:
- `GET /api/telegram/settings` — قراءة الإعدادات الحالية
- `PUT /api/telegram/settings` — تحديث الإعدادات
- `POST /api/telegram/test` — اختبار الاتصال
- `GET /api/telegram/logs` — آخر الإشعارات

**رابط الصفحة**: تضاف إلى `pageNames` في `App.jsx` وتفتح من `settings.jsx`

**الكوميت**: `feat: add Telegram config page UI`

---

## ترتيب التنفيذ

```
1. القسم 1 (includeFiles) ← إصلاح دقيقتين
2. القسم 2 (تطهير ألوان) ← 5 دقائق
3. القسم 4 (عملاء وهميون) ← دقيقة
4. إعادة بناء + دفع لـ main ← اختبار الموقع الحي
5. القسم 3 (تطوير الأسعار) ← 30-45 دقيقة
6. القسم 5 (تليجرام) ← 45-60 دقيقة
```

بعد كل قسم: `npm run build` ينجح + بوابة التحقق + كوميت منفصل. ادفع بعد القسم 4 وقبل القسم 3.
