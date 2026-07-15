# SmartBot — Next Phase Plan

## الوضع الحالي

مشروع مستقر مع دومينين منفصلين:
- **bot.smart-link.ly** → Next.js 16 (7 routes + middleware)
- **api.bot.smart-link.ly** → Python FastAPI (212 endpoints, bot engine)

## المتبقي — 6 محاور

### 1. SEO Per‑Page (ضروري)

| المشكلة | الحل |
|---------|------|
| كل الصفحات تشترك بنفس العنوان والوصف | `generateMetadata()` لكل route |
| canonical يشير للجذر | `<link rel="canonical" href="...">` لكل صفحة |
| OG image 1×1 بكسل | OG image 1200×630 مع اسم الصفحة |
| H1 مفقود في /pricing | إضافة `<h1>خطط الأسعار</h1>` |

### 2. Fonts & Performance

| المشكلة | الحل |
|---------|------|
| fonts.css render-blocking مع `max-age=0` | تعيين cache-control: immutable في FastAPI |
| 3 preloads للخطوط غير مستخدمة | تم الإزالة |
| JS 784KB مع 18 chunk | `next/bundle-analyzer` + تقييم code‑splitting |

### 3. Accessibility

| المشكلة | الحل |
|---------|------|
| Demo sidebar بدون keyboard navigation | `<button>` + `onKeyDown` + `aria-current` |
| Footer service items بدون href | تحويل لـ `<a>` أو إضافة `role="button"` |
| FAQ بدون `aria-expanded` | إضافة attribute + `aria-controls` |
| Demo table `<th>` بدون `scope="col"` | إضافة `scope="col"` |

### 4. Code Cleanup

| الملف | المشكلة |
|-------|---------|
| `csrf-client.ts` | غير مستخدم — حذف |
| `page.tsx` (landing) | `'use client'` يمنع SSR — تقسيم لـ server + client islands |
| `middleware.ts` | التحقق من JWT format بدلاً من مجرد وجود cookie |
| `button.tsx` | `var(--orange)` ← `var(--color-orange)` للتوافق مع Tailwind v4 |

### 5. Subscription Flow — Production Polish

| الخلل | الوضع |
|------|-------|
| WebSocket /ws لا يشتغل على Vercel | مقبول — SSE موجود كبديل |
| Telegram admin approval callbacks | شغال — لكن يحتاج تأكيد webhook مسجل |
| Bot engine cold start (10s+) | مقبول — cron-job.org يغطي |
| انتهاء صلاحية JWT بدون refresh | إضافة refresh token endpoint |

### 6. Placeholder Content

| المكان | المشكلة |
|--------|---------|
| Footer "قريباً" × 3 | روابط社交媒体 "قريباً" تحتاج روابط حقيقية أو إزالة |
| شرط الاستخدام / سياسة الخصوصية | صفحات 404 حالياً — إنشاء صفحات أساسية |

---

## الأولويات المقترحة

```
Priority 1: SEO per-page (generateMetadata, canonical, OG image)
Priority 2: Fonts caching (immutable)
Priority 3: Accessibility (sidebar, FAQ, tables)
Priority 4: Code cleanup (csrf-client, middleware JWT check, landing SSR)
Priority 5: Placeholder content (footer links, Terms/Privacy)
Priority 6: Subscription polish (refresh token, webhook confirm)
```

## Council Questions

1. Should the landing page be split into server/client components for SEO, or keep as-is since Next.js metadata API handles per-page titles?
2. Dead code like `csrf-client.ts` — delete or kept for future use?
3. Are the Arabic static fonts (served via FastAPI at /static/fonts/) an acceptable pattern, or should we self-host them in the Next.js `public/` directory for Vercel edge caching?
