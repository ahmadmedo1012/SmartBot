# تقرير D6 — اختبار اختراق بأسلوب القبعات البيضاء · جولة v15

**الوكيل:** D6 (الأمن الهجومي/الدفاعي) · **التاريخ:** 2026-09-07 · **الأساس:** main @ 558623b3 (شجرة نظيفة، v14 مكتملة)
**النطاق:** كل سطح الهجوم — المصادقة/الجلسات/الصلاحيات/المدخلات/الأسرار/الحدود/الرفع/الويبهوك/الترويسات/i18n/Fernet — بلا كتابة كود تطبيق، وبلا أي هجوم فعلي خارج المستودع (فحوصات الإنتاج curl قراءة فقط).
**قاعدة عدم الإعادة:** ما أُغلق في v14 (C-SEC1، حارس LFI لتحليل الصور، token_ver، CSRF double-submit المُتحقق إنتاجياً، رفض webhook بلا توقيع) لم يُعد عدّه؛ وُثّق التحقق الحي منه فقط.

---

## 0) المنهجية والتحقق الحي

- مسح AST لكل معالجات المسارات في 41 ملف راوتر (239 مساراً) مقابل تواقيع الحارس `get_current_user/require_role/require_platform_admin`.
- مسح dB: كل `db.get()` وكل `where(Model.id == …)` قياس غياب مرشّح `tenant_id` (IDOR).
- مسح SQL خام (`text(`/f-string/تسلسل)، XSS (`innerHTML/dangerouslySetInnerHTML/توليد HTML`)، SSRF (httpx بعناوين يتحكم بها المستخدم)، أسرار (git history/سجلات/ردود)، ReDoS (تجميع regex من مدخلات).
- تحقق إنتاجي قراءة فقط (curl): healthz=200 · رؤوس الأمان كاملة على النطاقين (CSP+HSTS+preload/nosniff/XFO: DENY/Referrer/Permissions) · POST /webhook بلا توقيع=401 · /api/cron/heartbeat بلا سر=403 · GET /api/payments/receipt/1=401 · /api/users=401 · shopify webhook=401 (مغلق) · CSRF: إصدار كوكي `csrf_token` (Secure/Strict/غير HttpOnly) على GET /api/plans ثم POST بلا ترويسة=403 وبأصل مزيف=403.
- فحص تاريخ git كاملاً (كل الالتزامات) بحثاً عن ملفات .env ب قيم فعلية وأنماط توكنات حقيقية.

## 0.5) خلاصة سريعة

| الشدة | العدد | أبرزها |
|---|---|---|
| حرج | 0 | — |
| عالي | 2 | أسرار إنتاج في تاريخ git (Neon DB URL + SECRET_KEY) · SSRF عبر حل DNS في حارس الصور |
| متوسط | 4 | تزوير موافقات Telegram عند ALLOW_UNVERIFIED · إيصالات عبر /static العام · CRON_SECRET في الاستعلام · brute-force على change-password |
| منخفض | 5 | CSP connect-src واسع · حقول بلا سقف طول · limit غير محدود · FERNET_KEY بلا تحقق صلاحية · wildcard LIKE |

**الحصيلة: 11 إيجاداً جديداً** + 6 ملاحظات عابرة. لا حرجة جديدة. طبقات v14 (platform-admin/LFI/token_ver/CSRF/webhook HMAC) صمدت أمام إعادة الفحص كاملة — البنية الأمنية متماسكة؛ الإيجادات الجديدة إما في **التاريخ/التكوين** أو في **حواف الحراس**.

---

## 1) الإيجادات التفصيلية

### V15-D6-H1 · عالي · أسرار إنتاج حقيقية في تاريخ git (Neon DB + SECRET_KEY)

- **الموضع:** الالتزام `d7e5d8db` أضاف `fb_dashboard/.env` (blob `2e6a618a00c6d…`)، وحمله ~100 التزام بعده حتى أزاله `c1eb1d78` («cleanup … 822MB→46MB») — لكن الكائن ما زال قابلاً للاسترجاع بـ `git show d7e5d8db:fb_dashboard/.env`.
- **المقتطف (مقنّع):**
  ```
  DATABASE_URL=postgresql://neondb_owner:<كلمة مرور>@ep-dark-unit-atj8qob4-pooler.c-9.us-east-1.aws.neon.tech/…  (114 حرفاً)
  SECRET_KEY=smartb…  (27 حرفاً — نمط بشري ضعيف، ليس token_urlsafe(32))
  ```
  (القيم لم تُطبع كاملة هنا عمداً — قابلة للاستخراج محلياً للأدلة.)
- **سيناريو الاستغلال الملموس:** أي جهة تحصل على استنساخ المستودع (مساهم مستقبلي، نسخة احتياطية، تسريب المجلد، أو جعل المستودع عاماً يوماً ما) تنفّذ `git show d7e5d8db:fb_dashboard/.env` ثم: (1) تتصل بقاعدة Neon مباشرة بكلمة المرور إن ظلت سارية → قراءة/تعديل كل بيانات المستأجرين والإيصالات وتوكنات فيسبوك المشفرة؛ (2) توقّع JWT بـ SECRET_KEY إن لم يُدوَّر منذ ذلك الحين → جلسة مسؤول منصة مزورة بلا أي تفاعل مع التطبيق. كلا المسارين بلا أي حارس برمجي يوقفه — الحراسة كلها في الافتراض أن المستودع لن يتسرب أبداً.
- **الإصلاح:** (1) تدوير فوري: كلمة مرور Neon (من لوحة المشروع) + SECRET_KEY جديد + FERNET_KEY جديد في Vercel — التدوير يُبطل الجلسات الحالية (مقبول) ويُبطل أي كوكي مسروق؛ (2) تنبيه: SECRET_KEY هو أيضاً مفتاح Fernet الموروث (`_get_legacy_key`) — أي توكن فيسبوك قديم مُشفّر به يصبح غير قابل للفك → خطوة إعادة إدخال التوكن للمستأجرين المتأثرين أو ترحيل إعادة تشفير مسبق؛ (3) تنقية التاريخ بـ `git filter-repo` (إزالة المسار) + force-push + إعادة استنساخ كل النسخ؛ (4) قاعدة CI: فحص `git log --all --diff-filter=A -- '.env*'` يمنع الالتزام مستقبلاً (اليوم `.gitignore` يحمي الشجرة فقط لا التاريخ).

### V15-D6-H2 · عالي · SSRF: حارس روابط الصور لا يحلّ DNS (اسم مضيف → IP داخلي)

- **الموضع:** `fb_dashboard/ai_service.py:71-93` (`_is_private_or_local_host` يرفض IP الحرفي فقط) و`:96-109` (`_assert_safe_image_url`)؛ ثلاثة مسارات جلب خادمية تعتمد عليه:
  - `fb_dashboard/ai_service.py:363-379` (`_gemini_vision` — httpx بلا سقف حجم وبلا مهلة صريحة)
  - `fb_dashboard/routers/payments/approvals.py:164-186` + `:240-250` (جلب الإيصال البعيد)
  - `fb_dashboard/pdf_reports_engine.py:40-57` + `:180` (شعار WeasyPrint في `<img src>`)
- **المقتطف:**
  ```python
  try:
      ip = ipaddress.ip_address(host)      # يفشل لأسماء DNS → يمرّ الاسم كما هو
  except ValueError:
      digits_dots = host.replace(".", "")
      ...
  ```
  ثم لاحقاً: `r = await c.get(image_url)` — الحل يتم وقت الجلب، بعد أن اجتاز الاسم الفحص.
- **سيناريو الاستغلال الملموس:** المستأجر المهاجم يسجّل طلب اشتراك بنقله البنكي مع `receiptImageUrl=https://receipt.evil.ly/x.jpg` (يُقبل — البادئة `https://` كافية في `_validated_receipt_url`، plans.py:61) ويضبط سجل DNS لـ `receipt.evil.ly` → `169.254.169.254` (أو IP داخلي لخدمة على الشبكة). حين يفتح **مسؤول المنصة** طابور المراجعة ويطلب `/api/payments/receipt/{id}` يجلب الخادم المورد الداخلي: الصورة تُعرض للمسؤول (كشف محتوى) أو تفشل بشكل قابل للتمييز (oracle أعمى على المنافذ الداخلية). المسار الأشد: `analyze-image` عبر الوكيل — نص المستخدم يقود LLM لإرسال رابط، و`_gemini_vision` يجلبه **ويحوّل محتواه لصورة تُوصف للمستخدم** = قراءة SSRF كاملة لمحتوى داخلي. (يُخفف عملياً على Vercel حيث سطح الشبكة الداخلية أصغر — يبقى قابلاً للاستغلال ضد خدمات metadata/النطاق الداخلي المتاح.)
- **الإصلاح:** قبل أي جلب: حلّ المضيف بـ `getaddrinfo` وارفض إن كان **أي** عنوان ناتج (A/AAAA) ضمن `is_private/is_loopback/is_link_local/is_reserved` — كرّر الحل على عناوين إعادة التوجيه إن فُتحت؛ في `_gemini_vision`: مهلة صريحة + سقف حجم (كما في `_fetch_remote_receipt` 10MB/10s)؛ اختيارياً جلب بـ IP بعد التحقق وتثبيت Host (يمنع rebinding).

### V15-D6-M1 · متوسط · موافقات الدفع عبر Telegram تُوثّق بـ from_id من الجسم عند إلغاء التحقق

- **الموضع:** `fb_dashboard/app/telegram.py:44-53` (تخطي فحص السر عندما `TELEGRAM_WEBHOOK_ALLOW_UNVERIFIED=true` — `runner.py:141-142`) ثم `:73-78` (الاعتماد الوحيد بعدها على `from_id` **من جسم الطلب**).
- **المقتطف:**
  ```python
  if not runner._ALLOW_UNVERIFIED:
      token = request.headers.get("x-telegram-bot-api-secret-token", "")
      ...
  from_id = cq.get("from", {}).get("id")
  if from_id not in (await get_admin_ids()): ...
  ```
- **سيناريو الاستغلال الملموس:** المتغير موثّق في `.env.example` «اجعلها true فقط للاختبار المحلي للويبهوك» — لكن `config.py` **لا يفشل إقلاعاً** إذا ضُبط true في الإنتاج (يفحص SECRET_KEY/CRON_SECRET/FERNET_KEY فقط). خطأ نشر واحد (نسخ .env اختباري إلى Vercel) يجعل `POST /api/telegram/webhook` بلا أي تحقق نقل؛ المهاجم يرسل `callback_query` مزوّراً بـ `from.id` = معرف أدمن من `TELEGRAM_ADMIN_IDS` (قيمة معروفة/قابلة للتخمين) و`data="sub_app:<id>"` → **حسم أي دفعة معلقة وتفعيل باقة بلا مال** — نفس فئة C-SEC1 التي أغلقتها v14 على مسار HTTP، تعود من مسار Telegram عند هذا التكوين. حتى مع السر مفعلاً: من يعرف `TELEGRAM_WEBHOOK_SECRET` يستطيع نفس التزوير (هذا مقبول — السر هو خط الدفاع)؛ الخلل هو وجود وضع يلغي خط الدفاع الأول بلا قفل إنتاجي.
- **الإصلاح:** في `config.py` بجانب فحوص fail-fast الإنتاجية: `if _IS_PROD and _ALLOW_UNVERIFIED: raise RuntimeError(...)`؛ ودوياً: تحقق ثانٍ من أن `from_id` يطابق بادئ الطلب (لا يمكن) → الأدق: اعتبار `ALLOW_UNVERIFIED` إعداد dev-only يرفضه الكود في الإنتاج صراحة.

### V15-D6-M2 · متوسط · إيصالات الدفع متاحة عبر /static العام في النشر غير-Serverless

- **الموضع:** `fb_dashboard/runner.py:281` — `app.mount("/static", StaticFiles(directory=str(STATIC_DIR)))` يركّب **كل** STATIC_DIR بما فيه `static/uploads/receipts/` الذي يكتب فيه `routers/payments/bank.py:23,79`؛ ومسار الرفع للوكيل `routers/ai.py:154-157` يكتب في `static/uploads/`.
- **المقتطف:**
  ```python
  _UPLOAD_DIR = Path(...).parent.parent.parent / "static" / "uploads" / "receipts"
  ...
  name = f"{secrets.token_hex(12)}{ext}"        # 96-bit غير قابل للتخمين
  (_UPLOAD_DIR / name).write_bytes(payload)
  url = f"/static/uploads/receipts/{name}"      # رابط عام بلا مصادقة
  ```
- **سيناريو الاستغلال الملموس:** على Vercel (الإنتاج الحالي) الملفات لا تُكتب (يُعاد data-URI) — الخطر محصور بنشر standalone/ذاتي الاستضافة، حيث يبقى الرابط العام حياً **إلى جانب** المسار المحمي الجديد (v14-E1) بدل أن يحل محله: أي تسريب للرابط (Referer عند مشاركة صفحة تحويه، سجلات بروكسي، لقطة شاشة، هاتف مشترك) يعرض إيصالاً بنكياً يحمل اسم المرسل ورقم حسابه — PII مالية — لأي حائز الرابط بلا تسجيل دخول.
- **الإصلاح:** في النشر غير-Serverless: (أ) انقل الكتابة خارج STATIC_DIR (مثل `data/uploads`) وقدّمها **فقط** عبر المسار المحمي `/api/payments/receipt/{id}` الموجود أصلاً، أو (ب) راوتر مخصص يتحقق `is_file() and basename` مع جلسة، وارفع التحميل من `/static` بتركيب مجلد فرعي لا يشمل `uploads/`.

### V15-D6-M3 · متوسط · CRON_SECRET يقبل عبر ?token= في نص الاستعلام (fallback مهمل لكن دائم)

- **الموضع:** `fb_dashboard/routers/bot.py:125-128` و`:187-190`، و`fb_dashboard/routers/plans_config.py:219-235` (نموذج form — أقل خطراً).
- **المقتطف:**
  ```python
  valid = bool(secret) and secrets.compare_digest(auth_header, f"Bearer {secret}")
  if not valid and secret and token and secrets.compare_digest(token, secret):
      log.warning("cron auth via ?token= query param is deprecated — ...")
      valid = True
  ```
- **سيناريو الاستغلال الملموس:** كل مزوّد cron (cron-job.org) ما زال يضبط `GET /api/cron/heartbeat?token=<CRON_SECRET>`؛ نص الاستعلام يسجل في سجلات وصول uvicorn/Vercel وسجلات أي بروكسي وسيط وشبكات المراقبة — فتسريب السجل = تسريب سر الجدولة (يشغّل دورات البوت والحساب عن بعد). التطبيق نفسه لا يسجّل الاستعلام (request_logging يستخدم `request.url.path` فقط — جيد) لكن البنية التحتية حوله تفعل. الثابت: من يعرف CRON_SECRET **لا** يستطيع حسم دفعات (هذا حكر على مسؤول المنصة) — لكنه يستهلك دورات/ينفّذ heartbeat/ينشر منشورات مجدولة مستحقة.
- **الإصلاح:** أفق إزالة معلن: متغير `CRON_ALLOW_QUERY_TOKEN` (افتراضي false بعد 30 يوماً من الترحيل)، أو رفض `?token=` عندما `VERCEL_ENV=production` مع سماحه في preview/dev، وترحيل cron-job.org إلى ترويسة Authorization (متوفر منذ v12).

### V15-D6-M4 · متوسط · /api/auth/change-password بلا سقف خاص — قوة غاشمة على كلمة المرور الحالية بتوكن مسروق

- **الموضع:** `fb_dashboard/routers/auth.py:347-375` — لا يستدعي `check_rate_limit` خاصاً؛ الحماية الوحيدة هي حد الوسيط العام `mutate:{ip}` = 30/60s (middleware.py:31-32, 89-103).
- **المقتطف:** لا وجود لـ `check_rate_limit` في المعالج؛ `verify_password(current_password, current_user.password_hash)` يُشكّل **oracle** صحيح/خطأ.
- **سيناريو الاستغلال الملموس:** مهاجم حصل على جلسة (جهاز مسروق، توكن من سجل مسرب، session hijacking) يريد التحقق من كلمة المرور قبل تغييرها/سرقة الحساب نهائياً: يرسل 30 محاولة/دقيقة لكل IP → **43,200 تخميناً/يوم**. الحد الأدنى المقبول 8 أحرف بلا تعقيد إلزامي → فضاء قابل للسرد القاموسي. argon2id (time_cost=3) يبطئ كل محاولة لكنه لا يوقف المحاولة الموجهة، والوسيط يفرج بالطلب عند فشل قاعدة البيانات (graceful degradation) فيلغي السقف أصلاً في نوافذ الأعطال.
- **الإصلاح:** حد خاص 5 محاولات/10 دقائق **لكل حساب** (مفتاح `chpw:{user_id}`) بجانب حد الـ IP، وقفل تصاعدي (تأخير 2^n) بعد 5 إخفاقات؛ رسالة الخطأ تبقى موحدة (لا تكشف السبب).

### V15-D6-L1 · منخفض · CSP على نطاق bot يسمح connect-src 'https:' (واسع)

- **الموضع:** `fb_dashboard/frontend/middleware.ts:45` مقابل التضييق الأدق على نطاق api (`app/middleware.py:318`).
- **المقتطف:** `connect-src 'self' https:` — مقابل: `connect-src 'self' https://api.smart-link.ly https://*.ingest.de.sentry.io wss:`.
- **سيناريو الاستغلال الملموس:** أي XSS مستقبلي في واجهة bot (أو إضافة طرف ثالث مسرَّبة) يستطيع إرسال البيانات المسروقة (توكنات، بيانات مستأجرين) إلى **أي** مضيف https — الحارس الأخير ضد الإفراط في التسريب غائب على هذا النطاق بينما حاضر على الآخر.
- **الإصلاح:** وحّد القائمة: `connect-src 'self' https://api.smart-link.ly https://*.ingest.de.sentry.io wss:` (الواجهة لا تتصل بغيرها — الوكيل المحلي dev يعمل عبر rewrite نفسه).

### V15-D6-L2 · منخفض · حقول نصية بلا سقوف طول (تخزين غير محدود)

- **الموضع:** `routers/auth.py:189` (name في التسجيل — username/email محدودان لكن name لا)؛ `routers/rules.py` و`flows.py` و`templates_routes.py:31-33` (keywords/reply_template/text)؛ `routers/payments/plans.py:123-128` (sender_name/sender_account)؛ `routers/support.py:93-100` (body بحد أدنى فقط). للمقارنة: `receipt_url` له سقف 2M حرف (plans.py:60) و`bank-transfer` الآخر محدود بالمقاطع `[:200]` في بعض الردود فقط.
- **سيناريو الاستغلال الملموس:** مستخدم موثّق (30 طلباً/دقيقة لكل IP) يرسل ردود قواعد بحجم 10MB لكل طلب → ~26GB/يوم في قاعدة Neon لكل IP هجوم — تضخيم تكلفة/نفاد مساحة + بطء القوائم التي تُرجع النصوص كاملة. ليس اختراقاً لكنه استنزاف مورد مؤذٍ ورخيص.
- **الإصلاح:** سقوف موحدة عند الحدود (مثل `len(name)<=64`, `reply_template<=2000`, `sender_name<=120`, `ticket body<=8000`) مع 400 عربية عند التجاوز — نفس نمط `ClearLogsBody` (v14-E1 #6).

### V15-D6-L3 · منخفض · limit غير محدود في /api/diagnostics/recent-errors

- **الموضع:** `fb_dashboard/routers/diagnostics.py:50` — `limit: int = Query(20)` بلا `ge/le` (كل المسارات الشقيقة محدودة 1..500).
- **المقتطف:** `async def diagnostic_errors(limit: int = Query(20), …)`.
- **سيناريو الاستغلال الملموس:** قيمة سالبة/ضخمة (مثل 10⁹) من مسؤول المنصة تُدخل إلى `get_recent_errors` → سلوك تقطيع شاذ أو محاولة بناء قائمة ضخمة من ring buffer (محدود داخلياً غالباً — يبقى إرجاع الكل مرة واحدة). الأثر محدود بالحارس platform-admin لكنه خرق نمط الحدود المتبع.
- **الإصلاح:** `Query(20, ge=1, le=500)` كإخوته.

### V15-D6-L4 · منخفض · FERNET_KEY يُفحص «غير فارغ» فقط عند الإقلاع — لا صلاحية مفتاح

- **الموضع:** `fb_dashboard/config.py:99-100` (fail-fast غير فارغ) مقابل `fb_dashboard/_crypto.py:17-18` (`Fernet(settings.FERNET_KEY.encode())` يرمي `ValueError` عند أي قيمة ليست base64-32).
- **سيناريو الاستغلال الملموس:** قيمة مشوهة (مسافة زائدة، اقتباس، مفتاح قديم من نسخة dev) تجتاز الإقلاع ثم تفجر **أول** عملية حفظ توكن فيسبوك بـ 500 خام (IntegrityError/ValueError يصل للـ handler العام برسالة عامة — لا تسريب، لكن رحلة الربط تنكسر بلا تشخيص مبكر، وتُرجع `encrypt_token(val) or val` في shopify_configure نصاً **غير مشفر** حين يفشل التشفير — commerce_routes.py:32-33 — توكن Shopify يُخزن خاماً بصمت).
- **الإصلاح:** عند الإقلاع الإنتاجي: `Fernet(settings.FERNET_KEY.encode())` داخل try → RuntimeError عربي واضح؛ وإصلاح سلوك `encrypt_token(val) or val` إلى رفض صريح (400) بدل تخزين نص خام.

### V15-D6-L5 · منخفض · حروف البدل % و_ غير مهرّبة في بحث ilike

- **الموضع:** `fb_dashboard/routers/crm_routes.py:30` (`ilike(f"%{search}%")`)، `routers/admin_routes.py:456` (بحث مستخدمي المنصة)، `subscriber_engine.py:92-95`.
- **سيناريو الاستغلال الملموس:** بحث `%` يعيد كل الصفوف (تجاوز قصد التصفية) — لا حقن SQL (معلمات مُهيّأة) لكنه يلغي حدود الترشيح على مسار الأدمن ويسمح باستخراج قوائم كاملة بالتقليب. أثره استعلامي (ترقيم الصفحات يحدّه).
- **الإصلاح:** `search.replace("%", r"\%").replace("_", r"\_")` قبل التحويف، مع `escape=` المتوفر في SQLAlchemy إن لزم.

---

## 2) ما تحقق أنه سليم (عيون جديدة، لا إيجاد)

| المحور | النتيجة |
|---|---|
| **SQLi** | صفر — كل الاستعلامات عبر SQLAlchemy معلمات؛ `text()` فقط لثوابت داخلية (`text("h")`) وDDL الترحيل من metadata النماذج (`_schema_reconcile.py:146`) — لا مدخل مستخدم |
| **XSS** | صفر — React escaping في كل الواجهة؛ `dangerouslySetInnerHTML` في JSON-LD ثابت (page.tsx:104-107) وCSS ثابت (OnboardingWizard:299)؛ PDF يهرّب كل مدخل (`html.escape` pdf_reports_engine:180-185) مع CSP كلا النطاقين |
| **path traversal** | محكوم — spa.py:83 (v12-E3.1) + `os.path.basename` في مسار الإيصال (approvals:234) + رفض ملفات محلية في analyze_image (v14-E1 #7) |
| **JWT/forgery** | HS256 بقائمة خوارزميات صريحة (لا `none`)، `jti` + قائمة سوداء + `ver`=token_ver + `tid` scoped — التزوير يتطلب المفتاح (انظر H1 للتدوير) |
| **IDOR /api/users/{id}** | لا مسار GET فردي؛ PUT/DELETE محكومان بمرشّح `tenant_id == current` (users.py:47-49, 71-73)؛ reset-password بتحقق platform/tenant (auth.py:330-335) |
| **الجلسات/WS** | توكن HttpOnly+Secure+SameSite=Lax فقط (لا localStorage إطلاقاً)؛ WS: ترويسة أولاً ثم query (معروف v14) مع jti/ver/tenant — محكوم |
| **الصلاحيات** | 239 مساراً: 13 بلا حارس توقيعي كلها عامة/آلية بالتصميم (login/register/logout، cron×3 بسر ثابت، shopify HMAC، plans/config/stats/testimonials/healthz، support/info) أو موثقة؛ كل db.get/where-id في 41 راوتراً محكوم بtenant أو platform-admin (تحقق آلي AST+regex) |
| **Webhook** | مسار واحد لفيسبوك (`/webhook`) بتوقيع HMAC-256 مقارنة زمنية، رفض مغلق عند غياب السر (401 حي)؛ لا صدى verify إلا عبر التحقق (hub_challenge بعد مطابقة الثابت)؛ `/api/webhook/check` يقلب السر `***` |
| **الأسرار في الردود** | config العام allowlist فقط؛ admin config يقلب الأسرار (••••+آخر4) ويرفض صدى القناع؛ setup-status بولياني فقط |
| **الترويسات** | حية ومكتملة على النطاقين (تحقق curl أعلاه) — بما فيها HSTS preload على api |
| **CSRF** | ثلاث طبقات: Origin exact + double-submit (403 حي بلا/بمزيف) + SameSite — مع إعفاءات مبررة لآلي-لآلي فقط |
| **i18n/RTL injection** | لا مسار حقن جديد: كل القيم تمر JSON→React (escaped) أو PDF (escaped)؛ إساءة bidi المتبقية عرضية (مجال D3 الموثق في v14) — لم أجد توليد HTML من قيم عربية في الخلفية |
| **Fernet** | فصل مفاتيح إنتاجي إلزامي (FERNET≠SECRET) + قراءة مزدوجة موروثة موثقة «أزل بعد إعادة تشفير الكل» — انظر L4 لصلابة القيمة |
| **رفع الملفات** | type+magic bytes عبر إعادة ترميز Pillow، 5MB، أسماء عشوائية 96-bit، بُعد أقصى 1600 — المحتوى الناتج JPEG دوماً (لا polyglot) |

## 3) ملاحظات عابرة (لا تُعد إيجادات)

1. **WS ?token= fallback** (app/ws.py:42) — معروف وموثق منذ v14-E2 (الترويسة أولاً)؛ يبقى كإرث عملاء.
2. **D13-F1** — الربط المزدوج لصفحة مربوطة يرد 500 خام (قيد `uq_botstate_key_value` يمنع السرقة/DoS عبر الربط المتقاطع — البنية سليمة؛ بقيت رسالة 409).
3. **تعداد أسماء في register** («موجود مسبقاً») — مقصود UX؛ مسار oracle المستقل أُزيل في v12.
4. **حد لكل-IP خلف بروكسيات مشتركة** — موثق في `.env.example` (SMARTBOT_MUTATE_RATE_LIMIT قابل للضبط)؛ على Vercel قد يتقاسم المستخدمون دلو IP واحد → إغلاق متبادل محدود النافذة.
5. **`img-src https:` في CSP** — يسمح صوراً خارجية (تتبع خصوصية بسيط عبر إيصالات/شعارات) — غير حرج.
6. **login يتصل بقاعدة الحدود بلا try** (auth.py:130) — انقطاع DB يعطي 500 على الدخول بدل 429/تخطٍّ (توافرية لا أمن).

## 4) خطة الأولويات المقترحة لجولة التنفيذ (E)

1. **فوراً (قبل أي دفع):** تدوير Neon/SECRET_KEY/FERNET_KEY + تنقية تاريخ git (H1) — لا يتطلب كوداً تطبيقياً.
2. **E1:** قفل `_ALLOW_UNVERIFIED` إنتاجياً (M1) + سقف change-password لكل حساب (M4) + تحقق صلاحية FERNET + رفض التوكن الخام في shopify (L4).
3. **E2:** حل DNS في `_assert_safe_image_url` + مهلة/سقف في `_gemini_vision` (H2).
4. **E3:** فصل uploads عن mount العام (M2) + إزالة مجدولة لـ `?token=` (M3).
5. **E4:** CSP bot-domain (L1) + سقوف الأطوال (L2) + حدود diagnostics (L3) + تهرّيب LIKE (L5).

## 5) أدلة الاستنساخ

```bash
# H1 — استرجاع الأسرار من التاريخ (محلي فقط):
git -C SmartBot show d7e5d8db:fb_dashboard/.env
git -C SmartBot log --all --oneline -- fb_dashboard/.env        # ~100 التزام
# H2 — نقطة الفحص مقابل نقطة الجلب:
rg -n "_assert_safe_image_url" SmartBot/fb_dashboard/ai_service.py
# M1 — الوضع غير المتحقق:
rg -n "_ALLOW_UNVERIFIED" SmartBot/fb_dashboard/runner.py SmartBot/fb_dashboard/app/telegram.py
# تحقق حي (قراءة فقط) — كلها 401/403 كما هو متوقع
```

— انتهى تقرير D6 · جولة v15 —
