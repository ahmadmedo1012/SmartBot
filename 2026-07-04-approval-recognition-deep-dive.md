# تقرير تشخيص شامل: عطل عدم التعرف على الموافقة/الرفض

**التاريخ**: 2026-07-04
**المنهجية**: فحص الكود الفعلي على `main` (commit `0cbec60`) — مو تقارير الوكيل الذاتية. تتبعت السلسلة كاملة من `POST /api/payments/claim` → Telegram → `webhook` → `resolveSubscriptionPayment` → SSE → الواجهة الأمامية.

**الخلاصة المباشرة**: فيه **3 أسباب جذرية مستقلة**، وأي وحد منهم لوحده كافي يخلي "الموقع ما يتعرف" على القرار. الإصلاحات المتتالية السابقة (`c24e955` إلى `0cbec60`) عالجت أعراض جانبية (بوت توكن، keyboard delivery) بينما السبب الحقيقي الأكبر ضل بدون لمس. بالإضافة لهيك، فيه **تراجعان أمنيان** انزرعا أثناء محاولات الإصلاح المتكررة.

---

## السبب الجذري #1 (الأهم): مافيش أي حدث "تمت الموافقة" يُرسل للمستخدم أصلاً

بملف `src/lib/subscription-decisions.ts`، فرع `decision === "cancelled"` (الرفض) يسوي:

```ts
eventEmitter.emit("user-event", {
  userId: existing.userId,
  type: "subscription_rejected",
  ...
});
```

لكن فرع `decision === "verified"` (**الموافقة**) — **ما فيه أي `eventEmitter.emit("user-event", ...)` إطلاقاً**. بس `admin-event` (للوحة تحكم الأدمن). يعني حتى لو كل شي تاني بالسلسلة اشتغل 100%، المستخدم الجالس بصفحة `/checkout` بعد ما يوافق عليه الأدمن (من تليجرام أو حتى من لوحة الأدمن بالموقع نفسها — نفس الدالة المشتركة) **ما عنده أي إشارة حية توصله إنه انوافق عليه**. لازم يعمل refresh يدوي للصفحة.

### وحتى لو ضفنا الحدث — الواجهة ما بتسمعه

`src/app/checkout/page.tsx` بالسطر 114-127:

```ts
es.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === "subscription_rejected") {   // ← بس هذا النوع
    setRejected(true);
    ...
  }
};
```

الـ`onmessage` handler يتحقق فقط من `"subscription_rejected"`. ما فيه أي `else if` أو حالة تانية تتعامل مع نجاح/موافقة. حتى لو ضفنا `user-event` بنوع `"subscription_approved"` من الباك-إند، الواجهة حالياً بتتجاهله بصمت.

**الإصلاح المطلوب (جزءين، لازم الاثنين معاً):**

1. بـ`subscription-decisions.ts`، فرع `verified`، أضف بعد الـ`admin-event`:
   ```ts
   if (existing.userId) {
     eventEmitter.emit("user-event", {
       userId: existing.userId,
       type: "subscription_approved",
       message: "تم تفعيل حسابك بنجاح!",
       restaurantSlug,
       timestamp: new Date().toISOString(),
     });
   }
   ```
2. بـ`checkout/page.tsx`، أضف معالجة لهذا النوع الجديد — الأصح إعادة توجيه فوري لـ`/owner` (بدل بس تحديث حالة محلية)، لأن `subscriptionStatus` صار `PAID` فعلياً بقاعدة البيانات:
   ```ts
   if (data.type === "subscription_approved") {
     premiumToast("success", "تم تفعيل حسابك! جاري التحويل...");
     router.push("/owner");
   }
   ```

---

## السبب الجذري #2 (الأخطر هندسياً): `EventEmitter` داخل-العملية ما بيشتغل عبر السيرفرلس

هذا هو السبب اللي على الأغلب خلّى فريق التصحيح يدور بدواير — لأنه مو باغ منطقي بالكود، هو **قيد بنيوي بالمعمارية** بيخلي الميزة تشتغل أحياناً وتفشل أحياناً بشكل عشوائي (بالضبط النمط اللي بيولّد جلسات تصحيح طويلة بدون نتيجة).

`src/lib/events.ts`:
```ts
export const eventEmitter = new EventEmitter();
```

هذا كائن **في الذاكرة، داخل عملية Node.js وحدة فقط**. المشروع مستضاف على Vercel (تأكدت من `.env.prod` — متغيرات `VERCEL`, `VERCEL_ENV`, إلخ). بالاستضافة السيرفرلس:

- `GET /api/user/events/stream` (اتصال SSE المفتوح من متصفح المستخدم) يشتغل جوا instance/عملية معينة، ويضل مفتوح طول ما المستخدم بالصفحة.
- `POST /api/telegram/webhook` (لما الأدمن يوافق) — طلب منفصل تماماً، غالباً بيشتغل بinstance/عملية **تانية** كلياً.

لما الـwebhook يستدعي `eventEmitter.emit("user-event", ...)`، هو عم يعدّل كائن EventEmitter **بعملية مختلفة** عن اللي فاتح عليها اتصال الـSSE. الحدث ببساطة **يضيع بالهوا** — ما وصل لأي مستمع، لأنه مافيش مستمع مسجل على *هذا الكائن بالذات*. هذا ينطبق بنفس القوة على `admin-event` (لوحة الأدمن نفسها كمان ما بتاخذ تحديثات حية موثوقة — فحصت `AdminEventNotifier.tsx` و`api/admin/events/stream/route.ts`، نفس النمط بالضبط).

هذا مو باغ بيصير 100% من المرات — ممكن أحياناً "يشتغل" لو الصدفة خلّت نفس الـinstance (الدافئة/warm) تعالج الطلبين، وهذا بالضبط ليش الظاهرة بدت "أحياناً تشتغل أحياناً لأ" بدل عطل واضح ثابت.

**التوصية**: ما تعتمد على `EventEmitter` داخل-العملية لأي تحديث حي عبر طلبات منفصلة بأي مكان بالمشروع. خيارين:

- **الحل العملي السريع (موصى فيه لهذه الحالة تحديداً)**: بدّل الـSSE لصفحة `/checkout` بـpolling بسيط كل 3-5 ثواني على `/api/auth/me` (أو endpoint خفيف مخصص يرجع بس `subscriptionStatus`) طول ما المستخدم بحالة `pending`. الموافقة على اشتراك حدث نادر الحدوث ومش حساس للزمن الفوري — الـpolling كافي وموثوق 100% بدون أي بنية تحتية جديدة.
- **الحل الشامل (لو تبي تصلح كل ميزات "اللايف" بالمشروع دفعة وحدة — لوحة الأدمن، إشعارات الطلبات، بانر المالك)**: استبدل `EventEmitter` بحل pub/sub عابر للـinstances، زي Redis (Upstash يشتغل منيح مع Vercel) أو خدمة زي Pusher/Ably. هذا أكبر من نطاق تصحيح باغ الموافقة/الرفض — سجّله كمهمة منفصلة.

---

## السبب الجذري #3: باغ منطقي بشرط إرسال الأزرار

`src/app/api/payments/claim/route.ts`، السطر 89:

```ts
if (botToken && hasAdminIds) {
  const chatIds = new Set<string>();
  for (const id of adminIds) chatIds.add(String(id));
  const broadcastTargets = await prisma.telegramBroadcastTarget.findMany({ where: { isActive: true }, ... });
  for (const t of broadcastTargets) chatIds.add(t.chatId);
  ...
}
```

كوميت `cc73818` كان قصده "الإرسال لـbroadcast targets كمان، مو بس admin IDs من الـenv" — بس الشرط الخارجي `botToken && hasAdminIds` **لسه يتطلب `hasAdminIds` تكون true**. يعني لو `TELEGRAM_ADMIN_IDS` غير مضبوط بالإنتاج (فاضي)، الكتلة كاملة تتخطى — **ما توصل حتى لسطر جلب الـbroadcastTargets من قاعدة البيانات**. لو هذا هو وضع الإنتاج الفعلي حالياً (محتمل جداً بعد كل التنقل بين env/DB)، يبقى **الأزرار ما ترسل نهائياً**، بغض النظر عن أي شي تاني.

**الإصلاح**:
```ts
const broadcastTargets = await prisma.telegramBroadcastTarget.findMany({ where: { isActive: true }, select: { chatId: true } });
const hasBroadcastTargets = broadcastTargets.length > 0;

if (botToken && (hasAdminIds || hasBroadcastTargets)) {
  const chatIds = new Set<string>();
  for (const id of adminIds) chatIds.add(String(id));
  for (const t of broadcastTargets) chatIds.add(t.chatId);
  ...
}
```

**خطوة تحقق تشغيلية مطلوبة (مو من الكود)**: تأكد فعلياً من قيمة `TELEGRAM_ADMIN_IDS` المضبوطة بالإنتاج الحقيقي (Vercel env vars)، وتأكد إنه فيه صفوف نشطة بجدول `TelegramBroadcastTarget`. الكود وحده ما يقدر يأكد هذا.

---

## تراجعان أمنيان انزرعا أثناء جلسة التصحيح — لازم يتراجعوا

### أ) `TELEGRAM_GROUP_IDS` — أي عضو بالمجموعة صار يقدر يوافق/يرفض

كوميت `0cbec60` أضاف بـ`webhook/route.ts`:

```ts
const isFromTrustedGroup = cq.message?.chat?.id && groupIds.includes(cq.message.chat.id);
if (!isFromTrustedGroup) {
  const adminIds = getAdminTelegramIds();
  if (!adminIds.includes(cq.from.id)) { ... رفض ... }
}
```

لو الرسالة جاية من "مجموعة موثوقة"، **يتم تخطي فحص هوية الشخص اللي ضغط الزر كلياً** — أي عضو بهذه المجموعة يقدر يوافق على أي دفعة، مو بس المشرفين المحددين بـ`TELEGRAM_ADMIN_IDS`. هذا توسيع حقيقي وخطير لدائرة الثقة.

المشكلة اللي كانت وراء هذا التعديل (على الأغلب: تليجرام بيغيّر `chat_id` لما تترقى مجموعة عادية لسوبرقروب) **ما إلها علاقة بهوية الشخص الضاغط** — رقم المستخدم على تليجرام (`cq.from.id`) ما بيتغير أبداً بترقية المجموعة. المشكلة الحقيقية (لو كانت موجودة) بتكون بجانب *الإرسال* (تحديث `chatId` المخزن بجدول `TelegramBroadcastTarget`)، مو بجانب *الصلاحية*.

**الإصلاح**: احذف كتلة `isFromTrustedGroup` بالكامل. خلي فحص `adminIds.includes(cq.from.id)` هو الفحص الوحيد، دايماً، بغض النظر عن أي دردشة/مجموعة جات منها الرسالة. لو فيه مشكلة فعلية بتحديث `chat_id` بعد ترقية المجموعة، هذي تُحل بتحديث `TelegramBroadcastTarget.chatId` يدوياً أو سكريبت migration بسيط — مو بتخفيف فحص الهوية.

### ب) تسريب بيانات تشخيصية جديد عبر `/api/config` العام

`payments/claim/route.ts` بيكتب الآن:

```ts
await prisma.systemConfig.upsert({
  where: { key: "diag_last_keyboard" },
  ...
});
```

بدون `isSecret: true`. زي ما وضحت سابقاً، `GET /api/config?key=diag_last_keyboard` مسار **عام بدون أي مصادقة** — أي حد يقدر يشوف هل env token موجود، عدد المشرفين، ورسائل الخطأ الخام (ممكن تحتوي chat IDs). هذا نفس فئة الخطأ اللي حذّرت منها بخصوص `telegram_admin_ids` بالخطة الأصلية، تكرر بمتغيّر تاني.

**الإصلاح**: احذف هذي الكتلة كلياً. لو تبي تشخيص، استخدم `console.log`/monitoring حقيقي (Sentry، Section 3.3 من التقرير السابق)، مو `SystemConfig`.

### ج) `diagnose-keyboard` endpoint — استخدام سر الـwebhook لغرض تاني + إرسال رسائل حية بدون قيود

`src/app/api/telegram/diagnose-keyboard/route.ts` يعيد استخدام `TELEGRAM_WEBHOOK_SECRET` كمصادقة API عامة (مو غرضه الأصلي)، معفى من CSRF، وبيرسل رسائل تليجرام **حقيقية** لكل مشرف وكل broadcast target بكل استدعاء — بدون وضع `dryRun` زي شقيقه `diagnose/route.ts` (اللي محمي صح بـ`requireAdmin()`).

**الإصلاح**: احذف `diagnose-keyboard` كلياً (كان أداة تصحيح مؤقتة، خلص غرضها)، أو حوّله لـ`requireAdmin()` + `dryRun` افتراضي زي شقيقه.

---

## ترتيب التنفيذ الموصى فيه

1. **أضف حدث `subscription_approved`** بـ`subscription-decisions.ts` + عالجه بـ`checkout/page.tsx` (السبب #1 — الأهم، إصلاح مباشر ومضمون).
2. **صحح شرط `hasAdminIds`** بـ`payments/claim/route.ts` (السبب #3).
3. **تحقق يدوياً** من قيم `TELEGRAM_ADMIN_IDS` و`TelegramBroadcastTarget` الفعلية بالإنتاج، ومن `getWebhookInfo` الحقيقي للبوت (تأكد `allowed_updates` فيها `callback_query` والرابط صحيح).
4. **احذف** كتلة `isFromTrustedGroup` (تراجع أ).
5. **احذف** كتابة `diag_last_keyboard` لـ`SystemConfig` (تراجع ب).
6. **احذف أو قيّد** `diagnose-keyboard` (تراجع ج).
7. **بعد كل هذا**، اختبر فعلياً end-to-end: أنشئ دفعة، وافق من تليجرام، وشوف هل صفحة `/checkout` (مفتوحة بمتصفح حقيقي) تتحول لـ`/owner` تلقائياً بدون refresh. لو لسه ما اشتغل رغم كل هذا → السبب #2 (EventEmitter عبر السيرفرلس) هو الحاجز، وقتها ننفذ حل الـpolling مباشرة كخطوة تالية مؤكدة.

---

## برومبت التنفيذ

> نفّذ هذا التقرير (`2026-07-04-approval-recognition-deep-dive.md`) بالترتيب المذكور بقسم "ترتيب التنفيذ الموصى فيه"، خطوة بخطوة، وليس دفعة وحدة:
>
> 1. نفّذ خطوة 1 و2 فقط أول شي (إضافة حدث الموافقة + تصحيح شرط الأزرار). هذول تصحيحات كود بحتة بدون قرارات معمارية، آمنين للتنفيذ المباشر.
> 2. **قبل** ما تكمل لخطوة 3، اطلب مني أنا شخصياً أتحقق من قيم `TELEGRAM_ADMIN_IDS` والـbroadcast targets والـwebhook info الفعلية بالإنتاج — هذي معلومات عندي أنا بلوحة التحكم، مو بالكود، ما تقدر تتحقق منها بنفسك.
> 3. نفّذ خطوة 4، 5، 6 (حذف التراجعات الأمنية) كـcommit واحد منفصل، واعرض لي الـdiff كامل قبل الدفع.
> 4. **لا تضيف أي endpoint تشخيصي جديد، ولا تكتب أي بيانات تشخيصية جديدة بـ`SystemConfig`، ولا تعيد استخدام أي سر موجود لغرض تاني.** لو تحتاج تشخيص إضافي، استخدم `console.error`/logs فقط واطلب مني أشوفها بلوحة تحكم الاستضافة.
> 5. بعد كل تصحيح، شغّل `npm run lint && npm run build` وأرسل النتيجة، وبعدها اعمل اختبار end-to-end حقيقي (موافقة فعلية من تليجرام على متصفح مفتوح) قبل ما تعتبر أي خطوة "خلصت" — لا تكتفي بنجاح الـbuild كدليل على إصلاح المشكلة.
