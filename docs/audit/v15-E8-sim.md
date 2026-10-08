# تقرير E8 — بطارية المحاكاة v15 (جولة v15)

**الحالة:** مكتمل — E8 أنجز المحرك والشخصيات p09-p13، وأكمل المنسّق p14 وسكربتات التشغيل الثلاثة (رسالة الوكيل انتهت بمهلة).

## البنية المسلّمة

### 1) محرك الادعاءات المفروضة (يغلق C-GATE1/D7-F1 بنيوياً)
- `checkClaim` **يرمي فوراً** عند أي ادعاء أحمر غير مُدرج في قائمة السماح — `SIM_ENFORCE_CLAIMS=1` افتراضي
- قائمة السماح `e2e/sim/fixtures/sim-findings.json`: كل إدخال يحمل `finding` (مرجع تشخيصي) + `reason` + `expires` (TTL بجولات أو 'prod') + `owner`
- **كاشف الانقلاب:** أي إدخال موثق يخضرّ يوسم `findingClosed` في `sim-findings-live.json` → المنسّق يحذفه → العقد يصبح صارماً
- **الخروج المركّب:** `exit = playwright_exit || claims_red_exit` — «البطارية خضراء» صادقة أو حمراء

### 2) الشخصيات الست الجديدة (p09-p14)
| الشخصية | تغطي | الملف |
|---|---|---|
| p09 زبون ماسنجر متعدد الأجهزة | سباق upsert (D3-H1) + idempotency mid + offline→online | sim-p09-messenger-multisession.spec.ts |
| p10 مستأجر حدود الخطة | بوابات max_replies/has_dm/has_broadcast/has_ai (D2-H1) + قمع المجاني (D4-C1) | sim-p10-plan-limits-tenant.spec.ts |
| p11 متصفح عربي حقيقي | locale=ar + أرقام هندية + خنق 3G (CDP) | sim-p11-arabic-rtl-browser.spec.ts |
| p12 قارئ شاشة | اجتياحات axe-core كاملة + كيبورد فقط + aria-live (أدلة a11y حية) | sim-p12-screenreader-axe.spec.ts |
| p13 مهاجم موسّع | bidi + نقر مزدوج الدفع + حسم/تسجيل متزامن + SSRF بالاسم والعنوان + brute-force + ?token= | sim-p13-race-attacker.spec.ts |
| p14 تدوير الأسرار الحي | إعادة إقلاع uvicorn بSECRET/CRON جديدين منتصف البطارية (المنسّق) | sim-p14-secret-rotation.spec.ts |

### 3) السكربتات الثلاثة
- `scripts/v15_sim_local_battery.sh` — المكدس المزدوج الكامل: uvicorn + next start بالوكيل، 14 شخصية بالتسلسل، **SIM_STRICT_409=1 + SIM_ENFORCE_CLAIMS=1 افتراضياً**، تقرير عربي لكل شخصية + الادعاءات + كاشف الانقلاب + الأدلة، إطفاء نظيف
- `scripts/v15_postdeploy_battery.sh` — **90 فحصاً بلا حالة**: مجموعات v14 الثمانية (A-H) + الجديدة: I حراسة مسارات v15 (12) · J عائلة 409/تحقق مدخلات (4) · K أسرار النقل Bearer (4) · L عزل الإيصالات (3) · M عقد الخطط والخطة المجانية (5) · N مظاريف وسقوف (4) · O علامات v15 الحية (4)
- `scripts/v15_sim_rotate_secret.sh` — pkill → أسرار جديدة → إقلاع → healthz → كتابة env (FERNET_KEY وAPP_SECRET كما هما)

## إسنادات مميزة
- p14 يثبت حياً: التوكنات القديمة 401 · الدخول الجديد يعمل · **توجيه الواجهة 401→/login (D4-H3) أمام العين** · بيانات Fernet تنجو · ويبهوك HMAC يستمر · كرون بالسر الجديد فقط
- تضمينات sim-findings الأولية: p08-crm-lead-r3 (إنتاج) · بوابات p10 الثلاث (تنقلب خضراء تلقائياً عند توكن Graph حقيقي)

## البوابات
- `npx tsc --noEmit` — 0 أخطاء (كل الspecs ضمن المشروع)
- `bash -n` — السكربتات الثلاثة سليمة
- التشغيل الفعلي: المنسّق يشغّل البطارية الكاملة (§قبول الجولة)
