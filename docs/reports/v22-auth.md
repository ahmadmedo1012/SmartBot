# تقرير المجال 1 — التسجيل والدخول والصلاحيات (v22، موجة الإصلاح FIX-A)

- **Task ID:** FIX-A · **Agent:** fix-a-auth · **موجة:** الإصلاح (fix wave) + نشر إنتاج + تحقق حي
- **التاريخ:** 2026-09-10 (13:00–13:15 UTC نشرًا وتحققًا)
- **المصدر التشخيصي:** `wave1-findings/W1-D1-auth-roles.md` (موجة التشخيص W1-D1)
- **الإصلاح:** commit **`e6aff106`** — `fix(v22-D1): logout blacklist tz-aware bug on PG + lost audit rows after password ops` — **مُنشر على الإنتاج** (تحقق `data.commit_sha == e6aff106` من `/api/version` بعد ~80 ثانية من الدفع، region iad1)
- **الملفات المعدلة:** `fb_dashboard/routers/auth.py` · `tests/test_v22_logout_blacklist.py` (جديد، 10 اختبارات)
- **حساب الاختبار الحي:** `fixa_5710` (user 45, tenant 44) — أُنشئ عبر API العام؛ كلمة المرور مُدوَّرة إلى `FixA#2026Rotated!` أثناء التحقق من B-2.

---

## ملخص

نطاق المجال 1 (التسجيل، الدخول، الخروج، الأدوار، عزل المستأجرين، التحقق من المدخلات، سجل التدقيق، E2E المتصفح) اختُبر حيًّا على الإنتاج في موجة التشخيص (W1-D1) وعاد بنتيجة **8 PASS + 1 PARTIAL (by-design) + علّتان: B-1 (HIGH) وB-2 (LOW-MED)**. هذا التقرير يوثّق إصلاح العلّتين، النشر، والدليل الحي قبل/بعد — **كل بنود القائمة الآن PASS**.

| # | البند | نتيجة W1-D1 | النتيجة بعد الإصلاح | ملاحظة |
|---|------|-------------|----------------------|--------|
| 1 | التسجيل Register + DB | PASS | **PASS** | مُعاد التحقق حيًّا بحساب `fixa_5710` (user 45 / tenant 44، role=admin، argon2id) |
| 2 | الدخول Login + /api/me + 429 | PASS | **PASS** | دخول ×3 (كوكي، UI، بعد تدوير كلمة المرور) كلها 200 |
| 3 | الخروج Logout + القائمة السوداء | **FAIL (B-1 HIGH)** | **PASS** ✅ | إعادة تشغيل التوكن بعد الخروج → **401 «تم إلغاء الجلسة»** (كانت 200) + صف blacklist يُكتب على PG — انظر §العلل |
| 4 | تغيير كلمة المرور + token_ver | PASS | **PASS** | تدوير حي: ver 0→1، الدخول بالجديدة 200، صف تدقيق موجود (B-2 أُصلح) |
| 5 | مصفوفة أدوار الفريق | PARTIAL (by-design) | **PASS جزئي** | الحارس admin-role + بوابة الخطة (Free=0 مقاعد) مثبتان حيًّا؛ المصفوفة الكاملة محليًا + 78 pytest (كما في W1-D1 — لم تتغير الشيفرة) |
| 6 | عزل المستأجرين BOLA | PASS | **PASS** | لم يُمسّ الكود؛ انحدار صفر عبر test_tenant_isolation و225 اختبار |
| 7 | التحقق من المدخلات | PASS | **PASS** | لم يُمسّ؛ انحدار صفر |
| 8 | سجل التدقيق audit_logs | BUG B-2 | **PASS** ✅ | صف `change_password` (id 215) موجود الآن مع ip/tenant — انظر §العلل |
| 9 | E2E عبر المتصفح | PASS | **PASS** | لقطات W1-D1 (D1-09-*) + لقطات ما بعد الإصلاح `FIXA-01/02` (بلا أخطاء console) |
| 10 | نسيت كلمة المرور | NOT IMPLEMENTED | **موثّق** | كما في W1-D1 — ليست علّة؛ التوصية قائمة (مسار بريد بتوكن لمرة واحدة) |

---

## العلل المكتشفة والإصلاحات

### B-1 (HIGH) — الخروج لم يكن يُبطل الجلسة خادميًا على PostgreSQL

**السبب الجذري:** `routers/auth.py` (السطر ~201 قبل الإصلاح) كان يُدرج `datetime.fromtimestamp(exp, tz=UTC)` — datetime **واعٍ للمنطقة الزمنية** — في `blacklisted_tokens.expires_at` وهو عمود `timestamp without time zone` (ساذج). asyncpg (درايفر الإنتاج Neon/PG) **يرفض** هذا الربينغ بـDataError عند الـcommit، والاستثناء كان مُبتلعًا بـ`except Exception: pass` → **لا صف يُكتب أبدًا على الإنتاج** → التوكن (بما فيه المسروق) يبقى صالحًا حتى 24 ساعة بعد الخروج. SQLite المحلي يقبل القيمتين، فلم يكشفه أي اختبار قديم — نفس فئة العلّة التي أُصلحت في v21 لمزامنة المنشورات (`_parse_fb_time`).

**الدليل قبل الإصلاح (W1-D1، الإنتاج commit 54452f32):**
```
curl -s -H "Cookie: token=<قبل_الخروج>" https://api.smart-link.ly/api/me
# → HTTP 200 + الملف الشخصي كاملًا   (المفروض 401)
SELECT count(*) FROM blacklisted_tokens;   → 0   (بعد عدة عمليات خروج)
```

**الإصلاح (commit e6aff106):**
1. `_logout_expiry_naive_utc(exp)` — تطبيع **naive-UTC** (عقد `TIMESTAMP` في المستودع كله؛ نفس نمط v21: `astimezone(UTC).replace(tzinfo=None)`).
2. **لا ابتلاع بعد الآن:** فشل كتابة الـblacklist → `rollback` + `log.exception(...)` + **500 صادقة** «تعذر إبطال الجلسة على الخادم — يرجى المحاولة مرة أخرى» (مرآة فلسفة honest-503 لنبض الجدولة: عملية «أنجزت ظاهريًا» بينما لم تُنفَّذ = إنذار كاذب). فك التوكن (منتهي/غير صالح) يبقى 200 بالتصميم: لا شيء يُبطل.
3. اختبار محلي يحاكي **عقد asyncpg نفسه** (`_guard_world` يرفض datetime الواعي عند الـcommit) — العطل الذي كان خاصًا بالإنتاج أصبح قابلًا لإعادة الإنتاج محليًا.

**الدليل بعد الإصلاح (الإنتاج commit e6aff106، حساب fixa_5710):**
```bash
# تسجيل → دخول (توكن محفوظ، مقنّع: eyJhbGciOiJI...vT5DJD70) → خروج 200
curl -s -H "Cookie: token=<التوكن_قبل_الخروج>" https://api.smart-link.ly/api/me
{"detail":"تم إلغاء الجلسة"}      → HTTP 401        ✅ (كان 200)
```
```sql
SELECT id, jti, expires_at, pg_typeof(expires_at) FROM blacklisted_tokens ORDER BY id DESC;
-- id=1 | jti=55bdd966463a… | 2026-09-11 13:08:31 | timestamp without time zone   ✅ صف أول في تاريخ الجدول (كان 0 صفوف)
-- id=2 | jti=c68849f80432… | 2026-09-11 13:09:46 | (خروج واجهة المتصفح — نفس المسار)
```
- خروج **واجهة المتصفح** (نفس المسار POST /api/logout) → توجيه إلى `/login` + صف blacklist ثانٍ (id=2) — لقطة `FIXA-02-after-ui-logout.png`، بلا أخطاء console.
- اختبار «الفشل الصامت مستحيل»: كتابة blacklist تفشل (محاكاة انقطاع) → الاستجابة **500** + سجل ERROR بمستوى `fb-api` (اختبار `test_logout_fails_loudly_when_blacklist_write_fails`).

### B-2 (LOW-MED) — صفوف التدقيق تضيع بعد تغيير/إعادة تعيين كلمة المرور

**السبب الجذري:** `log_audit()` هي add+flush فقط، وكانت تُستدعى **بعد** الـ`await db.commit()` الوحيد في `change_password` (auth.py:~433) و`admin_reset_password` (auth.py:~392) بلا commit لاحق → الصف يُرجَع عند إغلاق الجلسة (get_db لا يعمل commit). `AsyncSessionLocal` بـ`expire_on_commit=False` فلا MissingGreenlet — الفقد كان صامتًا صافيًا.

**الدليل قبل الإصلاح (W1-D1):** تغيير كلمة مرور ناجح (200) على الإنتاج → `SELECT * FROM audit_logs WHERE action='change_password'` → **لا صفوف**.

**الإصلاح:** إضافة `await db.commit()` بعد `log_audit` في المسارين — نفس نمط `platform_update_user` في `admin_routes.py` (commit → log_audit → commit): كل كتابة تصمد مستقلة.

**الدليل بعد الإصلاح (الإنتاج، user 45):**
```
POST /api/auth/change-password → 200 {"success":true,"data":{"changed":true}}
```
```sql
SELECT id, action, actor_id, tenant_id, ip, created_at FROM audit_logs WHERE actor_id=45;
-- 212 register | 213 login | 214 login | 215 change_password | tenant 44 | ip مُسجّل  ✅
```
(مسار `admin_reset_password` أثبت بالاختبار المحلي `test_admin_reset_password_writes_audit_row` — صف `reset_password` مع target_id صحيح؛ تعذّر إثباته حيًّا دون حسابَين منصة، والكود المسار واحد الفئة نفسها.)

---

## انحدارات صفرية (Zero Regressions)

- **الجديد:** `tests/test_v22_logout_blacklist.py` — 10 اختبارات (RED-first: 7 فشلت على الكود المعطوب قبل الإصلاح ثم أخضرت بعده): (a) قيمة الإدراج naive-UTC + صف موجود تحت عقد asyncpg، (b) فشل الكتابة → 5xx + سجل ERROR (لا silent-200)، (c) إعادة تشغيل التوكن → 401 «تم إلغاء الجلسة»، (d) توكن منتهي → خروج 200 idempotent بلا صف، (e) صفوف change_password/reset_password في audit_logs، (f) فحص وحدة لـ`_logout_expiry_naive_utc` (3 حالات epoch).
- **الانحدار:** **225 passed / 0 failed** عبر: test_v12_routers_security، test_security_hardening، test_phase_g_security، test_v14_security، test_v16_prod_truth، test_v21_piggyback_beat، test_v15_auth، test_v10_auth_negative، test_v17_telegram_users، test_v8_security، test_v9_security، test_tenant_isolation، test_v12_contract، test_v20_token_type_and_silent_failures.
- `python3 -m ruff check fb_dashboard/routers/auth.py tests/test_v22_logout_blacklist.py` → clean · `scripts/secret_scan.py` → clean (لا أسرار).

## E2E المتصفح (مرجع موجة التشخيص + ما بعد الإصلاح)

- **W1-D1 (lلقطة أصلية للمسار الكامل):** `download/evidence-v22/D1-09-register-page.png` · `D1-09-dashboard-after-register.png` · `D1-09-after-logout-login-page.png` · `D1-09-dashboard-after-ui-login.png` · `D1-09-logout-final.png` · `D1-09-after-logout-redirect.png` · حارس الأدوار: `D1-05-team-admin-role-blocked-ui.png` · `D1-05-team-limit-free-ui.png` · `D1-05-team-page-free-plan.png`.
- **بعد الإصلاح (FIX-A):** `download/evidence-v22/FIXA-01-dashboard-postfix-login.png` (دخول UI بكلمة المرور المُدارة → لوحة التحكم) · `FIXA-02-after-ui-logout.png` (خروج UI → /login) — `agent-browser errors` فارغ، console نظيف، وصف blacklist (id=2) كُتب عبر نفس الطلب.

## الأدوات المستخدمة (بحث GitHub OSS)

راجع `docs/reports/v22-tooling-used.md` (الجدول المشترك). الخلاصة للمجال 1:
1. **نمط القائمة السوداء jti في المنظومة (Redis-based):** بحث GitHub (`fastapi jwt blacklist`، `jwt token blacklist revocation`) يُظهر أن المعيار السائد revocation عبر **jti + مخزن سريع (Redis)** — تصميمنا (jti + جدول PG عبر asyncpg) يطابق النمط وظيفيًا؛ بلا Redis في المنظومة serverless الحالية، والجدول كافٍ لحجمنا (الصفوف تُنظّف عند exp — توصية تشغيلية أدناه).
2. **بديل الترحيل إلى TIMESTAMPTZ:** نمط PRs مثل `google/adk-python#4388` (استخدام `TIMESTAMP WITH TIME ZONE` لـPG) — دُرس ورُفض: عقد المستودع naive-UTC في كل الأعمدة (`_utils.utcnow`) وتغيير عمود واحد يكسر الاتساق؛ التطبيع في الكود هو النمط المتبع (v21).
3. **laurentS/slowapi (★2056) / long2ice/fastapi-limiter (★790):** لحدود المعدل الموزعة — مرتبطة بتوصية S-3 (تقوية حد الدخول) وليست مطلوبة للإصلاح الحالي.

## مخاطر متبقية وتوصيات

1. **S-3 (LOW، سياسة):** حد الدخول 10/60ث لكل IP فقط بلا قفل لكل حساب — التقوية المقترحة (5/15د لكل IP + عدّاد لكل اسم مستخدم) خارج نطاق FIX-A.
2. **S-4 (LOW، UX):** التنقل الجانبي غير مُصفّى حسب الدور للـviewer/editor — الحماية الفعلية 403 من الـAPI (كما وثّق W1-D1).
3. **تشغيلي:** صفوف `blacklisted_tokens` تتراكم حتى انتهاء exp — جدولة تنظيف (DELETE WHERE expires_at < now) ضمن نبض الجدولة أو cron قاعدة البيانات؛ حاليًا الحجم تافه (صفان).
4. **تنسيق موازٍ:** وكيل آخر عدّل `auth.py` (حقل `is_platform_admin` في /api/me — سليم ومضافي) — إصلاحي أُدخل بـstaging جراحي (hunk-t‏ بالـhunk) حتى لا يُدفع عمل الغير ناقصًا؛ الوكيل الآخر مسؤول عن دفعة.
