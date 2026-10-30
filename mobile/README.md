# SmartBot Mobile (Expo + React Native)

تطبيق الهاتف الأصلي لمنصة SmartBot — **Native React Native وليس WebView**: تنقل أصلي، خط IBM Plex Sans Arabic، ثيم Machine Instrument نفسه للويب (ليلي ‎#050506‎ مع صوت آلة سماوي ‎#56E2F2‎ وبنفسجي AI ‎#9380FF‎، ونهاري بورسلين ‎#F2F2F0‎ مع سماوي عميق ‎#0E7A8A‎)، وRTL عربي كامل.

## البنية

```
mobile/
├── app.json                  هوية التطبيق (ly.smartlink.smartbot) + أيقونات العلامة
├── eas.json                  ملفات البناء (development/preview/production)
├── src/app/                  مسارات expo-router (نفس نمط App Router للفريق)
│   ├── (auth)/               login · register — قبل الجلسة
│   ├── (app)/                محمي بالمصادقة
│   │   ├── (tabs)/           5 تابات: الرئيسية · الرسائل · التعليقات · التحليلات · المزيد
│   │   ├── onboarding.tsx    معالج ربط صفحة فيسبوك (نفس رحلة الويب)
│   │   └── messages/[id]     شاشة المحادثة + الرد
│   │   └── …16 شاشة stack    audience/broadcast/autoreply/scheduled/billing/subscribe/settings/support/activity/notifications/tools/pages/team/sequences/marketing/ads/reports/calendar/leads
├── src/services/api.ts       عميل موحد: envelope + Bearer + timeout + retry + form + 401 مركزي
├── src/state/auth.tsx        الجلسة: /api/auth/token + expo-secure-store
├── src/constants/theme.ts    توكنات Machine Instrument (ليلي/نهاري) + radius + spacing + motion
├── src/components/           UI مشترك + حالات loading/empty/error/retry/unauth
├── src/lib/format.ts         التنسيق العربي (ar-LY) — نفس اصطلاحات الويب
└── src/lib/phone.ts          الهاتف الليبي (r138) — توأم بوابة الخادم: تطبيع +218/شرقية/جذع 0 ثم عقد الأسطولة الموحّد (محمول 09 بطول 9-10 + أرضي 0[1-9] بعشر)
```

## المصادقة (جديدة على الباكند — additive)

- `POST /api/auth/token` — دخول الموبايل: يعيد JWT في الجسم (بلا كوكيز)
- `Authorization: Bearer` على كل طلب (طبقة CSRF تتجاوز حاملي Authorization بتصميمها)
- التوكن في **expo-secure-store** (Keychain/Keystore)
- 401 مركزي → خروج تلقائي (بلا حلقات — نافذة إزالة 10 ثوانٍ مثل الويب)

## التشغيل

```bash
cd mobile
npm install
cp .env.example .env            # أو اضبط EXPO_PUBLIC_API_URL
npx expo start                  # Expo Go (اسحب QR)
```

## البوابات

```bash
npx tsc --noEmit                # typecheck — 0 أخطاء
npx vitest run                  # اختبارات الوحدة (عميل API + التنسيق)
npx expo-doctor                 # 21/21
npx expo lint                   # lint
```

## البناء (GitHub Actions — بلا حساب EAS)

سير عمل `mobile-release.yml` جذر المستودع يبني عند الوسم `mobile-v*` أو
تشغيلًا يدويًا — **APK أندرويد موقّعًا** (مفاتيح التوقيع في أسرار
المستودع: `ANDROID_KEYSTORE_B64` وأخواتها) + **أرشيف iOS غير موقّع**
(التوقيع لاحقًا بحساب Apple Developer) — والملفات على GitHub Releases.

### المسار القديم (EAS — يحتاج حساب Expo فعّالًا)

```bash
npm i -g eas-cli
eas login
eas build -p android --profile preview     # APK للاختبار
eas build -p android --profile production  # AAB للمتجر
eas build -p ios --profile production      # يتطلب حساب Apple Developer
```

## قرارات معمارية

| القرار | السبب |
|---|---|
| expo-router | نفس نمط Next.js App Router المعروف للفريق |
| TanStack Query v5 | **نفس مكتبة الويك** — إعادة استخدام أنماط حقيقية |
| cookie-first Bearer fallback في get_current_user | سلوك الويب لا يتغير بايت واحد |
| polling بدل SSE/WS في v1 | SSE خلف proxy على Vercel غير موثوق للموبايل؛ إيقاعات الويب نفسها |
| SVG مرسوم يدويًا للرسوم | بلا تبعيات ثقيلة (بديل recharts) |
| شاشات admin مؤجلة | منصة-إدارية نادرة الاستخدام على الهاتف — المرحلة 2 |

الخطة الكاملة: `docs/web-to-mobile/smartbot-mobile-plan.md` · الحالة: `docs/smartbot-mobile-progress.md`
