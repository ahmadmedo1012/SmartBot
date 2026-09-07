# تقرير التدقيق D7 — جودة الاختبارات نفسها (جولة v15)

**الوكيل:** D7 (تشخيصي — تدقيق اختبارات، لا كود تطبيق)
**التاريخ:** 2026-09-07 · **الأساس:** main @ 558623b3 (v14 مكتملة، شجرة نظيفة)
**النطاق:** tests/ (48 ملف اختبار + conftest مزدوج + pytest.ini) · fb_dashboard/frontend (vitest 25 ملفاً/210 اختبارات) · e2e المحاكاة (8 specs + helpers + playwright.sim.config.ts + سكربت البطارية) · CI/gate_all

**التحقق الحي:** شُغّل جناح pytest كاملاً في venv منشأ من `requirements.txt` فقط (محاكاة CI):
`623 passed, 2 skipped, 910 warnings in 80.57s` — التخطيان: `role-summary 403-skip` و`importorskip weasyprint`.
(تقرير v14 قال «624+1» — الفرق: weasyprint كان مثبتاً في بيئة المنسّق لكنه ليس في requirements → غير قابل للاستنساخ — انظر D7-F5).

---

## 0) الملخص التنفيذي

| الفئة | العدد | أبرز |
|---|---|---|
| حرجة | 3 | ادعاءات DB في البطارية غير مُنفَّذة أبداً (checkClaim لا يفشل شيئاً) · اختبار cooldown في e2e فارغ منطقياً · حارس PDF off-loop معطّل في CI دائماً (weasyprint غائب من requirements) |
| عالية | 4 | مرساة «الفواتير تعكس الاشتراك» = طول نص >200 · سطح DELETE شبه بلا اختبارات (users/tenants = صفر) · skip شرطي مخفي يحوّل انحدار الصلاحيات إلى تخطٍّ صامت · مرساة bot_logs تمر بصفر سجلات جديدة |
| متوسطة | 10 | مراسٍ ضعيفة (KPI/OR/body-truthy) · SSE مرساة اختيارية · تقديس 500 (p06) وسلوك الإلغاء (p04) · رقعة CSRF العالمية · التجديد بلا دلالة · مواصفات e2e خارج البطارية لا تعمل في أي بوابة · 50 sleep ثابت |
| منخفضة | 3 | os.chdir على مستوى الوحدة · تعطيل سقف الميدل‌وير في الجناح · asserts ناعمة متفرقة |

**خلاصة الحكم:** بنية الجناح الخلفي **صحية ومحترمة** (عزل hermetic حقيقي، CI يشغّل الأمامي+العكسي، لا xfail/skip markers متبقية، اختبارات v14 الجديدة عميقة). الواجهة (vitest) **عميقة وسلوكية** لا مجرد رندر. الخلل الحقيقي متركّز في **طبقة e2e المحاكاة**: نمط «سجّل ولا تُنفّذ» للادعاءات يجعل البوابة الخضراء أضعف مما تبدو، وعدة مراسٍ تمر لسبب خاطئ.

---

## 1) حرجة — CRITICAL

### D7-F1: ادعاءات DB في بطارية المحاكاة لا تُفشل أي شيء (55 موقع استدعاء، صفر إنفاذ)
**الشدة:** حرجة · **النمط:** اختبار ينجح لسبب خاطئ (نظامي)

- `fb_dashboard/frontend/e2e/sim/helpers/db-claims.mjs:126-154` — `checkClaim` ينفّذ الاستعلام، يقيّم المسند، يسجّل `{ok, actual}` في JSONL… و**يعيد الصف فقط**. الأخطاء نفسها تُبتلع: `catch (e) { error = String(e) }` ثم تسجيل — بلا رمية.
- كل المواصفات تستدعيه كعبارة بلا `expect` على الناتج — مثال `sim-p02:69`:
  ```ts
  checkClaim(P, 'p02-tenant-created', 'SELECT ... FROM tenants WHERE id=...', [], (rows) => ({ ok: ..., actual: rows[0] }), '...')
  // لا expect — لو ok=false يستمر الاختبار أخضر
  ```
- سكربت البطارية يحسب الحمراء **ويطبعها فقط** ثم يخرج بـ PW_EXIT: `scripts/v14_sim_local_battery.sh:157-180`:
  ```bash
  if [ "${red:-0}" -gt 0 ]; then echo "الادعاءات الحمراء (للمراجعة):"; grep '"ok": *false' ... | head -10; fi
  ...
  if [ "$PW_EXIT" -eq 0 ]; then echo "البطارية خضراء بالكامل ... — PASS"; fi
  ```
- **النتيجة:** انهيار عقد DB (tenant ليس PAID بعد الموافقة، التوكن غير مسوَّد، Fernet غير مشفّر، الإيصال غير ملحق) يمر كبطارية خضراء. «55 خضراء + 1 finding» في v14 كان بقراءة بشرية للتقرير، لا بوابة.

**الإصلاح المقترح:** (أ) `checkClaim` يرمي عند `ok=false` ما لم يكن الادعاء في allowlist للـ findings الموثقة (R3/D13-F1)، أو (ب) كحد أدنى: السكربت يضيف `red > 0 → exit 1` (بعد استثناء findings). خيار (أ) يجعل كل spec قابلاً للتشغيل المنفرد بصدق.

### D7-F2: اختبار cooldown في p08 فارغ منطقياً — ينجح دائماً
**الشدة:** حرجة · **النمط:** assert يمر بالبديهة (vacuous)

`fb_dashboard/frontend/e2e/sim-p08-bot-customer.spec.ts:218-237`:
```ts
const repliesForSender = Number(queryScalar("SELECT count(*) FROM replies WHERE commenter_name=? AND created_at > ...", ['فاطمة']) || 0)
...
expect(repliesForSender, `ردود فاطمة = ${repliesForSender} (لا تكرار)`).toBeLessThanOrEqual(1)
```
في بيئة المحاكاة إرسال Graph **يُرفض دائماً** (توكن زائف — قيد R3 الموثق في رأس الملف نفسه) → صفوف `replies` لا تُكتب أبداً → `repliesForSender = 0` دائماً → الاختبار لا يمكن أن يفشل حتى لو انكسر cooldown كلياً. تغطية cooldown الحقيقية موجودة فقط في pytest (اختبار idempotency عبر call-count في `tests/test_v14_webhook_multi.py` — جيد).

**الإصلاح المقترح:** إما قلب الخطوة لقياس ما هو حتمي (كلا التعليقين محفوظان + `replied_by_bot=0` موثق R3) وحذف وهم «التحقق من عدم التكرار»، أو تمكين وضع `SIM_FAKE_GRAPH` في الخلفية المحلية للبطارية (FB client مزيّف ينجح الإرسال) ليصبح الاختبار حقيقياً.

### D7-F3: حارس «PDF خارج حلقة الأحداث» معطّل في CI دائماً (weasyprint ليس في requirements)
**الشدة:** حرجة (لثقة CI) · **النمط:** إنذار بارد

- `tests/test_v14_engines.py:542`: `weasyprint = pytest.importorskip("weasyprint")`
- `requirements.txt` لا يحوي weasyprint (تحقق مباشر — grep بلا نتائج)، و`.github/workflows/ci.yml:46` يثبّت requirements فقط → الاختبار **يتخطى دائماً في CI وفي أي بيئة مستنسخة من الملفات**. تحققت حياً: تخطيه ظهر في تشغيلي (`could not import 'weasyprint'`).
- هذا حارس إصلاح v14-E2 (تجميد حلقة الأحداث أثناء توليد PDF) — لا يعمل في CI إطلاقاً.
- ملاحظة: المكتبة اختيارية في الإنتاج (fallback fpdf2 في `pdf_reports_engine.py`) لكن الاختبار يستهدف مسار weasyprint نفسه.

**الإصلاح المقترح:** إضافة `weasyprint` إلى requirements (المحرك يستخدمه فعلاً في الإنتاج للحالة المفضلة) أو إنشاء `requirements-dev.txt` يثبّته CI، أو إعادة كتابة الاختبار ليعمل ضد محرك مزيف بلا المكتبة (الخاصية المقيسة هي to_thread وليس weasyprint ذاته).

---

## 2) عالية — HIGH

### D7-F4: سطح DELETE شبه بلا اختبارات — حذف المستخدم/المستأجر = صفر
**الشدة:** عالية · **النمط:** فجوة تدفق حرج (الحذف من قائمة الـ15)

grep شامل لـ `.delete(` في tests/: **نداء HTTP واحد ثابت** (`/api/config` في test_v10_security:633) + 9 نداءات f-string. المسارات الحاملة DELETE في الكود: 21 نقطة. المختبر HTTP-ياً: flows، sequences(+steps)، subscribers-tags، tags، telegram approvers/broadcast-targets، inbox conversation-tags. **غير المختبر إطلاقاً:**
- `DELETE /api/users/{user_id}` — `fb_dashboard/routers/users.py:69` (حذف مستخدم!)
- `DELETE /api/admin/tenants/{tenant_id}` — `fb_dashboard/routers/admin_routes.py:348` (حذف مستأجر!)
- و: rules، offers، templates، calendar، comments، posts، campaigns، scheduled-posts، reports/schedules، inbox conversations

انحدار في حذف المستأجر (تسريب بيانات، عدم تصفية/تتالي، BOLA) لا يلتقطه أي اختبار.

**الإصلاح المقترح:** اختباران موجبان + سالبان (عزل مستأجر/صلاحيات) على users/tenants كحد أدنى في v15 (E-wave)، ثم رفع البقية تدريجياً أو ربطها بمسح عقود.

### D7-F5: مرساة «الفواتير تعكس الاشتراك المفعّل» = طول النص > 200 حرفاً
**الشدة:** عالية · **النمط:** مرساة مهشمة (يطابق كل شيء تقريباً)

`sim-p02-new-subscriber-wallet.spec.ts:303-309`:
```ts
test('19-20. لوحة التحكم والفواتير والرسائل ببيانات حقيقية', async () => {
  await page.goto('/dashboard/billing'); await page.waitForTimeout(2500)
  const billText = await page.locator('body').innerText()
  expect(billText.length, 'صفحة الفواتير حيّة').toBeGreaterThan(200)  // ← كل شيء يمر
```
اسم الخطوة يدّعي انعكاس الاشتراك المفعّل؛ الـassert يمر مع أي رندر (حتى صفحة خطأ عربية تتجاوز 200 حرفاً). لا تحقق من المبلغ/التاريخ/حالة الفاتورة ولا ادعاء DB على جدول الفواتير.

**الإصلاح المقترح:** `expect(billText).toContain(<اسم الخطة/المبلغ>)` + checkClaim على صف الفاتورة (subscription_payments للمستأجر) — أو ربط بنص حقيقي من API `/api/payments/...`.

### D7-F6: skip شرطي مخفي يحوّل انحدار بوابة الصلاحيات إلى تخطٍّ صامت + تبرير نصف حقيقي
**الشدة:** عالية · **النمط:** skipif مخفي

- `tests/test_track_a_response_shape.py:83-84` و`tests/test_v12_contract.py:75-76`:
  ```python
  if r.status_code == 403:
      pytest.skip(f"{path} requires platform-admin (covered in test_security_hardening)")
  ```
  لو انحدرت نقطة نهاية من 200 إلى 403 لمستخدم عادي (انحدار بوابة صلاحيات) → الاختبار **يتخطى بدل أن يفشل** والجناح يبقى أخضر (مع skip إضافي لا يُلاحظ).
- مثال حي: `/api/team/role-summary` هو الـ«1 skipped» في الجناح الآن. والتبرير «covered in test_security_hardening» **نصف حقيقة**: الملف يغطي الجانب السالب فقط (403 لغير مسؤول المنصة — `test_security_hardening.py:128-131`)؛ العقد الموجب (200 + مظروف ok() لمسؤول المنصة) غير مغطى في أي ملف.
- تاريخياً نفس الملف علّم 404 كفشل صريح (تعليق السطر 77-79) — ال403 لم يُعامل بنفس الصرامة.

**الإصلاح المقترح:** فشل وصري بدل skip («endpoint regressed to 403 — gate moved»)، أو parametrize بعميل مسؤول منصة يغطي العقد الموجب، مع الاحتفاظ بقائمة استثناء موثقة.

### D7-F7: مرساة bot_logs تمر حتى لو لم يُكتب سجل webhook واحد جديد
**الشدة:** عالية · **النمط:** مسند بديهي

`sim-p08-bot-customer.spec.ts:182-199`:
```ts
for (let i = 0; i < 7; i++) { await page.waitForTimeout(3000); after = Number(queryScalar(...)); if (after > before) break }
checkClaim(..., () => ({ ok: after >= before, ... }), '≥1 بعد أحداث المحاكاة', ...)
expect(after, ...).toBeGreaterThanOrEqual(before)
```
`after >= before` يتحقق دائماً (عدّاد لا ينقص) — لو توقف تسجيل webhook في bot_logs كلياً يبقى الاختبار أخضر بعد انتظار 21 ثانية بلا داعٍ.

**الإصلاح المقترح:** `after > before` (دفعة monitor تكتب فعلاً بعد أحداث كافية — الأمر يحتاج ضبط عدد الأحداث قبل العتبة)، أو عدّاد قبل/بعد بعدد أحداث محدد سلفاً.

---

## 3) متوسطة — MEDIUM

### D7-F8: مرساة KPI للوحة تطابق أي شيء
`sim-p02:280`: `expect(await page.locator('main, [class*="card"]').count()).toBeGreaterThan(0)` — أي عنصر main أو أي class يحوي «card». لا تحقق لقيم KPI (اشتراك/رصيد). **الإصلاح:** مرساة على نص/قيمة فعلية (اسم الخطة أو «PAID» أو عدّاد رسائل).

### D7-F9: مرساة OR في فواتير p04 تمر دائماً
`sim-p04:235`: `expect(billText.includes('قيد الانتظار') || billText.includes('ليبيانا')).toBeTruthy()` — «ليبيانا» سلسلة ثابتة في قسم أساليب الدفع بصفحة الفواتير → الشرط محقق بغض النظر عن ظهور الشحنة. **الإصلاح:** إسقاط فرع «ليبيانا» أو تقييده بنطاق عنصر الشحنة.

### D7-F10: خطوة leads = «الجسم فيه نص»
`sim-p08:293`: `expect(await page.locator('body').innerText()).toBeTruthy()` — تمر حتى مع صفحة خطأ مرندرة. (مقبولة كـ smoke لو سُمّت كذلك؛ خطرة وهي آخر ضامن في خطوة CRM R3.)

### D7-F11: مرساة SSE اختيارية — تراجع قناة SSE غير مرئي
`sim-p02:219-250`: `Promise.race([sseP, timeout→null])` ثم `if (sse) { expect(...) }` — لو لم تفتح قناة SSE أبداً يبقى الاختبار أخضر عبر نص «في انتظار تأكيد الدفع» (المسار المزدوج poll مقصود تصميماً — dec-R6). لكن أي قناة نجحت **لا يُوثَّق** (لا claim لـ sse!==null) → تمييز «SSE حي» عن «poll أنقذ الموقف» مستحيل بعد التشغيل. **الإصلاح:** تسجيل claim وصفي `path=sse|poll` (بلا فشل) ليتحول لقياس قابل للمراقبة.

### D7-F12: تقديس 500 في p06 (D13-F1) بلا أجل انتهاء
`sim-p06:65-69`: `expect([500, 409]).toContain(r.status)` — مقصود وموثق بامتياز (رأس الملف + SIM_STRICT_409=1 جاهز)، لكن: (1) لا TTL على القبول — البطارية قد تبقى خضراء بـ500 إلى الأبد، (2) لا اختبار pytest خلفي يثبّت عقد 409 بعد الإصلاح (سيُضاف مع E-wave) — والتعليق يعد به. **الإصلاح:** قلب SIM_STRICT_409=1 افتراضياً فور إغلاق D13-F1 في v15 + إضافة pytest موجب (409 + عربية).

### D7-F13: تقديس سلوك الإلغاء المشبوه في p04
`sim-p04:9-15` يوثّق كعقد: «قرار cancelled يضبط users.subscription_status=REJECTED فقط بينما يبقى tenants PAID». إلغاء دفعة pending **ثانية** يعلم مستخدماً اشتراكه مفعّل ومؤكد → REJECTED — سلوك غريب على مستوى المنتج، بلا اختبار خلفي مستقل يقرر أنه مقصود. رأس الملف يصف منهجية «السلوك الفعلي هو العقد» بصراحة (منهجية صادقة توثيقياً، لكنها تخلط بين «موثق» و«صحيح»). **الإصلاح:** قرار منتج + اختبار خلفي يثبّت العقد المقصود (الإلغاء يعيد حالة المستخدم أم لا؟) بدل تركه معرّفاً بـ e2e فقط.

### D7-F14: رقعة CSRF العالمية على httpx — دين هيكلي قابل لإسكات الاختبارات السالبة مستقبلاً
`tests/conftest.py:38-56` — monkey-patch لـ `httpx.AsyncClient.__init__` على مستوى العملية كلها: كل عميل يرفق X-CSRF-Token تلقائياً من الكوكي. الاختبارات السالبة الحالية «تتذكر» تحييد الرقعة (`test_v12_observability.py:239` يضع `X-CSRF-Token: ""` صراحة، والتعليق يشير للخطر). أي اختبار CSRF سالب مستقبلي ينسى ذلك سيختبر **الخطأ الخاطئ** (نجاح الحماية وهمياً). أيضاً: التعليق نفسه يقول «بدل تحرير 24 ملفاً» — دين اختباري مؤجل بنيوياً. **الإصلاح:** ترحيل تدريجي للملفات إلى `_csrf_headers` الصريح ثم إسقاط الرقعة؛ أو على الأقل جعل الرقعة opt-out قابلة للتعطيل لكل اختبار.

### D7-F15: «التجديد» بلا دلالة امتداد/منع تكرار
p04 (t7-8) «تجديد» = إنشاء دفعة ثانية + موافقة — الادعاء `count>=2` فقط. لا اختبار (py أو e2e) يثبت أن التجديد **يمدد** فترة الاشتراك أو يمنع اشتراكين متزامنين فعّالين أو يحسب الرصيد المتبقي. فجوة دلالية في أحد التدفقات الـ15. **الإصلاح:** اختبار خلفي: مستأجر PAID + تجديد مُعتمد → تاريخ النهاية امتد بالقدر الصحيح / لا صفان فعّالان.

### D7-F16: مواصفات e2e خارج البطارية لا يعملها أحد + ملفات e2e ميتة
- `smartbot-e2e.spec.ts` (BASE ثابت :8000 — سطح SPA الثابت) و`mobile-nav.spec.ts` و`journey.spec.ts` (أعيد كتابته v14-E6): **لا CI ولا gate_all.sh ولا أي سكربت** يشغلها — تعمل يدوياً فقط. التعفن بهذه الطريقة وقع فعلاً (journey.spec كان ميتاً قبل v14 — موثق في رأسه).
- `tests/e2e/*.mjs` (3 ملفات: e2e_comprehensive/e2e_comprehensive_test/e2e_final) — سكربتات Node قديمة بمسارات `/#hash` من عصر ما قبل Next، **لا مرجع لها في أي مكان** (grep شامل) — كود اختبار ميت يوهم بوجود تغطية.
**الإصلاح:** حذف tests/e2e الميتة، وإدخال journey.spec (على الأقل) في بطارية/بوابة دورية أو توثيق صريح أنها «يدوية الجولات» في decisions-ledger.

### D7-F17: 50 waitForTimeout ثابتة + تهدئة انقطاع الجلسة في p02-t22
- 50 sleep ثابتاً في مواصفات المحاكاة (عدّ دقيق) — بعضها مقبول (استقرار رندر) لكن نحو 20 منها بعد goto مع مراسٍ ضعيفة أصلاً (F5/F8) — تعطي بطءاً وهشاشة زمنية بلا مقابل تحقق.
- `sim-p02:349-362`: إن لم يُرَ زر الخروج → ذهاب لـ/login ودخول جديد صامت («الجلسة قد تنقطع… يوثق كـ finding») — **الـ fallback يخفي الانقطاع**: الخطوة تمر سواء كانت الجلسة حية أو منقطعة، والfinding لا يسجل تلقائياً (موثق v14-session-flicker «لم تُلاحظ في التشغيل النهائي»). **الإصلاح:** تسجيل claim وصفي عند سلوك الـfallback (count of session-recovery) بدل كتمه.

---

## 4) منخفضة — LOW

### D7-F18: أثر عملية عالمي من وحدة اختبار
`tests/test_bot_simple.py:14`: `os.chdir(_dashboard)` عند الاستيراد — يغيّر CWD للعملية كلها لبقية الجلسة (البقية محصّنة بمسارات مطلقة، لكنه لغوٍ وأول من ينكسر عند أول مسار نسبي جديد).

### D7-F19: سقف mutate-rate للميدل‌وير معطّل في الجناح كله
`conftest.py:72`: `SMARTBOT_MUTATE_RATE_LIMIT=100000` — موثق بمبرر مقنع (IP واحدة مشتركة + aiosqlite loop-bound)، و429 على مستوى المسارات مغطى (phase_g:196، security_hardening:235، p07). يبقى أن سلوك الميدل‌وير العام لا يختبر محلياً — يُغطى حياً في p07 (انفجار الدخول 429). مقبول كمقايضة موثقة.

### D7-F20: asserts ناعمة متفرقة
- `tests/test_world_class_v3.py:311`: `assert data["messages"]["total_conversations"] >= 0` — يمر لأي رقم (يحقق وجود المفتاح فقط).
- `tests/test_v12_routers_security.py:309`: `assert r.status_code in (200, 404)` في BOLA — **مخفف**: يليه تحقق فعلي على `ok is False` + عدم الكتابة (جيد)؛ لكن القبول المزدوج يبقى عرضة للتبسيط مستقبلاً.
- `tests/test_v5_depth.py:69`: `in (200, 404)` لاختبار «never-500» — مقصود وموثق بالاسم والغرض.

---

## 5) خريطة التدفقات الحرجة (15)

| # | التدفق | الحالة | الدليل |
|---|---|---|---|
| 1 | تسجيل | ✅ قوي | pytest (radical_v4، v5_depth) + RegisterForm.test (مصفوفة عربية كاملة + 429 lockout) + p02/p03/p06 UI |
| 2 | دخول + 429 | ✅ قوي | phase_g:196 · security_hardening:235 · p07-t7 (أول 429 ≤11) |
| 3 | خروج + تسويد | ✅ قوي | phase_g:182 (401 بعد الخروج) · p02-t22 (مع تحفظ F17) |
| 4 | معالج onboarding | ✅ قوي | phase_e + OnboardingWizard.test (424 سطراً) + p02 t5-10 + p06 |
| 5 | اختيار خطة | ✅ | PlanSelector.test + p02-t11 |
| 6 | إنشاء دفعة (محفظة/مدار/بنك) | ✅ قوي | phase_b + PaymentDialog.test (عقد POST حرفياً) + p02/p04 |
| 7 | شحن + سقف المحفظة | ✅ | phase_b (3 اختبارات سقف) + p04-t5 |
| 8 | رفع إيصال + حراس | ✅ قوي | v14_security (404/424) + p03 t4-7 (raw upload 400×2) |
| 9 | موافقة أدمن | ✅ قوي | C-SEC1 (403 ذاتي) + phase_d + p02-t15 |
| 10 | تفعيل (PAID/رصيد) | ✅ | telegram (approve مرة واحدة) + p02-t18 (PAID عبر claim — لكن انظر F1) |
| 11 | SSE بث الحالة | ✅ خلفياً قوي / ⚠️ e2e مرساة اختيارية | test_v14_sse (raw ASGI driver ممتاز) + F11 |
| 12 | webhook→رد البوت | ✅ خلفياً / ⚠️ e2e | v14_webhook_multi (idempotency عبر call-count) — e2e: R3 + F2 |
| 13 | تجديد | ⚠️ جزئي | p04 ينشئ دفعة ثانية فحسب — بلا اختبار امتداد/منع تكرار (F15) |
| 14 | انتهاء صلاحية | ✅ | phase_b:462 (trial→expired + البوت يستمر) + :488 (paid) |
| 15 | إلغاء | ⚠️ بتحفظ | telegram reject + p04 — العقد المقدَّس مشبوه (F13) |
| + | **حذف** | ❌ **فجوة** | 21 DELETE، المختبر ~6؛ users/tenants = صفر (F4) |

**الحصيلة:** 12 مغطاة بقوة، 2 جزئية (تجديد، إلغاء-بتحفظ)، 1 فجوة صريحة (الحذف).

---

## 6) fixtures والتلوث — التقييم

**إيجابي بامتياز (يستحق التوثيق كمرجع):**
- `conftest.py` الجذري: بيئة hermetic قسرية (SECRET_KEY/CRON_SECRET/DB URL force لا setdefault) — دروس v5§0 مضمنة؛ قاعدة temp-file + StaticPool؛ إعادة تصفير الحالة العامة على حدود الملفات (api_cache، محركات البوت، WS، مسح sqlite3 **متزامن** لدورة rate-limit — تعليق v11 يشرح لماذا فشل المسح القديم بصمت).
- CI يشغّل الجناح **مرتين: أمامي ثم عكسي** (ci.yml:58-62) — بوابة حتمية فعلية.
- `v10_world` function-scope بقاعدة in-memory معزولة لكل اختبار + استعادة dependency_overrides في finally.

**ملاحظات:** (1) الرقعة العالمية httpx (F14). (2) قاعدة الجناح المشتركة temp-file تتراكم بياناتها عبر الملفات — معتمدة على أسماء uuid فريدة، وليست فجوة عملية اليوم. (3) retry مرة واحدة في gate_all.sh (سطر 31-43) لفئة «database is locked» الموثقة v13 — تمويه موثق ومحدود (الثانية تفشل البوابة). (4) 910 تحذيرات (أغلبها SAWarning identity-map) — ضوضاء تستحق ترشيحاً لا إصلاحاً عاجلاً. (5) لا ملف temp-DB نظيف نهاية الجلسة (تنظيف ناقص بسيط).

---

## 7) اختبارات الواجهة (vitest) — التقييم

**عميقة وسلوكية، ليست «يرندر فقط»:**
- `RegisterForm.test.tsx` (306 أسطراً): مصفوفة تحقق عربية كاملة بلا نداء شبكة، قفل 429 بمؤقتات مزيفة، عقد POST حرفياً (trim + credentials + JSON body)، توجيه replace — نموذج يحتذى.
- `OnboardingWizard.test.tsx` (424): تقدم الخطوات 0→4 بأجسام POST الدقيقة + حالات اختبار الاتصال + freshness التوكن (يغطي إصلاح deps).
- `PaymentDialog.test.tsx` (201): آلة حالة الدفع + USSD + التحويل البنكي فوق السقف + عقد POST + بلا شبكة عند خطأ الإدخال.
- مكتبة lib (api/csrf-client/format/usePublicStats/sentry-config): عقود مظروف وحواف.

**الضعف الوحيد الملحوظ:** اختبارات المكونات العرضية (EmptyState/PageHeader/KpiCard/ChartCard/ThemeToggle) تستخدم `not.toBeNull()` على svg — مقبول لمكونات presentation، لكنها لا تضيف تغطية سلوكية (ملاحظة عابرة لا إصلاح إلزامي).

---

## 8) e2e المحاكاة — تلخيص المراسي المهشمة

| المرساة | الموقع | المشكلة |
|---|---|---|
| ادعاءات DB بلا إنفاذ | db-claims.mjs + 55 موقعاً | F1 |
| cooldown ≤1 | sim-p08:237 | F2 — بديهي (replies=0 دائماً) |
| bot_logs `after≥before` | sim-p08:195/199 | F7 — بديهي |
| فواتير p02 طول>200 | sim-p02:308 | F5 — يطابق كل شيء |
| KPI `main,[class*=card]`>0 | sim-p02:280 | F8 |
| فواتير p04 OR «ليبيانا» | sim-p04:235 | F9 — النصف الثاني دائم التحقق |
| leads body truthy | sim-p08:293 | F10 |
| SSE اختياري بلا توثيق قناة | sim-p02:244-250 | F11 |
| [500,409] | sim-p06:68/133 | F12 — موثق (D13-F1) |
| fallback جلسة t22 | sim-p02:349-362 | F17 — يكتم الانقطاع |

**الإيجابي:** p03 (إيصال) وp07 (مهاجم) بمراسٍ ممتازة (حالة HTTP + نص عربي + لا-تسريب + عدّ مستخدمين قبل/بعد). الإعداد (workers=1, retries=0, fullyParallel=false) حتمي صريح. الاعتماد بين المواصفات (p08/p04/p05 على p02) موثق ومحروس بـ test.skip شرطي، مفروض بترتيب أبجدي + workers=1.

---

## 9) الإنذار البارد — الحصيلة

| الاختبار المعطّل | السبب | أين |
|---|---|---|
| `test_pdf_render_runs_off_event_loop` | weasyprint غائب عن requirements → importorskip | F3 — **دائم في CI** |
| `/api/team/role-summary` (param ضمن عقد) | 403→skip مع تغطية موجبة مفقودة | F6 — حي الآن |
| `/api/…` مستقبلاً | نفس نمط 403-skip | F6 |
| `test_next_config_no_static_export` | frontend غائب (skip شرطي بيئة) | ميت عملياً في المستودع (frontend موجود) |
| `xfail ×3` تاريخية (v11) | **أُزيلت فعلاً** — أُصلحت العلل وبقيت التعليقات التاريخية فقط | لا إجراء |

لا يوجد أي `@pytest.mark.skip/xfail` دائم متبقٍ في الجناح الخلفي (تحقق grep) — نقطة نظافة ممتازة.

---

## 10) الإجراءات المقترحة (مرتبة بالأولوية)

1. **(حرج)** إنفاذ الادعاءات: checkClaim يرمي (مع allowlist للـ findings R3/D13-F1) + `red>0 → exit 1` في سكربت البطارية — E-wave واحد صغير.
2. **(حرج)** weasyprint في requirements (أو dev-requirements يثبّته CI) — سطر واحد.
3. **(عالي)** اختبارات DELETE على /api/users و/api/admin/tenants (موجب + BOLA + تسلسل الحذف) + رفع صرامة 403-skip إلى فشل.
4. **(عالي)** إصلاح المراسي الخمس المهشمة في sim (فواتير p02/p04، KPI، botlog، cooldown — قلب الأخير لقياس R3 صادق).
5. **(متوسط)** مع إغلاق D13-F1: SIM_STRICT_409=1 افتراضياً + pytest يثبّت 409؛ واختبار تجديد خلفي؛ وحذف tests/e2e الميتة؛ وتوثيق status المواصفات اليدوية في ledger.
6. **(منخفض)** إسقاط os.chdir من test_bot_simple؛ ترشيح تحذيرات SAWarning؛ مسار لمستقبل الرقعة العالمية CSRF.

---

## 11) منهجية التدقيق

- قراءة كاملة: conftest الجذري + tests/conftest + pytest.ini + vitest.config.ts + playwright.config.ts + playwright.sim.config.ts + ci.yml + gate_all.sh + سكربت البطارية.
- grep منهجي: skip/xfail/importorskip، try/except حول asserts، `in (a,b)` للحالات، sleep، DELETE-coverage، CSRF/500/xfail، not.toBeNull/toBeTruthy في vitest.
- قراءة عميقة: sim-p02/p04/p06/p08 كاملة + p03/p07 جزئياً + helpers (db-claims/session) + RegisterForm/OnboardingWizard/PaymentDialog/payment-status.
- **تشغيل حي**: venv جديد من requirements.txt فقط + pytest كامل (623/2/910w) للتثبت من التخطيات والعدادات.
- عدد الاختبارات المحققة: 625 مجمّعة pytest (479 دالة) · ~211 vitest · 55 checkClaim · 177 expect في sim · 50 sleep.
