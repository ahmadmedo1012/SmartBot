مؤرشف — راجع SmartBot-Full-Remediation-Plan.md للحالة الحالية
# SmartBot Improvement Plan — خطة التحسين البصري

بناءً على المقارنة المباشرة بين `bot.smart-link.ly` و `menu.smart-link.ly`

---

## 1. الهيدر (Header) — فجوة كبيرة

| Smart Menu | SmartBot |
|---|---|
| شعار + روابط: الخطط، منيو تجريبي، تسجيل الدخول | شعار + أزرار بسيطة |
| Hamburger بأيقونة متحركة (3 خطوط → X) | لا يوجد |
| Focus trap + إدارة لوحة المفاتيح | لا يوجد |
| ThemeToggle مدمج | موجود بس بشكل أساسي |
| تأثيرات انتقال framer-motion | لا يوجد |

**المطلوب**: إعادة بناء `LandingHeader.jsx` بنفس مستوى Smart Menu — روابط، hamburger متحرك، responsive.

---

## 2. الفوتر (Footer) — فجوة متوسطة

| Smart Menu | SmartBot |
|---|---|
| 4 أعمدة: العلامة التجارية، روابط سريعة، خدمات، تواصل | عمود واحد بسيط |
| أيقونات سوشيال ميديا (فيسبوك، إنستغرام، يوتيوب، واتساب) | لا يوجد |
| روابط الخدمات (منيو إلكتروني، طلب عبر واتساب، ولاء...) | لا يوجد |
| سياسة الخصوصية وشروط الاستخدام | لا يوجد |
| حقوق النشر مع السنة الديناميكية | لا يوجد |

**المطلوب**: إعادة بناء `LandingFooter.jsx` بـ 4 أعمدة + أيقونات + روابط خدمات.

---

## 3. صفحة الأسعار (Pricing) — فجوة كبيرة

| Smart Menu (صفحة مستقلة `/pricing`) | SmartBot (قسم مدمج في Landing) |
|---|---|
| صفحة كاملة مع هيدرhero و gradient خلفية | قسم صغير في landing |
| 4 خطط تظهر ديناميكياً من API | 3 خطط hardcoded |
| أيقونات + تدرجات + توهج لكل خطة | لا أيقونات، تصميم بسيط |
| Badges ملونة مختلفة (شعبية، قيمة، شركات) | Badge واحدة فقط |
| Toggle شهري/سنوي مع خط تحت النشط | موجود بس بدون خط |
| Skeleton loading + error/empty states | لا يوجد |
| FAQ قابل للطي بتأثير grid-rows | FAQ بسيط |
| Glass CTA في نهاية الصفحة | CTA بسيط |
| كل بطاقة تتفاعل مع hover (translate-y, shine) | لا hover |
| شريط بيانات (المنيو/الأصناف/الطلبات) قبل الميزات | موجود بس بشكل أساسي |

**المطلوب**: إذا كان الهدف التطابق الكامل، يحتاج صفحة أسعار مستقلة أو ترقية pricing section بشكل كبير.

---

## 4. المكونات العامة (UI Components) — فجوة بنيوية

| Smart Menu | SmartBot |
|---|---|
| مكتبة كاملة من الـ UI (button, card, badge, dialog, switch, textarea, skeleton...) | كل مكون مكتوب يدوياً بدون نظام |
| نظام `cn()` لدمج الكلاسات | clsx/class-variance-authority مستورد بس غير مستخدم |
| ~44 مكون layout + shared + ui | ~11 مكون |
| Hero section احترافي مع تأثيرات | Hero أساسي |

---

## 5. التأثيرات البصرية — فجوة بسيطة

| Smart Menu | SmartBot |
|---|---|
| Glass effect متقدم | Glass أساسي |
| Radial gradient backgrounds | موجود |
| Shine overlay على hover | لا يوجد |
| Skeleton loading مع تموج | لا يوجد |
| Gradient text | لا يوجد |
| تدرجات ألوان برتقالية متعددة | أساسي |
| Sparkle/glow icons مع تدرج | لا يوجد |

---

## خطة التنفيذ (حسب الأولوية)

### المرحلة 1 — الهيدر والفوتر (ساعتان)
1. إعادة بناء `LandingHeader.jsx` — روابط + hamburger + responsive + ThemeToggle
2. إعادة بناء `LandingFooter.jsx` — 4 أعمدة + أيقونات + خدمات + روابط

### المرحلة 2 — تحسين Pricing (ساعة)
3. إضافة أيقونات لكل خطة مع تدرجات
4. Badges متعددة ملونة
5. Skeleton loading
6. Glass CTA section بعد الأسعار

### المرحلة 3 — UI Components (ساعتان)
7. إعادة استخدام مكتبة `class-variance-authority` لبناء button, card, badge
8. إضافة hover effects (translate-y, shine, glow)
9. نظام `glass` متقدم

### المرحلة 4 — التأثيرات (ساعة)
10. Skeleton loading في كل صفحة
11. Radial gradients + glow متعددة الطبقات
12. تأثيرات framer-motion للصفحة

---

هل توافق على هذه الأولويات؟ نبدأ بالمرحلة 1؟
