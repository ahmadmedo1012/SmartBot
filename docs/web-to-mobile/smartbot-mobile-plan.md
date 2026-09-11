# SmartBot → Mobile Migration Plan (Expo + React Native)

> **Plan Status: Planning complete — implementation in progress (user granted full delegation: "لديك تفويض كامل لتنفيذ المهمة — لا تسأل هل أبدأ")**
>
> التاريخ: 2026-09-10 (Libya) · المصدر: audit فعلي للكود (clone حقيقي) + تشغيل web-repo-audit.mjs من web-to-mobile-magic-plugin
> الأداة المستخدمة: web-to-mobile-magic-plugin (سير عمل: Audit → Plan → Build → Parity → QA/Release)
> هذا الملف هو الذاكرة الرسمية للمشروع (External Memory). يُقرأ في بداية كل مرحلة ويُحدَّث بعد كل مرحلة.

---

## 0. Capabilities & Limits

- الوصول الكامل للكود (repo clone) → تصنيف الأداة: `web-frontend` (Next.js 16 App Router + React 19).
- الـ API الإنتاجي حي ومُتحقق منه فعليًا: `https://api.smart-link.ly/api/health` → `{"ok":true,"version":"2.2.0","env":"production"}` و `/api/health/ready` → `database: ok, latency 68ms` [from-code, live-probed]
- 401 بدون مصادقة على `/api/me` — مُتحقق فعليًا [live-probed]
- POST من عميل غير متصفح (بلا Origin) يعمل على `/api/login` — مُتحقق فعليًا [live-probed]
- بدون محاكي/جهاز Android/iOS في هذه البيئة، وبدون Android SDK — البناء السحابي عبر EAS هو المسار (يتطلب توكن Expo صالحًا). Java 21 متوفر.

---

## 1. Current Architecture [from-code]

| الطبقة | التقنية | ملاحظات |
|---|---|---|
| Backend | FastAPI (Python 3.12) | `api/index.py` (Vercel entry) → `fb_dashboard/runner.py` (composition root) → 38 router |
| DB | Neon PostgreSQL (إنتاج) / SQLite (تطوير) | SQLAlchemy 2 async + Alembic (حتى ترحيل 015) |
| Frontend | Next.js 16 App Router + React 19 + Tailwind 4 | RTL عربية، envelope `{success,data,error?}` |
| State | @tanstack/react-query v5 | نفس النمط سيعاد استخدامه في الموبايل |
| Auth | JWT HS256 في كوكي HttpOnly `token` (24 ساعة) | claims: `sub,tid,jti,ver,iat,nbf,exp` + BlacklistedToken + token_ver |
| CSRF | double-submit `X-CSRF-Token` + كوكي `csrf_token` | **يُتخطى كليًا عند وجود Authorization header** |
| Deployment | مشروعا Vercel: smart-bot-api (api.smart-link.ly) + smart-bot-frontend (bot.smart-link.ly) | نفس الريبو |
| مراقبة | Sentry/GlitchTip (DSN عام by-design) + تنبيهات Telegram | — |

### Auth details [from-code]
- `get_current_user` (routers/auth.py): يقرأ `request.cookies.get("token")` فقط — **لا يدعم Bearer بعد** → تغيير مطلوب (انظر §6).
- `csrf_origin_check`: فحص Origin/Referer يطبق فقط إذا أُرسل الـ header (RN fetch لا يرسلهما)؛ double-submit يُتخطى مع `Authorization`.
- login: بحث username ثم email (lower) + rate limit 10/دقيقة/IP؛ يرد بـ user snapshot + set_cookie.
- الأدوار: admin(3)/editor(2)/viewer(1) + `is_platform_admin` (tenant 0 أو مفوّض) — منصة متعددة المستأجرين.

## 2. Mobile Architecture (target)

```
SmartBot/mobile/                     ← Expo (SDK 54) + expo-router v6 + TypeScript
├── app/                             ← file-based routes (نفس نمط App Router المعروف للفريق)
│   ├── (auth)/login.tsx, register.tsx
│   ├── (tabs)/index, messages, comments, analytics, more
│   ├── dashboard detail screens (stack): subscribers, broadcasts, scheduled, settings, team, billing...
├── components/                      ← UI primitives (Card, Button, StateViews, RTL-aware)
├── features/                        ← لكل نطاق: hooks + مكونات متخصصة
├── services/api.ts                  ← عميل موحد (envelope unwrap، timeout، 401 handling)
├── state/auth.ts                    ← token + user (expo-secure-store)
├── lib/ · hooks/ · types/ · constants/ · assets/
├── eas.json · app.json · .env.example (EXPO_PUBLIC_API_URL)
```

- **التنقل**: 5 تابات سفلي (الرئيسية/الرسائل/التعليقات/التحليلات/المزيد) + Stack للتفاصيل + Auth flow guard.
- **الشبكة**: عميل واحد `apiFetch` بنفس عقد الويب (envelope + ApiError) + Bearer.
- **الحالة**: TanStack Query v5 (نفس نسخة الويب — إعادة استخدام أنماط حقيقية).
- **RTL**: عربي أولًا؛ `I18nManager` + flexbox منطقي + خطوط Cairo/Readex Pro (@expo-google-fonts).
- **التخزين**: expo-secure-store للتوكن (لا localStorage)، AsyncStorage للتفضيلات الخفيفة.
- **الثيم**: dark افتراضي (مطابق للويب) + دعم light — نفس ألوان oklch محولة إلى قيم RGB hex.

## 3. Screen Inventory [from-code — src/app]

| Route | الوظيفة | API (من PAGE_API_MAP الرسمية في tests) |
|---|---|---|
| `/login` `/register` | الدخول/التسجيل | /api/login, /api/register |
| `/onboarding` | معالج ربط صفحة فيسبوك | /api/onboarding/*, /api/facebook/settings |
| `/dashboard` | لوحة KPI + رسوم | /api/dashboard/bundle (60s cache) |
| `/dashboard/messages` | صندوق المحادثات + ردود | /api/inbox/conversations, /api/messages/{id}, POST reply |
| `/dashboard/comments` | التعليقات + رد/إخفاء | /api/comments?limit=30, POST /api/replies/{id}/reply, hide |
| `/dashboard/posts` `/scheduled` | المنشورات/المجدول | /api/scheduled-posts, POST publish |
| `/dashboard/analytics` | تحليلات ورسوم | /api/analytics/overview?days=30 |
| `/dashboard/audience` | المشتركون + أفضل المعلقين | /api/analytics/overview, /api/analytics/top-commenters, /api/subscribers |
| `/dashboard/leads` | عملاء CRM | /api/crm/customers |
| `/dashboard/ads` | حسابات/حملات الإعلانات | /api/ads/accounts, /api/ads/campaigns/{id}, /api/ads/ads/{id} |
| `/dashboard/broadcast` | البث الجماعي | /api/broadcasts, estimate, send, cancel |
| `/dashboard/sequences` | الحملات التسلسلية | /api/sequences CRUD + steps |
| `/dashboard/marketing` | حملات تسويقية | /api/marketing/campaigns, audience-size |
| `/dashboard/reports` | تقارير PDF | /api/analytics/dashboard, /api/reports/generate |
| `/dashboard/pages` | إعداد صفحة FB | /api/facebook/settings (PUT), /api/facebook/test |
| `/dashboard/team` | الفريق والأداء | /api/team/members, activity, performance |
| `/dashboard/calendar` | تقويم المحتوى | /api/calendar CRUD |
| `/dashboard/autoreply` | قواعد الرد التلقائي | /api/rules CRUD + toggle |
| `/dashboard/activity` | سجل النشاطات | /api/logs?limit=100 |
| `/dashboard/notifications` | الإشعارات | /api/notifications/* |
| `/dashboard/billing` | المحفظة/الفواتير | /api/payments/balance, history, topup, confirm |
| `/dashboard/support` | الدعم | /api/support/info, tickets |
| `/dashboard/settings` | الإعدادات + كلمة المرور | /api/me, /api/auth/change-password |
| `/dashboard/tools` | العروض/القوالب | /api/offers, /api/templates |
| `/pricing` `/subscribe` | الخطط والاشتراك | /api/plans (عام), /api/subscriptions/* |
| `/admin/*` | مسؤول المنصة | /api/admin/* (platform-admin فقط) |
| `/demo` `/privacy` `/terms` `/connect` | صفحات عامة | /api/public/* |

## 4. Route → Mobile Screen Mapping

| Web Route | Mobile Destination | النمط |
|---|---|---|
| `/login` `/register` | `(auth)/login` `(auth)/register` | Auth stack قبل التابات |
| `/dashboard` | `(tabs)/index` — DashboardScreen | Tab 1: KPI cards + sparkline + روابط سريعة |
| `/dashboard/messages` | `(tabs)/messages` + `messages/[id]` | Tab 2: قائمة محادثات (FlatList) → شاشة محادثة (inverted list) |
| `/dashboard/comments` | `(tabs)/comments` | Tab 3: قائمة تعليقات + رد سريع (sheet) |
| `/dashboard/analytics` | `(tabs)/analytics` | Tab 4: بطاقات إحصاء + رسم شرائح (native، لا recharts) |
| بقية `/dashboard/*` | `(tabs)/more` → شاشات stack | Tab 5: قائمة أقسام (operations/growth/management/account) |
| `/dashboard/subscribers` (audience) | `audience/index` + `[id]` | Stack |
| `/dashboard/broadcast` | `broadcast/index` + `new` + `[id]` | Stack |
| `/dashboard/autoreply` | `autoreply/index` + محرر sheet | Stack |
| `/dashboard/scheduled` `/posts` | `scheduled/index` + `[id]` | Stack |
| `/dashboard/billing` | `billing/index` + `topup` sheet + `subscribe/[plan]` | Stack |
| `/dashboard/team` `settings` `support` `activity` `notifications` `tools` `pages` `leads` `ads` `sequences` `marketing` `reports` `calendar` | شاشة لكل منها | Stack |
| `/onboarding` | `(app)/onboarding` (خطوات 3) | Stack محمي |
| `/pricing` | `pricing` (عام) | Stack |
| `/admin/*` | **مؤجل للمرحلة 2** (منصة-إدارية، استخدام نادر على الهاتف) | Deferred |

**قرارات UX**: الجداول الكبيرة → بطاقات/قوائم؛ الـ modals → bottom sheets؛ sidebar → تابات؛ hover → touch states. الهوية (برتقالي oklch(0.55 0.19 45) + Cairo/Readex + dark) تُنقل كما هي.

## 5. API Mapping (لكل شاشة)

كل الشاشات أعلاه معتمدة على API موجودة أصلًا — **لا حاجة لأي endpoint جديد للأعمال**. الوحيد المطلوب (انظر §6): `/api/auth/token` للهبوط الأول للموبايل + Bearer في `get_current_user`.

## 6. Authentication (Mobile)

- **Mobile login**: `POST /api/auth/token` (جديد، additive) → `{token, user}` بلا كوكيز (المتصفح لا يستخدمه).
- **كل الطلبات**: `Authorization: Bearer <jwt>` → يتخطى CSRF layer بتصميمها الأصلي (v12-E3.3).
- `get_current_user`: يقرأ Bearer أولًا ثم الكوكي (سلوك الويب لا يتغير — الكوكي ما زال fallback).
- **التخزين**: expo-secure-store (Keychain/Keystore) — لا AsyncStorage للتوكن.
- **401 مركزي**: نفس عقد الويب — logout + redirect إلى login (بدون toast loop).
- **Logout**: حذف التوكن محليًا + `POST /api/logout` مع Bearer (سيُعدَّل ليقرأ Bearer أيضًا — سطر واحد).
- **انتهاء الجلسة**: JWT 24h → شاشة login مع رسالة عربية.

## 7. State Management

TanStack Query v5 (نفس مكتبة الويب): queryKeys بنمط `[resource, params]`، refetchOnWindowFocus=false (لا نافذة)، placeholderData للحفاظ على بيانات قديمة أثناء الترقية، enabled حسب auth state. Auth state: React Context + SecureStore + Zustand خفيف (auth فقط).

## 8. Storage

| النوع | الأداة | السبب |
|---|---|---|
| JWT | expo-secure-store | Keychain/Keystore — المشروع يمنع secrets غير آمنة |
| تفضيلات (ثيم/لغة) | AsyncStorage | غير حساس |
| Cache | TanStack Query in-memory | يكفي؛ لا حاجة لـ MMKV في v1 |

## 9. Native Replacements

| Browser API (الويب) | البديل Native |
|---|---|
| الكوكيز (fetch credentials) | Bearer header + SecureStore |
| localStorage | SecureStore/AsyncStorage |
| recharts (SVG charts) | react-native-gifted-charts أو رسم Skia بسيط (بطاقات KPI أولاً) |
| next/navigation (router.push) | expo-router (useRouter) |
| sonner (toasts) | نظام toast RN خفيف مخصص |
| CSS/Tailwind | StyleSheet + tokens ثابتة (نفس القيم) |
| window.matchMedia (theme) | useColorScheme |
| SSE `/api/subscriptions/status-stream` | مؤجل v1 — polling بنفس cadence الويب |
| WebSocket `/ws` | مؤجل v1 |

## 10. Reusable Logic (من الويب)

- عقد الـ envelope وApiError (من `src/lib/api.ts` / `csrf-client.ts`) → يُعاد تنفيذه RN بنفس الدلالات.
- أنواع TypeScript للـ API (user snapshot, plan limits…) → تُنقل حرفيًا حيث توفرت.
- مفاهيم queryKeys والـ polling intervals من صفحات الويب.
- النصوص العربية (labels/messages) تُنقل كما هي — الهوية اللغوية عربية.

## 11. Rewrite Required

كل عناصر DOM/CSS/Next-specific: التخطيطات، الجداول، الرسوم، navigation، toasts، النماذج (HTML form → RN state)، الكوكيز.

## 12. Risks

1. **EAS Auth**: لا توكن Expo مؤكد — قد يتوقف البناء السحابي عند صلاحية خارجية (خطة بديلة: prebuild + تعليمات).
2. **Vercel deploy**: يتطلب توكن Vercel صالحًا — سيُجرَّب التوكنات المزودة.
3. جودة RTL في RN: تحتاج ضبطًا دقيقًا (I18nManager يتطلب rebuild للتغيير لكن العربي ثابت منذ البداية فلا مشكلة).
4. الخطوط: Cairo/Readex Pro عبر @expo-google-fonts (تنزيل وقت البناء).
5. أداء القوائم الكبيرة: FlatList مع getItemLayout حيث أمكن.

## 13. Blockers

- لا يوجد Android SDK محليًا → لا بناء محلي APK (مسار EAS Cloud فقط).
- لا أجهزة حقيقية في هذه البيئة → Real-device QA النهائي على المستخدم (سأجهز checklist كامل + QR/dev-client).

## 14. Implementation Phases

- **P0 — Backend (additive)**: Bearer في get_current_user + `/api/auth/token` + logout بالـ Bearer + اختبارات pytest جديدة + تشغيل البوابة (ruff+pytest).
- **P1 — الهيكل**: Expo init + expo-router + الثيم + الخطوط + عميل API + auth store + شاشات login/register/onboarding.
- **P2 — التابات الأساسية**: Dashboard (bundle) + Messages (محادثة+رد) + Comments (رد/إخفاء) + Analytics.
- **P3 — شاشات Stack**: audience، broadcast، autoreply، scheduled، billing+subscribe، team، settings، support، activity، notifications، tools(offers/templates)، leads، ads، sequences، marketing، reports، calendar، pages، pricing.
- **P4 — الحالات**: loading/empty/error/retry/unauthorized لكل شاشة (مكونات مركزية).
- **P5 — QA**: typecheck + lint + expo-doctor + unit tests + parity check + إصلاحات.
- **P6 — Git & Deploy**: commit نظيف + push + Vercel deploy للباكند + تحقق live.
- **P7 — EAS/Build**: eas.json + محاولة cloud build (Android أولًا) + artifacts.
- **P8 — التقارير النهائية**: final report + status.

## 15. QA Checklist

- [ ] typecheck (tsc --noEmit) يعمل 0 أخطاء
- [ ] lint يعمل
- [ ] expo-doctor نظيف
- [ ] كل شاشة لها 6 حالات (loading/empty/error/retry/success/unauth)
- [ ] login/logout/401-flow يعمل ضد API الإنتاجي (evidence حقيقي)
- [ ] web regression: pytest كامل أخضر (869+) + لا تغيير سلوك الويب
- [ ] الباكند بعد التعديل: نفس ردود الويب بلا Authorization (الكوكي ما زال يعمل)
- [ ] push إلى GitHub نظيف (لا secrets، لا node_modules)
- [ ] Vercel deploy ناجح + /api/health حي
- [ ] eas.json مضبوط + build (أو blocker موثق بصلاحية محددة)

---

## Audit Findings (Evidence)

- [from-code] `get_current_user` cookie-only — routers/auth.py:50-51.
- [from-code] CSRF skips Authorization-header requests — app/middleware.py:187.
- [from-code] runner.py:331-343 يجهز mount لـ `mobile/dist` عند `/app` — البنية متوقع أصلًا.
- [from-code] vercel.json excludeFiles يشمل `mobile/**` — جاهز.
- [live-probed] api.smart-link.ly حي v2.2.0، DB ok (68ms)، 401 صحيح، /api/plans و/api/config عامة.
- [live-probed] CORS preflight من exp:// يرد 400 (لا يؤثر على Native fetch).
- [from-code] PAGE_API_MAP الرسمية في tests/test_track_e_pages_gate.py:24-47.
- [from-code] ثيم الويب: dark افتراضي، primary=oklch(0.55 0.19 45)، خطوط Cairo/Readex Pro، radius 8/12/16/20/28/36.

## Migration Fit Verdict

**Expo React Native** — القرار مدعوم: SPA-like frontend منفصل عن API حقيقي REST (envelope موحد)، مصادقة token-based قابلة للتمديد بـ Bearer، UI عربية RTL، لا browser-only logic جوهرية (SSE/WS قابلة للتأجيل)، نفس مكتبة state (TanStack Query) تعمل في RN.
