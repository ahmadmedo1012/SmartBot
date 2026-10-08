# v17-E-B1 — صندوق الوارد: إصلاح 422 القالب + mark-read (INBOX-TEMPLATES) — تسليم

**Task ID:** v17-E-B1 · **الوكيل:** E-B1 (وكيل تنفيذ، جراحي، لا وكلاء فرعيين)
**الملكية الحصرية المنفَّذة:** `fb_dashboard/routers/templates_routes.py` · `fb_dashboard/routers/inbox.py` · `tests/test_v17_inbox_templates.py` (جديد)
**المصادر:** خطة v17 §E-B1 (البنود 1-3) · `audit-reports/v17-D5-dead-controls.md` (P0-F1: زر «حفظ قالب جديد» يفشل 422 في 100% من المحاولات) · `audit-reports/v17-D10-data-ux.md` (M3: عدّاد غير المقروء لا يُصفَّر)
**الوضع:** منفَّذ كاملًا — 3/3 بنود · بوابات خضراء (اختبارات الملكية 8/8 · الجناح الكامل 861/861 · ruff نظيف).

---

## 1) الملخص التنفيذي

| # | المهمة | الحالة | الدليل |
|---|---|---|---|
| 1 | إصلاح 422 القالب: POST/PUT /api/templates يقبل **JSON وForm معًا** | ✅ منفَّذ | §2 — `TemplateCreate` (Pydantic) + `_template_payload()` بفحص content-type · العقد القديم (Form) محفوظ بايت-ببايت |
| 2 | `POST /api/inbox/conversations/{id}/read` يصفّر unread ويعيد الإجمالي | ✅ منفَّذ | §3 — `inbox_mark_read` · عزل مستأجر (404) · `ok({"unread": n})` |
| 3 | اختبارات pytest جديدة (أ/ب/ج/د) | ✅ 8 اختبارات خضراء | §4 — `tests/test_v17_inbox_templates.py` على fixtures `v10_seed` (sqlite ذاكرة) |

**بوابات التسليم (أدلة حرفية):**

```
$ DATABASE_URL="sqlite+aiosqlite:///:memory:" SECRET_KEY=test-secret CRON_SECRET=test-cron-secret FB_ACCESS_TOKEN=test-token FB_PAGE_ID=0 .venv/bin/python -m pytest tests/test_v17_inbox_templates.py -q
8 passed, 31 warnings in 2.85s

$ DATABASE_URL="sqlite+aiosqlite:///:memory:" SECRET_KEY=test-secret CRON_SECRET=test-cron-secret FB_ACCESS_TOKEN=test-token FB_PAGE_ID=0 .venv/bin/python -m pytest tests/ -q --tb=no 2>&1 | tail -3
861 passed, 1526 warnings in 145.26s (0:02:25)

$ .venv/bin/ruff check fb_dashboard/routers/templates_routes.py fb_dashboard/routers/inbox.py
All checks passed!
```

(إضافة: `ruff check tests/test_v17_inbox_templates.py` → `All checks passed!`)

الجناح الكامل أخضر بالكامل (861/861) رغم عمل وكلاء متوازيين على ملفات أخرى في نفس الشجرة (facebook_routes · notifications · onboarding · telegram_config · users + واجهات أمامية) — لا تعارض، ولا فشل خارج ملكيتي.

---

## 2) إصلاح 422 القالب — POST/PUT /api/templates يقبل JSON وForm معًا (D5-F1 / P0)

### 2-أ) العيب الجذري (كما وثّقه D5)

الواجهة الحية (`dashboard/tools/page.tsx:42-49`) ترسل `JSON.stringify({name, text, category})` عبر `apiFetch` (و`csrf-client.ts` يضبط `Content-Type: application/json`)، بينما الخادم كان يعلن:

```python
# قبل (templates_routes.py:30-32) — 422 أبديًا لكل محاولة من الواجهة
async def create_template(name: str = Form(...), text: str = Form(...), category: str = Form("general"),
                          shortcut: str = Form(""), ...):
```

FastAPI يرد 422 قبل دخول الدالة لأن مفتاح JSON واحدًا لا يُشبع أي `Form(...)`. النتيجة الموثَّقة: **مستحيل إنشاء/تعديل قالب من الواجهة إطلاقًا** — بينما الصفحة الشقيقة autoreply (URLSearchParams) تنجح، فبدا العطل «عشوائيًا» للمستخدم.

### 2-ب) الإصلاح — عقد مزدوج بجهاز استقبال واحد

`fb_dashboard/routers/templates_routes.py`:

```python
class TemplateCreate(BaseModel):
    name: str
    text: str
    category: str = "general"
    shortcut: str = ""

async def _template_payload(request: Request) -> TemplateCreate:
    ctype = (request.headers.get("content-type") or "").lower()
    if "application/json" in ctype:
        data = json.loads(await request.body() or b"{}")   # + حراسة JSONDecodeError/dict
    else:
        data = {k: v for k, v in (await request.form()).items()}
    return TemplateCreate(**data)                          # + حراسة ValidationError → 422 عربي
```

- **POST** و**PUT** كلاهما صار `async def ...(request: Request, ...)` يستهلك `_template_payload(request)` — نفس المعاملة المزدوجة للاثنين كما طلبت الخطة («طبّق نفس الشيء على PUT» — PUT كان Form-only بنفس النمط).
- **فحص content-type** يقرر المسار: JSON يذهب للنموذج، وform/multipart يمر عبر `request.form()` فيحافظ على العقد القديم **بايت-ببايت**: غياب `category` في Form = الافتراضي «general» (كما كان `Form("general")`)، وغيابه في JSON مع إرسال قيمة فارغة `""` يُخزَّن فارغًا (سلوك JSON الصريح نفسه قبل التحويل).
- **الأجسام الفاسدة** (JSON غير صالح / ليس كائنًا / حقل إلزامي غائب) ترد **422 عربيًا** — عائلة `broadcasts._json_body` نفسها، لا 500 خام:
  - `"قيمة غير صالحة: جسم الطلب ليس JSON صالحاً"`
  - `"قيمة غير صالحة: جسم الطلب يجب أن يكون كائن JSON"`
  - `"قيمة غير صالحة: الحقلان 'name' و 'text' مطلوبان"`
- **الاحترام الحرفي للقيود:** `ok()` من `_responses` في كل المسارات · `tenant_id=current_user._tenant_id` في الإنشاء والاختيار (والتصفية في PUT/DELETE) · `require_role("editor")` كما كان بلا تغيير · `get_current_user` في list كما كان.
- عقد الاستجابة الموحد محفوظ: `{"success": True, "data": {"id": t.id}}` — لا مفاتيح شقيقة (اختبار §C يثبته حرفيًا).

### 2-ج) لماذا هذا التصميم وليس Form اختياريًا أو Pydantic-only؟

- `Body(..., embed)` أو Form اختياري واحدًا لا يمدّ الجسر بين الوسيطين بلا شروط خفية؛ قراءة `request` مباشرة بفحص content-type هي النمط المعتمد أصلًا في الكود نفسه (`broadcasts._json_body`) — اتساق عائلة لا ابتكار.
- Pydantic-only (حذف Form نهائيًا) كان سيكسر عملاء URLSearchParams القدامى (نمط autoreply الحي في الواجهة) — التحويل يجب أن يكون **إضافة** لا كسرًا: اختبار [ب] يثبت أن Form ما زال ينجح بالضبط كما قبل.

---

## 3) mark-read — `POST /api/inbox/conversations/{conversation_id}/read` (D10-M3)

`fb_dashboard/routers/inbox.py:250-283` (بين `inbox_messages` و`inbox_delete_conversation` — ترتيب المسار قبل `/{conversation_id}` DELETE لا يتعارض لأن المسار الفرعي `/read` مميز):

```python
@router.post("/api/inbox/conversations/{conversation_id}/read")
async def inbox_mark_read(conversation_id: str, db=Depends(get_db),
                          current_user: User = Depends(get_current_user)):
```

- **الأعمدة من models.py كما وُجدت:** `Conversation.unread_count` (Integer default 0) · `Conversation.fb_conversation_id` (المعرف الخارجي الذي تستخدمه الواجهة في `it["id"]` من inbox_list) · `Conversation.tenant_id`. التصفير: `row.unread_count = 0` ثم `commit` — **شرطي** (`if row.unread_count:`) فالطلب **idempotent** ولا يفتح معاملة كتابة عبثًا لقراءة متكررة.
- **الاستجابة:** `ok({"unread": <إجمالي غير المقروء للمستأجر بعد التصفير>})` عبر `SELECT COALESCE(SUM(unread_count), 0) WHERE tenant_id=...` — الدمج محصور بمستأجر المستخدم (لا يرى محادثات غيره)، و`coalesce` يحمي صفوف NULL القديمة. بهذا تُحدّث الواجهة عدّاد الشارة بجولة واحدة (عقد E-B1 → E-F1).
- **عزل المستأجر:** الاستعلام الأول نفسه `WHERE tenant_id == current_user._tenant_id AND fb_conversation_id == ...` — محادثة مستأجر آخر = **404 «المحادثة غير موجودة»** ولا كتابة عابرة أصلًا (اختبار [د] يثبت أن عدّاد الغير لم يُمس).
- **نمط المصادقة:** `get_current_user` (viewer كافٍ — القراءة حدث سلبي هو نفسه ما يصفّر الشارة) بنفس `db=Depends(get_db)` المستخدم في مسارات الملف الشقيقة — لا اندماج مع `_get_inbox_fb` (المسار DB-only، لا Graph، لا شبكة).

---

## 4) الاختبارات — `tests/test_v17_inbox_templates.py` (جديد، 8 اختبارات)

على fixtures الحزام القياسية من `tests/conftest.py` (`v10_world`/`v10_seed` — sqlite ذاكرة + تطبيق حقيقي + `httpx.AsyncClient` على ASGITransport، نفس نمط ملفات v15) — صفر نداء Graph، صفر شبكة:

| الاختبار | ما يثبته |
|---|---|
| `test_template_create_json_body_succeeds` | **[أ]** JSON (جسم الواجهة الحية) → 200، صف يُنشأ بختم `tenant_id` المنشئ — العطل الأصلي P0 |
| `test_template_create_form_body_succeeds` | **[ب]** Form/URLSearchParams يظل 200 — التوافق الخلفي محفوظ (`category` غائب = «general»، `shortcut` يُخزَّن) |
| `test_template_update_accepts_json_and_form` | PUT بالمزدوج نفسه (JSON ثم Form) + قالب مستأجر آخر → 404 (العزل لم يتراجع) |
| `test_template_create_missing_required_field_422_arabic` | JSON بلا `text` / Form بلا `name` → 422 عربي «قيمة غير صالحة» + صفر صفوف جزئية |
| `test_mark_read_zeroes_unread_and_returns_tenant_total` | **[ج]** conv-a-1(3)+conv-a-2(2)+conv-b-1(5 لمستأجر آخر): قراءة a-1 → قاعدةً 0 والجيران لم يُمسّوا، والاستجابة `{"unread": 2}` حصرًا (B مستبعد) + idempotency + التصفير الأخير → 0 |
| `test_mark_read_cross_tenant_conversation_404` | **[د]** محادثة مستأجر آخر → 404 وعدّاده يبقى 4 (BOLA حارس) |
| `test_mark_read_missing_conversation_404` | محادثة غير موجودة → 404 |
| `test_ok_envelope_shape_exact` | الغلاف `{success, data}` **حصرًا** للمسارين الجديدين (unwrapApi يرمي المفاتيح الشقيقة) |

كل تأكيدات القاعدة (التصفير الفعلي، ختم المستأجر، عدم تسرب الكتابة) تُقرأ من قاعدة الاختبار مباشرة (`world.sf()`) لا من الاستجابة — «صدق القاعدة» لا «صدق الرد».

---

## 5) نطاق خارج الملكية (مُبلَّغ، لم يُمس)

- **ربط الواجهة بـ mark-read** (نداء POST عند فتح محادثة + تحديث الشارة من `data.unread`): ملكية messages/page.tsx عند وكيل الواجهة **E-F1** — عقد الاستجابة مصمَّم له تحديدًا (`ok({"unread": n})` بجولة واحدة). الواجهة اليوم ما زالت تعرض الشارة من `unread_count` فقط.
- `fb_dashboard/routers/facebook_routes.py` و`notifications.py` و`onboarding.py` وغيرها: فيها تعديلات وكلاء متوازيين (E-B3/E-F2) — لم أقرأها إلا للسياق، ولم ألمس سطرًا.

---

## 6) إغلاق

البندان الخلفيان لخطة E-B1 منفَّذان ومختبران على الحقيقة (JSON الواجهة الحية بالضبط، وقاعدة القراءة/التصفير مباشرة)، والعقد القديم محفوظ بالدليل (اختبار [ب] + 861/861 في الجناح الكامل). الخطوة التالية الوحيدة لرؤية الأثر على الشاشة: استهلاك E-F1 للمسار في messages/page.tsx.
