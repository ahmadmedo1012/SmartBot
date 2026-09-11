# SmartBot v25 — التشخيص الشامل العميق (DEEP AUDIT)

> **التاريخ:** 2026-09-11 | **المنهجية:** 5 وكلاء تدقيق متوازيين (Backend/API، Web، Mobile، Security، DB) + تحقق مباشر من خط الأساس (1105 اختبار pytest) + مراجعة Git history.
> **طبيعة هذه الجولة:** تدقيق منهجي كامل لكل طبقة (Web + Mobile + Backend + DB + Security) بلا انتظار لشكوى — لا تُغلق أي مشكلة إلا بإصلاح + تحقق.

---

## 0. الحكم التنفيذي المختصر

| الطبقة | الحالة قبل الجولة | أهم ما اكتُشف |
|---|---|---|
| **Backend / API** | قوية جدًا (v1-v24 صمدت) | ثغرة IDOR عبر المستأجرين في sequences، أصل عطل AI multi-agent، قفل دفع مزدوج غير فعّال عبر instances |
| **Web** | جيدة | إرسال جماعي بلمسة واحدة في Marketing (بلا تأكيد)، تفتّق صفحات (pagination) ناقص في 5 صفحات، أزرار < 44px |
| **Mobile** | **مكسورة فعليًا** | 6 شاشات تنهار (crash) بسبب انحراف عقد الاستجابة، 4 تدفقات مالية/إنشاء ميتة، تسجيل خروج لا يُبطل التوكن، Analytics فارغة |
| **Database** | جيدة البنية | reply_count و Offer.used_count لا يُكتبان أبدًا (منطق ميت)، نافذة رد مكرر عبر instances، فهرس FK غير مطبّق على الإنتاج القديم |
| **Security** | قوية | **سر حي في تاريخ Git** (Neon URL + SECRET_KEY لمشروع قديم) — يتطلب تدوير + تنقية تاريخ |

**الخط السفلي:** Web/Backend أقرب للإنتاج مما كانت عليه أي جولة سابقة؛ Mobile تحتاج إصلاح عقود الاستجابة (contract) قبل أي إطلاق؛ Security تحتاج تدوير المفاتيح المسربة تاريخيًا.

---

## 1. خط الأساس المُتحقَّق منه مباشرة (لا اعتماد على تقارير سابقة)

- **pytest:** 1105 اختبارات — نجاح 1105/1105 (تشغيل ثانٍ)؛ تشغيل أول ظهر فشل واحد متذبذب (`test_webhook_message_replay_does_not_reply_twice`) تحت حمل CPU من تثبيتات npm المتوازية — السبب الجذري: SQLite ملفية حساسة للحمل في بيئة الاختبار، والسلوك **فشل مغلق** (stored=False → لا رد) أي أن الإنتاج يتصرّف بأمان. سيعالَج بتقوية الاختبار لا بتغيير منطق الإنتاج.
- **ruff:** 0 ملاحظة (يتأكد في بوابة الجودة).
- **الاستنساخ:** المستودع 475MB — 181MB منها `docs/` وتاريخ يحمل node_modules ميتة (822MB محذوفة تاريخيًا) + سر حي (S-01).

---

## 2. أهم النتائج — مرتبة بالخطورة

### 🔴 P0 — حرجة (يجب إصلاحها قبل أي إعلان جاهزية)

| المعرف | المجال | المشكلة | الجذر |
|---|---|---|---|
| **S-01** | Security/Git | `fb_dashboard/.env` بسرّ Neon حي + SECRET_KEY في blob `2e6a618a` (أُضيف `d7e5d8db`، حُذف `c1eb1d78`) — **لا يزال قابلًا للتنزيل من المستودع العام** | التاريخ لم يُنقَّ أبدًا؛ بروتوكول التدوير في `docs/decisions-ledger.md` (dec-git-history-secrets، حالة "عاجل") لم يُنفَّذ |
| **M-01..M-06** | Mobile | **6 شاشات تنهار**: comments (تبويب رئيسي!)، ads، audience، leads، marketing، support — كلها تتوقع مصفوفة JSON والـbackend يرجع `{items:[...], total, ...}` | انحراف عقد الاستجابة (contract drift) — لم يُختبر mobile ضد أشكال الاستجابة الحقيقية أبدًا |
| **M-07** | Mobile/Auth | تسجيل الخروج يستدعي `/api/logout` **بدون** ترويسة Bearer (يُمسح التوكن قبل الاستدعاء) → لا إبطال jti → التوكن يبقى صالحًا ≤24 ساعة | `auth.tsx:79-91` يضبط `setAuthToken(null)` قبل `apiFetch('/api/logout')` |
| **B-01** | Backend/IDOR | sequence subscribe/unsubscribe لا يتحققان من ملكية `subscriber_id`/التسلسل → مستأجر A يسجّل مشترك مستأجر B ويرسل له رسائل | `sequence_engine.py:251-303` بلا فلتر tenant |
| **B-02** | Backend/AI | **أصل عطل "AI multi-agent غير فعّال"**: مسار الوكيل (`agent_brain._ai`, `agent_engine`) يبني `AIService()` من مفاتيح env فقط ولا يستدعي أبدًا `refresh_ai_from_db()` — المفاتيح المحفوظة في /admin/settings لا تصل للوكيل؛ انحدار صامت إلى heuristic | ذاكرة `_ai` singleton في `agent_brain.py:48-55` لا تُبطَل عند refresh |
| **M-09** | Mobile | تبويب Analytics يعرض **فراغًا دائمًا** — يقرأ `totals.messages` و`sentiment.positive` والـbackend يرجع `total_replies` و`sentiment_distribution` | انحراف مفاتيح |
| **M-10..M-14** | Mobile | **4 تدفقات ميتة**: إنشاء broadcast (يطلب name+message_template)، subscribe (يطلب amount+provider+phone)، topup (يطلب provider+phone)، scheduled/calendar (Form وليس JSON، مفتاح `message` وليس `content`) | اختلاف عقد الإدخال |
| **D-03** | Backend/تكرار | التعليقات: الإرسال لفيسبوك يحدث **قبل** إدراج صف الرد (dedup guard) → عبر instances متعددة يمكن للعميل رؤية رد مكرر، وخاسر السباق يفقد عدّاد الاستخدام (فوترة ناقصة) | `pipeline.py:573→680` |

### 🟠 P1 — عالية

| المعرف | المشكلة |
|---|---|
| **W-01** | Marketing: **إرسال جماعي بلمسة واحدة** بلا حوار تأكيد ولا معاينة حجم الجمهور (يناقض معيار v24-C2 المطبق في broadcast) |
| **M-08** | ذاكرة React Query لا تُمسح عند الخروج/401 → مستخدم ثانٍ على نفس الجهاز يرى وميض بيانات المستأجر السابق |
| **B-03/D-08** | قفل الدفع المعلق عملي فقط داخل process + IntegrityError غير معالج → 500 خام بدل 400 ودّية عبر instances (الفهرس الفريد الجزئي موجود لكن الاستثناء يمرّ) |
| **B-11** | viewer يملك صلاحية إلغاء دفع معلق لأي مستخدم بنفس المستأجر (sabotage) |
| **D-01** | `Subscriber.reply_count` لا يُكتب أبدًا → جمهور "engaged" وفلتر `min_replies` صامتان الخطأ |
| **D-02** | `Offer.expires_at/max_uses/used_count` غير مفروضة → العروض المنتهية تُسلَّم للأبد |
| **D-04** | عدّادات read-modify-write بلا ذرية (CRM total_interactions، Conversation message_count/unread_count، Sequence totals) |
| **B-20** | موافقة الدفع يمكن أن تعلّم "verified" دون تفعيل خطة (tenant/plan مفقود) وتبلّغ المستخدم بالنجاح |
| **D-05** | FK CASCADE معلنة في النماذج لكنها **غير موجودة** في الإنتاج القديم → حذف يُنتج orphans |
| **M-28** | EAS development/preview يشير إلى **قاعدة الإنتاج** — بناءات التطوير تكتب في بيانات الإنتاج |

### 🟡 P2 — متوسطة

- **W-02/W-03/W-04**: حذف/نشر بلمسة واحدة في marketing/scheduled/tools (غير متسق مع معيار التأكيد بلمستين).
- **W-05/W-06/W-07**: لا تفييم صفحات (pagination) في audience (10 فقط!)، comments (30 فقط)، leads، notifications، posts — البيانات الأقدم غير قابلة للوصول.
- **W-08**: إنشاء sequences غير ذري (حملة ثم N خطوات) — الفشل منتصف الحلقة يترك حملة جزئية وإعادة المحاولة تُنشئ مكررة.
- **W-09**: أزرار أيقونية 28-32px تلغي حدّ 44px المشترك (autoreply/team/calendar/marketing/notifications).
- **B-04/B-05/B-06/B-16**: إخفاقات صامتة جديدة (`except: pass`) في analyze-image، محاسبة DM-reply، upsert محادثات inbox، dashboard_stats.
- **D-07**: أحداث AnalyticsEvent من calendar تُكتب بـ tenant_id=0 (غير مرئية لأي مستأجر) + JSON مزدوج الترميز.
- **D-06**: SupportTicketReply بلا tenant_id ولا FK.
- **M-15..M-19**: انحرافات حقول متفرقة (reports PDF ثنائي، activity keys، billing keys، tools fields، comments replied).
- **M-20/M-21/M-22/M-31**: بحث الرسائل بلا debounce، لوحات بلا KeyboardAvoidingView (7 شاشات iOS)، thread لا يتمرر لآخر رسالة، spinners مشتركة بين الصفوف.
- **B-08**: كل طلب تغيير يفتح اتصال DB كاملًا لفحص rate-limit (ضريبة تأخير في المسار الحار).
- **W-10**: طلبات `/api/me` مكررة (settings + admin approvals خارج useMe).
- **W-12**: `/connect` غير محمي في middleware (وميض skeleton قبل التحويل).
- **B-09/B-10**: endpoints وهمية (notification-preferences لا يحفظ؛ cooldown في الذاكرة فقط).

### 🟢 P3 — تحسينات

- N+1s: tags count لكل وسم (D-09)، broadcast fan-out 2N+1 (D-10)، sequences list (W-11)، inbox search بعد LIMIT (D-12).
- استعلامات بلا حدّ (D-11)، عقود زمنية بلا server_default (D-18)، تكرار JSON مزدوج (D-19).
- S-02/S-03: نظافة المستودع (181MB docs، static/_next متتبعة، gitignore path خاطئ).
- M-27: ~10 تبعيات Expo غير مستخدمة؛ M-30: `as never` casts؛ W-15: محدد CSS هش.
- B-12/B-15/B-18/B-19/B-21 و W-13/W-14/W-16: مسائل جودة أقل خطورة.

---

## 3. ما ثبت أنه سليم (تحقق مباشر — لا اعتماد على ادعاءات)

- **توقيع webhook فيسبوك**: HMAC-SHA256 مقارنة زمنية ثابتة، يفشل مغلقًا، التحقق قبل التحليل.
- **Cron/Telegram**: Bearer + constant-time، السر الفارغ لا يصادق أبدًا.
- **المدفوعات**: مطالبات `UPDATE...WHERE status RETURNING` ذرية (منع الموافقة المزدوجة)، رصيد المحفظة SQL ذري.
- **JWT**: HS256 مثبت + قائمة jti سوداء + token_ver، كلمات المرور argon2id (t=3, m=64MB).
- **CSRF**: double-submit + قائمة Origin دقيقة.
- **Web (الأمان)**: صفر توكن في localStorage (cookies فقط httpOnly)، safeRedirect، حدود error.tsx لكل مسار.
- **Mobile (النقل)**: توكن في SecureStore دائمًا، مهلة 20s، retry على GET فقط.
- **v20 fixes صامدة**: sync failures تسجّل وتُظهر sync_error.

---

## 4. خطة الإصلاح (التنفيذ يبدأ فورًا — بهذا الترتيب)

**الموجة 1 (P0):** Mobile contract fixes (M-01..M-06, M-09..M-19) + M-07/M-08 → B-01 IDOR → B-02 AI key path → D-03 counter protection → B-03/D-08 → B-11.
**الموجة 2 (P1):** W-01..W-04 confirms → D-01/D-02/D-04 → B-20 → M-28 → W-05..W-09 → W-08.
**الموجة 3 (P2/P3 انتقائي):** silent failures (B-04/05/06/16) → D-07 → W-10/W-12 → S-03 gitignore + إزالة static/_next من التتبع → N+1 المختارة.
**بوابة القبول:** pytest كامل + tsc/vitest للواجهتين + lint + build + نشر مع heartbeat 200 + دليل حي.
