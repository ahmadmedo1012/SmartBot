# خطة SmartBot v8 — المستوى العالمي من كل النواحي: إغلاق كل ما كشفه الفحص الشامل الخماسي

> **تاريخ الفحص:** 2026-09-06 | **آخر commit مفحوص:** `9a014d4d` (v7 مكتملة ومنشورة حيًا 15/16)
> **طريقة الفحص:** 5 مسوحات متوازية مستقلة (UX حركي، a11y عميق ما بعد الأزرار، ثيم/نظام تصميم، لغة عربية/RTL/SEO، باكند/أداء/أمن) — كل نتيجة أدناه موثقة بـ file:line.
> **جوهر هذه الجولة:** v7 أغلقت الأزرار والأسهم والتباين. الفحص الخماسي هذه المرة وجد ما هو **أعمق**: ثغرتا أمن P0 في الباكند (تسريب مفاتيح AI وتسريب SSE بين المستأجرين)، رقصة الدخول الرئيسية ميتة بعلّة برمجية دقيقة (framer variants)، 6 أخطاء نسخ عربية P0 مرئية للمستخدم، ~105 ألوان خام تتجاوز نظام التوكنات، ونظام حركة بثلاث لغات متوازية.

---

## المسار A — أمن وصحة الباكند (P0 — أعلى أولوية مطلقة)

| # | العطل | الدليل | الإصلاح |
|---|---|---|---|
| A1 | **تسريب مفاتيح OpenAI/Gemini للعامة** عبر `GET /api/config` | `routers/admin_routes.py:163` — `_SECRET_KEYS` لا يشمل `openai_api_key`/`gemini_api_key`، وتُحفظ بـ`is_secret=False` (165-172)؛ `plans_config.py:56-83` يقرأ **كل** صفوف SystemConfig بلا توثيق | أضف المفتاحين لـ`_SECRET_KEYS` + حوّل `/api/config` إلى **قائمة سماح صريحة** (كما يفعل `/api/support/info`) |
| A2 | **تسريب SSE بين المستأجرين**: `GET /api/events` يشترك بـ`tenant_id=None` ويبثّ كل أحداث كل المستأجرين (أسماء عملاء + محادثات AI كاملة) | `runner.py:940-951`، `event_bus.py:38-41`، بواعث `bot.py:1107,807` و`ai.py:159-163` | رشّح بالـ tenant المستخدِم في `sse_endpoint` (subscribe بـ`tenant_id` أو فلترة قبل yield) |
| A3 | إحصاءات الردود **عامة لا لكل مستأجر** (عداد البوت يظهر مجاميع المنصة كلها) | `bot.py:805-808` — `count(Reply.id)` بلا فلتر `tenant_id` | أضف الشرط للمجموعين (الكل + اليوم) |
| A4 | رفع صورة الوكيل يكتب على FS للقراءة-فقط في Vercel → 500 مؤكد في الإنتاج | `routers/ai.py:143-146` (بينما `payments.py:74-84` يعالجها صح) | طبّق نمط payments (data-URI على Vercel) |
| A5 | اصطدام أسماء الوسوم بين المستأجرين (A يمنع B من إنشاء "VIP") | `routers/inbox.py:258` بلا فلتر tenant | أضف `ConversationTag.tenant_id == …` |
| A6 | مقارنة سر تليجرام **غير ثابتة الزمن** + إعفاء الحد بلاحقة جزئية `in path` | `runner.py:725` (`!=` خام)، `runner.py:486` | `hmac.compare_digest` + مطابقة مسار دقيقة |
| A7 | 403 من CSRF يخرج **بلا ترويسات أمن** (ترتيب الوسيط: csrf خارج security_headers) | `runner.py:529` قبل `:502` | أعد الترتيب: security_headers الأبعد |
| A8 | `/api/agent/interpret` يكسر غلاف الاستجابة → `ApiError` بلا رسالة عند الفشل + يسرّب `str(e)[:200]` | `ai.py:156-171`، `lib/api.ts:14-27` | `ok()`/`fail()` + رسالة عربية عامة |
| A9 | ~10 رسائل خطأ إنجليزية تصل المستخدم العربي | `auth.py:60,101,158,293,321`، `admin_routes.py:290,313`، `bot.py:97`، `alerts_routes.py:115`، `runner.py:547` | ترجمها عربيًا |
| A10 | معاملات pagination بلا حدود عليا (DoS خفيف) | `bot.py:287`، `diagnostics.py:141,157`، `inbox.py:37`، `replies.py:80` | `Query(ge=1, le=100)` |
| A11 | نداء Graph حي غير مخبأ في مسار الطلب (يعطل لوحة التحكم 30 ثانية) | `dashboard_stats.py:46-53,197-202`، `analytics.py:115-121` | خزّن مؤقتًا (api_cache ttl=300) |
| A12 | N+1 في صندوق الوارد/التعليقات (حتى 50 SELECT تسلسلي + commit لكل نداء) | `inbox.py:56-85`، `replies.py:50-76` | دفعة upsert واحدة (IN + add_all) + قفزة مزامنة 30 ثانية |

---

## المسار B — إتاحة عميقة (Level A — كلها إلزامية)

| # | العطل | الدليل | الإصلاح |
|---|---|---|---|
| B1 | ساحر التهيئة: modal ملء الشاشة **بلا دلالة dialog ولا فخ تركيز ولا Escape** | `OnboardingWizard.tsx:209` عبر `AuthGuard.tsx:93-108` (بينما `Header.tsx:43-104` يفعلها كلها صح — النمط موجود!) | role=dialog + aria-modal + labelledby + فخ Tab + استعادة التركيز + Escape |
| B2 | بطاقات الإشعارات **فأرة-فقط** (div onClick بلا keyboard) | `notifications/page.tsx:243-252` — `interactive` في card.tsx:34 موجود لكن لا يُستخدم | مرّر `interactive` أو حوّل لزر حقيقي |
| B3 | ورقة "المزيد" الجوالة: dialog بلا aria-modal ولا فخ ولا Escape | `MobileBottomNav.tsx:60-93`، الخلفية `:55-59` نقر فقط | طبّق نمط Header نفسه |
| B4 | **13 حقل نموذج placeholder-فقط** بلا label مرتبط | messages:165,349؛ autoreply:84-118؛ tools:92-94؛ scheduled:82-96؛ posts:80-85؛ comments:119-124؛ support:419-424؛ connect:237-262؛ pages:164-169 | Input/aria-label + htmlFor/id (مكوّن Input:35 يفعلها جاهزًا) |
| B5 | 6 صفحات **بلا h1** | login:128، register:105، connect:213، admin:116، admin/settings:284، admin/telegram:189 | h1 sr-only أو ترقية العنوان الأول |
| B6 | قفز مستويات العناوين h1→h3 | analytics:72,89,108؛ calendar:35؛ billing:78 | h3→h2 |
| B7 | رابط "تخطَّ للمحتوى" يقع داخل المحتوى نفسه (غير فعّال) | layout.tsx:90-95 → main يلفّ الشريط الجانبي | `id="page-content"` على غلاف محتوى الصفحة + وجه الرابط إليه |
| B8 | مفاتيح التبديل/التصفية لا تُعلن حالتها (لون فقط) | messages:173-186، marketing:181-198، support:257-270، admin:134-139، pricing:116-136 | aria-pressed / radiogroup+aria-checked |
| B9 | جداول بلا scope/caption + أزرار صفوف مكررة بلا تمييز | admin:161-198، demo:215-238 | scope=col + aria-label للجدول + اسم الصف في أزرار الإجراء |
| B10 | نصوص الحالة اللاتزامنية خارج مناطق حية | OnboardingWizard:313-329، connect:287-338، support:304-323، marketing:200-204، messages:271-335 | role=status/aria-live=polite + role=log للمحادثة + aria-busy للهياكل |
| B11 | أخطاء التحقق غير مرتبطة بحقولها | support:288-290، pages:151-153 | aria-describedby + role=alert (نمط input.tsx جاهز) |
| B12 | روابط خارجية تفتح تبويبًا جديدًا بلا إنذار | support:210-217، OnboardingWizard:332-339، TelegramConfig:68,78، telegram page:226-228، FloatingWhatsApp:20-34 | "— يفتح في تبويب جديد" في الاسم المتاح |
| B13 | حالة بنقطة لون فقط (سبان بلا دور) | settings:128، AdminSidebar:124، Footer:42-50، activity:51-53 | نص مرئي أو role=status/الدمج بالنص المجاور |
| B14 | مخططات بلا بديل نصي + tooltip للفأرة فقط | charts/index.tsx:47-72، demo:174-177، analytics:78-81 | summary دائمًا + role=img + aria-label |
| B15 | مسار التنقل: تسمية إنجليزية + آخر عنصر بلا aria-current | PageHeader.tsx:62,75 | "مسار التنقل" + aria-current=page |
| B16 | HeroMockup يقرأ محادثة كاملة لقارئ الشاشة | HeroMockup.tsx:60-101 | aria-hidden (المحتوى مكرر نصيًا) |
| B17 | autocomplete مفقود في نموذج الدفع | PaymentDialog:432-441,500-506، support:246-253 | autoComplete=tel/name/email + required |
| B18 | قوائم بلا دلالة قائمة | audience:95-155، analytics:91-98، reports:133-145 | ul/li أو role=list |
| B19 | صفحات الخطأ تبدأ h2 | DefaultError.tsx:30 | h1 |

---

## المسار C — الحركة والتفاعل (الرقصة الميتة + تفعيل المكوّنات الميتة)

| # | العطل | الدليل | الإصلاح |
|---|---|---|---|
| C1 | **رقصة دخول لوحة التحكم/الإدارة ميتة كليًا** — `fadeUp`/`stagger` في `lib/motion.ts:16-20` كائنات props لا Variants (بلا hidden/visible) فلا يُشغَّل شيء قط | dashboard/page.tsx:142+، admin/page.tsx:96,175 | حوّلها Variants حقيقية + احذف custom العقيم |
| C2 | prefers-reduced-motion **لا يحترمه أي جسم JS-driven** (framer/recharts) | MiniSparkline:52-70، NavLink:36-40، DashboardShell:43-47، OnboardingWizard، charts:69 | `<MotionConfig reducedMotion="user">` في providers.tsx (سطر واحد يصلح ~90%) + isAnimationActive حراسة |
| C3 | **نظامان توست متنافران**: premiumToast مرّتين مقابل raw toast 108 مرة عبر 22 ملفًا + Toaster بلا dir ولا theme (توستات بيضاء في الوضع الداكن) + `--orange` غير معرّف | layout.tsx:111-124، premium-toast.tsx:30-38 | وحّد عبر premiumToast + Toaster dir=rtl + theme من useTheme |
| C4 | EmptyState معتمد في 4 ملفات فقط؛ **~20 صفحة نص خام خافت** + 5 لغات empty-state مختلفة | team:54، billing:90، ads:63، scheduled:117، posts:114، comments:87، analytics:76+، activity:46، reports:131، support:348، tools:112، calendar:45، leads:51، marketing:244، messages:280، audience:128، notifications:233، autoreply:141، [...slug]:121 | مسح شامل → `<EmptyState>` |
| C5 | Skeleton المكوّن ميت (0 استيراد)؛ 30+ ملفًا تلف pulse يدويًا بأشكال متضاربة | skeleton.tsx، globals.css:401-437 | تبنٍّ في حالات التحميل الرئيسية |
| C6 | قلب متزامن واحد يُعطّل أزرار كل الصفوف | comments:131، marketing:277,293، broadcast:157، notifications:292,309 | تتبّع id الفاعل (نمط admin:191 الموجود) |
| C7 | `border-r-orange` صنف وهمي → شريط المحادثة المختارة بلا لون + جانب فيزيائي خطأ في RTL | messages:54 | `border-s-[3px] border-s-primary` |
| C8 | تبديل الفلاتر يمسح القائمة بهياكل عظمية (لا keepPreviousData) | messages:100-109، admin:134-139 | placeholderData + تخفيت isFetching |
| C9 | صفوف الجداول بلا hover | dashboard:241، demo:226 | hover:bg-muted/40 + transition |
| C10 | 7 مقادير ضغط + 3 مسافات رفع متضاربة | MobileBottomNav×4، Header×2، ThemeToggle، StepIndicator، button، AdminSidebar، card × lift | توكنان: ضغط 0.97/رفع −4px + مسح 13 موضعًا |
| C11 | `transition-[colors,transform]` **CSS غير صالح** (3 أزرار تنجذب ألوانها فورًا) | MobileBottomNav:108,124,145,160 | خصائص صحيحة |
| C12 | حوار 500ms بطيء لعالمية | dialog.tsx:35,62 | 250ms + ease token |
| C13 | تبديل السعر شهري/سنوي فوري + تبويبات ديمو فورية | pricing:224، demo:464-484 | انتقال 200-300ms |

---

## المسار D — نظام التصميم (التوكنات المفقودة + المسح الشامل)

| # | العطل | الدليل | الإصلاح |
|---|---|---|---|
| D1 | `--orange` موثّق **وغير معرّف أصلًا** → `border-r-orange` و premium-toast يسقطان لقيم افتراضية | globals.css (لا تعريف)، design-system.md §2 | عرّف `--orange`/`--orange-muted` في :root+.light + @theme |
| D2 | **~105 صنف لون خام من لوحة Tailwind** تتجاوز التوكنات الدلالية وتفشل AA في الوضع الفاتح | PageHeader:26-28,102-104، EmptyState:98-104، HeroMockup:66-72، RegisterForm:119-166، connect:271-334، admin:97، page.tsx:176، demo:148-150 + 12 صفحة dashboard | أضف `--success-soft/--warning-soft/--info-soft/--destructive-soft` ثم مسح: text-green-500→text-success … إلخ |
| D3 | `text-white` في 35 موضعًا خارج جدول الاستثناءات (منها على تدرجات /80 تفتّح في الوضع الفاتح) | badge:33، PaymentDialog×4، FeaturesSection:50-51، pricing:191-192 … | → text-primary-foreground / text-espresso حسب السياق |
| D4 | سلم نصف القطر **غير رتيب**: rounded-2xl(16) < rounded-xl(28) | @theme + 16 استخدامًا | عرّف --radius-2xl/3xl/4xl برتابة |
| D5 | 12 وصفة حلقة تركيز متضاربة + 9 حقول خام بـ`focus:` بدل `focus-visible:` | input:50-52، badge:11، scheduled:86، posts:84، tools:92-94، comments:123، autoreply:89-117، messages:169,354 | وصفة واحدة + ترقية التركيز |
| D6 | تعارض z-index: صنف z-30 + style مضمّن يفرض 20 | DashboardShell:40، demo:479 | احذف الـstyle المضمّن |
| D7 | 3 توكنات ease معرّفة + 4 مكوّنات تكرر نفس المنحنى حرفيًا؛ توكنات duration معرّفة بلا مستهلك واحد | card:38، dialog:35,62، button:11 | `ease-smooth` الرسمي |
| D8 | ~40 توكنًا ميتًا + وثيقة design-system منحرفة عن الكود (توثّق مستهلكين غير موجودين) | --confetti-×13 (مستهلكه Confetti.tsx غير موجود!)، --iphone-×4، switch:32 وdemo:57 في جدول الاستثناءات لم يعودا موجودين | قلّم أو وصّل + حدّث §3.1/§3.2/§8 |
| D9 | توست Sonner لا يتبع الثيم | layout.tsx:111-124 | مغلّف client بـ useTheme (مع C3) |
| D10 | joyride يكسر الهوية بألوان محرفية | OnboardingTour.tsx:96-115 | توكنات |
| D11 | نص مجهري text-[9-11px] ×120 غير توكني | كل رؤوس الصفحات | `--text-2xs/--text-3xs` + مسح جزئي بالأولوية |
| D12 | توهج الرأس ظل مضمّن خام + spinner متطرفان مختلفان | Header:203، DefaultLoading:7 مقابل admin:109 | توكن --shadow-glow + مكوّن Spinner موحّد |

---

## المسار E — العربية والنسخ وSEO (P0 مرئي فورًا)

| # | العطل | الدليل | الإصلاح |
|---|---|---|---|
| E1 | 6 أخطاء P0 مرئية: "منيو تجريبي" (من بقايا Smart-Menu!)، "رد تلائي" (خطأ إملائي)، "ليانا" بدل "ليبيانا"، "مردود" بدل "تم الرد"، "بحاجة رد" ناقصة حرف جر، صيغ مثنى/جمع مفقودة في "قبل X دقيقة" | Footer:14، SetupWarnings:97، billing:17، comments:105، messages:40، notifications:50-54 + 8 مواضع | إصلاحات سطرية فورية |
| E2 | انحراف مصطلحات: خطة/باقة، لوحة التحكم/لوحة البيانات، متابعون/المعجبون، رمز الوصول/توكن/تويكن، تليجرام/التليجرام | ~30 موضعًا | معجم موحّد: خطة، لوحة التحكم، متابعون، رمز الوصول، تليجرام |
| E3 | جاري/جارٍ/جارِ — 3 هجائين | 22+7+1 مواضع | جارٍ موحّدة |
| E4 | أرقام هندية-عربية ١٢٣ في 3 ملفات تخالف اتفاقية الأرقام الغربية المعتمدة | landing-data:19-21، FeaturesSection:75-77، pricing:98-99 | 123 غربية |
| E5 | 3 صيغ زمن نسبي متنافرة + بلا مثنى/جمع | messages:23-33، comments:14-23، notifications:45-55، demo:75-78 | timeAgo() واحدة في lib/format.ts مع getArabicPlural |
| E6 | ~15 موضعًا `${n} noun` بلا جمع عربي (المحرّك موجود!) | messages:80، autoreply:74,175، dashboard:162، analytics:96، demo:387، audience:99، marketing:203 | مرّر عبر getArabicPlural (نمط PlanSelector:104 الصحيح) |
| E7 | عزل bidi مفقود: URL الويبهوك، سطر المعتمد، شريط الثقة LTR | connect:135، Diagnostics:119-121، page.tsx:163 | dir=ltr/bdi |
| E8 | JSON-LD مزدوج متناقض + FAQ schema ناقص سؤالًا + ادّعاء "ردود غير محدودة" يناقض حدود الخطط فعليًا | layout.tsx:68-78 مقابل page.tsx:27-42، :88-98، landing-data:29 | احذف الأفقر + طابق الـ6 أسئلة + صحّح الادّعاء |
| E9 | SEO: /connect بلا metadata ولا robots-disallow، /register غائب عن sitemap، privacy/terms بلا canonical/OG، تنظيف robots | robots.ts:16، sitemap.ts:10-17 | أصلح الأربعة |
| E10 | سهم المسار ←/→ متناقض بين تعليمتي ربط الويبهوك + بقايا Smart-Menu في أمثلة أحداث تليجرام | connect:162 مقابل admin/settings:393، TelegramConfig:84-85 | وحّد ← + أمثلة SmartBot |
| E11 | تنوينًا/اً مختلط + "…" مقابل "..." + عملة LYD بدل د.ل + بطاقة دفع placeholder 11 خانة والتحقق 10 | ~12 + ~25 مواضع، billing:97، PaymentDialog:436 | اً + … + د.ل + 09XXXXXXXX |

---

## المسار F — البوابات والتوثيق والتسليم

| # | البند |
|---|---|
| F1 | `scripts/gate_all.sh` كاملة (ruff + pytest + tsc + build) + a11y sweep + contrast بوابةً لا اختيارًا |
| F2 | تقرير `docs/reports/v8-world-class-report.md` بجدول قَبول لكل بنود المسارات أعلاه (PASS/الدليل) |
| F3 | commit واحد (`feat(v8): world-class closure …`) + دفع main + develop (توفير حصة Vercel) |
| F4 | تحديث سجل العمل المشترك + تذكير نهائي بإبطال التوكنات الثلاثة بعد قبول المستخدم |

---

## جدول القبول النهائي — v8 (كل بند بمعيار آلي قابل للتحقق)

| # | البند | معيار PASS |
|---|---|---|
| 1 | صفر تسريب أمني P0 | `GET /api/config` لعامّة لا يُرجع أي مفتاح AI (اختبار آلي يمنع الانحدار) + SSE يفلتر حسب tenant (اختبار) + counts بفلتر tenant |
| 2 | صفر انتهاك Level A في a11y | OnboardingWizard/BottomNav حوارات كاملة + إشعارات بلوحة مفاتيح + 13 حقلًا موسومة + h1 في كل صفحة + مفاتيح حالة معلنة (فحص axe-style يدوي موثّق) |
| 3 | الحركة حية ومحترمة لذوي الحساسية | dashboard stagger يُشغَّل فعليًا (Variants صحيحة) + MotionConfig reducedMotion="user" موجود في providers + zero `prefers-reduced-motion` فجوات JS |
| 4 | لون واحد عبر التوكنات | `grep -c` للأصناف الخام (green-/red-/blue-/yellow-/amber-500) في src = **0** (بعد استثناء HeroMockup الزخرفي الموثّق) + --orange معرّف + Toaster موثّق الاتجاه والثيم |
| 5 | صفر أخطاء نسخ P0 + معجم موحّد | grep للأخطاء الستة = 0 + جارٍ موحّدة + timeAgo واحدة مستخدمة في كل المواضع |
| 6 | SEO كامل | robots يشمل /connect + sitemap يشمل /register + JSON-LD Organization واحد + FAQ schema = 6 أسئلة + privacy/terms بـ canonical/OG |
| 7 | البوابات كلها خضراء | pytest ≥ 300 + tsc 0 + build 38 مسارًا + a11y sweep PASS + contrast PASS (الوضعان) |

**الحد الأدنى غير القابل للتفاوض:** المسارات A وB وE1 وC1 وC2 وD1 وD2 — هذه هي التي تفصل "جيد" عن "عالمي". الباقي ينفَّذ أيضًا في هذه الجولة إلا ما تعارض مع سلامة البناء (يُوثَّق بندًًا مؤجلًا صراحة لا يُدَّعى اكتماله).
