# v17-D6 — خريطة الوظائف الخلفية بلا سطح واجهة + الميزات الموعودة بالخطط بلا تفعيل

> **Task ID:** v17-D6 · **النوع:** وكيل تشخيص (READ-ONLY — لا تعديل كود)
> **النطاق:** جرد كامل (بلا استثناء) لـendpoints الباك-إند مقابل مستهلكي الواجهة، مطابقة وعود خطط الاشتراك بالواقع، فحص الجداول الميتة والمحركات، وترتيب أولويات واجهة جولة v17.
> **المصادر:** قراءة مباشرة لـ`fb_dashboard/routers/` (كل الملفات) + `routers/payments/` + `frontend/src` (grep لكل مسار) + `app/startup.py` (بذور الخطط) + `docs/decisions-ledger.md` (dec-agent-stack / dec-dead-tables / dec-wallet-spend / dec-cron-restore).

---

## 1) الملخص التنفيذي (الأرقام)

| المقياس | القيمة |
|---|---|
| مسارات API في `routers/` (شامل `payments/`) | **240 مسارًا** موزعة على 41 ملف راوتر (العدّ بمطابقة `@router.*` — يتضمن المستعارات مثل `/ticket`+`/tickets`) |
| مسارات لها مستهلك واجهة حي في `frontend/src` | **90 مسارًا (~37%)** |
| مسارات خارجية (كرون Vercel / مراقب uptime) | 4 (`/api/cron/bot-cycle` · `/api/cron/heartbeat` · `/api/cron/cleanup-logs` · `/healthz`) |
| **مسارات بلا أي مستهلك واجهة** | **146 مسارًا (~61%)** |
| قنوات البث الحي (WebSocket/SSE) بلا مستهلك | `/ws` + `GET /api/events` (الواجهة تعتمد polling بـreact-query؛ SSE الوحيد المستهلك هو دفع الاشتراكات) |
| محركات بلا أي واجهة (dec-agent-stack) | agent_engine+brain+tools+memory (~820 سطرًا) · flow_engine (586) · publisher_engine (232) · commerce_engine (164) · pdf_reports_engine (606) + راوترات flows/sequences/widgets/publisher/commerce/brand/users/reports |
| ميزات موعودة في خطط مدفوعة **بلا تفعيل كامل** | 7 من أصل ~17 ميزة مميزة (التفصيل §3) |
| أعلى فجوة "وعد مقابل واقع" | sequences (Pro 129د.ل) · العروض (Premium) · تقارير PDF (Basic/Premium) |

**الخلاصة:** الباك-إند يقدم نحو **ضعف** ما تستهلكه الواجهة. أغلب الفجوة متراكمة من مرحلة v4 (ميزات راوترات كاملة كُتبت واختُبرت ولم تُبنَ لها صفحات). ثلاث فجوات تخص **مسار المال مباشرة**: إنشاء العروض (موعود في Premium ولا يمكن من الواجهة)، الحملات التسلسلية (موعودة في Pro بلا أي واجهة)، وترقية الخطة (endpoint جاهز بلا زر).

---

## 2) جدول الـendpoints الكامل مع عمود «مستهلك واجهة؟»

الرموز: ✅ = مستهلك حي في `frontend/src` (اسم الصفحة/المكوّن) · ❌ = لا مستهلك · ⚙️ = مستهلك خارجي (كرون/مراقب).

### routers/auth.py — 13
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /api/login | POST | دخول وإصدار JWT | ✅ login/page |
| /api/logout | POST | خروج + إدراج توكن في القائمة السوداء | ✅ DashboardShell |
| /api/register | POST | تسجيل مستأجر جديد | ✅ RegisterForm |
| /api/me | GET | بيانات المستخدم/المستأجر الحالي | ✅ login, settings, admin, subscribe |
| /api/auth/me | GET | اسم مستعار لـ/api/me | ❌ |
| /api/onboarding/complete | POST | وضع علامة إتمام التهيئة | ✅ OnboardingWizard |
| /api/onboarding/skip | POST | تخطي التهيئة | ✅ AuthGuard |
| /api/audit/logs | GET | سجل تدقيق الأحداث | ❌ |
| /api/admin/reset-password | POST | أدمن يصفّر كلمة مرور مستخدم | ❌ |
| /api/auth/change-password | POST | تغيير كلمة المرور الذاتي | ✅ settings/page |
| /api/users | GET | مستخدمو المستأجر (مرقّم صفحات) | ❌ (صفحة الفريق تقرأ /api/team/members) |
| /api/admin/notification-preferences | GET | تفضيلات إشعارات الأدمن | ❌ |
| /api/admin/notification-preferences | PUT | حفظ تفضيلات إشعارات الأدمن | ❌ |

### routers/plans_config.py — 6
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /api/plans | GET | قائمة الخطط النشطة | ✅ pricing, subscribe, onboarding |
| /api/config | GET | إعدادات عامة (هواتف الدعم/الدفع) — allowlist | ✅ useConfig |
| /api/public/stats | GET | إحصاءات المنصة العامة | ✅ usePublicStats |
| /api/public/testimonials | GET | شهادات عملاء (فارغة عمدًا) | ✅ LandingIslands |
| /healthz | GET | فحص حياة القاعدة | ⚙️ مراقب uptime (dec-uptime-monitor) |
| /api/cron/cleanup-logs | GET/POST | تنظيف سجلات >30/90 يومًا | ⚙️ Vercel Cron يومي 03:00 |

### routers/support.py — 8
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /api/support/info | GET | معلومات قنوات الدعم | ✅ dashboard/support |
| /api/support/ticket + /tickets | POST | إنشاء تذكرة (مساران مستعاران) | ✅ dashboard/support |
| /api/support/tickets | GET | تذاكر المستأجر | ✅ dashboard/support |
| /api/support/tickets/{id} | GET | تفاصيل تذكرة | ✅ dashboard/support |
| /api/support/tickets/{id}/reply | POST | رد على تذكرة | ✅ dashboard/support |
| /api/support/tickets/{id}/close | POST | إغلاق تذكرة من طرف العميل | ❌ |
| /api/admin/support/tickets | GET | طابور تذاكر الأدمن (عابر للمستأجرين) | ✅ admin/support |

### routers/calendar_routes.py — 7
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /api/calendar | GET | منشورات مجدولة لشهر | ✅ dashboard/calendar |
| /api/calendar/day | GET | تفاصيل يوم | ❌ |
| /api/calendar | POST | إنشاء منشور من التقويم | ❌ |
| /api/calendar/{post_id} | PUT | تعديل منشور مجدول | ❌ |
| /api/calendar/{post_id} | DELETE | حذف منشور مجدول | ❌ |
| /api/calendar/{post_id}/publish | POST | نشر فوري من التقويم | ❌ |
| /api/calendar/month-summary | GET | ملخص شهر | ❌ |

### routers/brand_routes.py — 2
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /api/brand | GET | هوية العلامة (Smart Link) | ❌ |
| /api/brand | PUT | تعديل هوية العلامة (أدمن منصة) | ❌ |

### routers/templates_routes.py — 4
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /api/templates | GET | قوالب الرد | ✅ dashboard/tools |
| /api/templates | POST | إنشاء قالب | ✅ dashboard/tools |
| /api/templates/{id} | PUT | تعديل قالب | ❌ |
| /api/templates/{id} | DELETE | حذف قالب | ✅ dashboard/tools |

### routers/onboarding.py — 4
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /api/onboarding/connect-page | POST | ربط صفحة فيسبوك | ✅ OnboardingWizard |
| /api/onboarding/test-connection | POST | اختبار الاتصال بالصفحة | ✅ OnboardingWizard |
| /api/onboarding/suggest-reply | POST | اقتراح رد (بوابة has_ai) | ✅ OnboardingWizard |
| /api/onboarding/first-rule | POST | إنشاء أول قاعدة رد | ✅ OnboardingWizard |

### routers/health_alerts_routes.py — 3
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /api/health/alerts | GET | تنبيهات صحة البوت | ❌ |
| /api/health/alerts/{id}/resolve | POST | حل تنبيه | ❌ |
| /api/health/bot-check | GET | فحص صحة شامل (ردود/توكن/قواعد) | ❌ |

### routers/offers_routes.py — 4
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /api/offers | GET | قائمة العروض | ✅ dashboard/tools |
| /api/offers | POST | **إنشاء عرض** | ❌ (لا نموذج إنشاء في الواجهة!) |
| /api/offers/{id}/toggle | POST | تفعيل/تعطيل عرض | ✅ dashboard/tools |
| /api/offers/{id} | DELETE | حذف عرض | ✅ dashboard/tools |

### routers/diagnostics.py — 8 (كلها ❌ — أدمن منصة)
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /api/diagnostics/status | GET | حالة النظام/البيئة | ❌ |
| /api/diagnostics/cycle-stats | GET | إحصاءات دورة البوت | ❌ |
| /api/diagnostics/recent-errors | GET | آخر الأخطاء | ❌ |
| /api/diagnostics/logs | GET | سجلات مع فلترة | ❌ |
| /api/diagnostics/stats | GET | إحصاءات مجمعة | ❌ |
| /api/diagnostics/events | GET | أحداث التتبع (AnalyticsEvent) | ❌ |
| /api/diagnostics/permissions | GET | صلاحيات توكن الصفحة | ❌ |
| /api/diagnostics/demo-test-comment | POST | تعليق تجريبي للاختبار | ❌ |

### routers/notifications.py — 4 (مساران مستعاران)
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /api/notifications (و /) | GET | إشعارات المستخدم | ✅ dashboard/notifications |
| /api/notifications/{id}/read | POST | تعليم مقروء | ✅ dashboard/notifications |
| /api/notifications/read-all | POST | تعليم الكل مقروء | ✅ dashboard/notifications |

### routers/flows.py — 7 (كلها ❌ — حزمة dec-agent-stack)
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /api/flows | GET | قائمة التدفقات | ❌ |
| /api/flows | POST | إنشاء تدفق (nodes/edges) | ❌ |
| /api/flows/{id} | GET | تفاصيل تدفق | ❌ |
| /api/flows/{id} | PUT | تحديث تدفق | ❌ |
| /api/flows/{id} | DELETE | حذف تدفق | ❌ |
| /api/flows/{id}/toggle | POST | تدوير الحالة draft/active/paused | ❌ |
| /api/flows/{id}/test | POST | تنفيذ تجريبي عبر flow_engine | ❌ |

### routers/payments/ — 12
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /api/admin/subscriptions | GET | طابور موافقات الدفع (أدمن) | ✅ admin/page |
| /api/admin/subscriptions | POST | موافقة/رفض/تفعيل دفعة | ✅ admin/page |
| /api/payments/receipt/{payment_id} | GET | جلب إيصال دفعة (ملف) | ❌ (الإدارة تعرض receipt_url من extra_data مباشرة) |
| /api/subscriptions/status-stream | GET | بث SSE لحالة الدفع | ✅ PaymentDialog (EventSource) |
| /api/payments/topup | POST | طلب شحن المحفظة (ليبيانا/مدار) | ❌ |
| /api/payments/confirm | POST | تأكيد رقم حوالة شحن | ❌ |
| /api/payments/balance | GET | رصيد المحفظة | ✅ dashboard/billing |
| /api/payments/history | GET | سجل المدفوعات + فواتير الاشتراك | ✅ dashboard/billing |
| /api/upload | POST | رفع صورة إيصال | ✅ PaymentDialog |
| /api/subscriptions | POST | طلب اشتراك جديد (محفظة/بنك) | ✅ PaymentDialog |
| /api/subscriptions/status | GET | استطلاع حالة دفعة | ✅ PaymentDialog (polling) |
| /api/subscriptions/upgrade | POST | **ترقية لخطة أعلى** | ❌ (لا زر ترقية في أي صفحة) |

### routers/replies.py — 5
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /api/replies | GET | سجل ردود البوت | ❌ (صفحة النشاط تقرأ /api/logs) |
| /api/comments | GET | التعليقات الحديثة | ✅ dashboard/comments |
| /api/comments/{id}/hide | POST | إخفاء تعليق على فيسبوك | ❌ |
| /api/comments/{id} | DELETE | حذف تعليق | ❌ |
| /api/replies/{id}/reply | POST | رد يدوي على تعليق | ✅ dashboard/comments |

### routers/sequences.py — 11 (كلها ❌ — dec-agent-stack؛ المحرك نفسه حي §5)
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /api/sequences | GET | قائمة الحملات التسلسلية | ❌ |
| /api/sequences | POST | إنشاء حملة | ❌ |
| /api/sequences/{id} | GET | تفاصيل | ❌ |
| /api/sequences/{id} | PUT | تحديث | ❌ |
| /api/sequences/{id} | DELETE | حذف | ❌ |
| /api/sequences/{id}/steps | POST | إضافة خطوة | ❌ |
| /api/sequences/steps/{id} | PUT | تحديث خطوة | ❌ |
| /api/sequences/steps/{id} | DELETE | حذف خطوة | ❌ |
| /api/sequences/{id}/subscribe/{sub_id} | POST | اشتراك مشترك في حملة | ❌ |
| /api/sequences/{id}/unsubscribe/{sub_id} | POST | إلغاء اشتراك | ❌ |

### routers/widgets_routes.py — 5 (كلها ❌)
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /api/widgets/recent-activity | GET | خط زمني للنشاط الأخير | ❌ |
| /api/widgets/ai-insights | GET | حالة AI + عدد القوالب | ❌ |
| /api/widgets/response-time | GET | معدل الردود (وكيل التوقيت) | ❌ |
| /api/widgets/sentiment-trend | GET | توزيع المشاعر يوميًا | ❌ |
| /api/widgets/top-keywords | GET | أكثر القواعد اشتعالًا | ❌ |

### routers/facebook_routes.py — 13
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /api/facebook/settings | GET | إعدادات ربط الصفحة | ✅ pages + connect |
| /api/facebook/settings | PUT | حفظ الإعدادات | ✅ pages + connect |
| /api/facebook/test | POST | اختبار التوكن | ✅ pages + connect |
| /api/posts | GET | منشورات الصفحة من فيسبوك | ❌ |
| /api/posts/{id} | GET | تفاصيل منشور | ❌ |
| /api/posts/{id} | DELETE | حذف منشور من فيسبوك | ❌ |
| /api/publish | POST | نشر فوري على الصفحة | ❌ (النشر المجدول يمر عبر scheduled-posts) |
| /api/messages | GET | محادثات الماسنجر (نسخة قديمة) | ❌ (المستهلك الحي inbox) |
| /api/messages/{id} | GET | رسائل محادثة | ❌ |
| /api/messages/{id}/reply | POST | رد على محادثة | ❌ |
| /api/ads/accounts | GET | حسابات إعلانية مرتبطة | ✅ dashboard/ads |
| /api/ads/campaigns/{account_id} | GET | حملات حساب إعلاني | ❌ (صفحة الإعلانات تعرض «قريباً») |
| /api/ads/ads/{account_id} | GET | إعلانات حساب | ❌ |

### routers/webhooks.py — 2
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /api/webhook/events | GET | آخر أحداث الويبهوك | ❌ |
| /api/webhook/check | GET | فحص صحة الويبهوك | ✅ connect/page |

### routers/alerts_routes.py — 6
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /api/alerts | GET | تنبيهات BotAlert | ❌ |
| /api/alerts | POST | إنشاء تنبيه + بث WS | ❌ |
| /api/alerts/{id}/resolve | POST | حل تنبيه | ❌ |
| /api/notifications/broadcast | POST | بث إشعار فوري لكل لوحات المستأجر | ❌ |
| /api/notifications/settings | GET | تفضيلات إشعارات المستخدم | ✅ dashboard/notifications |
| /api/notifications/settings | PUT | حفظ التفضيلات | ✅ dashboard/notifications |

### routers/rules.py — 5
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /api/rules | GET | قواعد الرد | ✅ autoreply |
| /api/rules | POST | إنشاء قاعدة | ✅ autoreply |
| /api/rules/{id} | PUT | **تعديل قاعدة** | ❌ |
| /api/rules/{id} | DELETE | حذف قاعدة | ✅ autoreply |
| /api/rules/{id}/toggle | POST | تفعيل/تعطيل | ✅ autoreply |

### routers/subscribers_tags_routes.py — 7
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /api/subscribers | GET | قائمة المشتركين (مرقّمة) | ✅ audience |
| /api/subscribers/{id} | GET | بطاقة مشترك | ❌ |
| /api/subscribers/{id}/tags | POST | وسم مشترك | ❌ |
| /api/subscribers/{id}/tags/{tag_id} | DELETE | إزالة وسم | ❌ |
| /api/tags | GET | الوسوم | ❌ |
| /api/tags | POST | إنشاء وسم | ❌ |
| /api/tags/{id} | DELETE | حذف وسم | ❌ |

### routers/team_routes.py — 4
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /api/team/members | GET | أعضاء الفريق | ✅ team |
| /api/team/activity | GET | نشاط الأعضاء | ❌ |
| /api/team/performance | GET | أداء الأعضاء | ❌ |
| /api/team/role-summary | GET | ملخص الأدوار | ❌ |

### routers/bot.py — 9
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /api/bot/status | GET | حالة حلقة البوت | ❌ |
| /api/bot/restart | POST | إعادة تشغيل البوت (أدمن منصة) | ❌ |
| /api/bot/stop | POST | إيقاف البوت | ❌ |
| /api/bot/interval | POST | ضبط فاصل الدورة | ❌ |
| /api/cron/bot-cycle | GET | نبضة كرون لدورة البوت (sharded) | ⚙️ Vercel Cron (الحي الوحيد — 04:00 يوميًا؛ dec-cron-restore) |
| /api/cron/heartbeat | GET | نبضة صحة (تحدّث bot_state) | ⚙️ قناة cron-job.org **ميتة** (dec-cron-restore) — البطاقة تعرض آخر نبضة فقط |
| /api/logs | GET | سجلات البوت | ✅ activity |
| /api/logs/clear | POST | تفريغ السجلات | ❌ |
| /api/bot/trigger | POST | تشغيل دورة فورًا | ❌ |

### routers/marketing.py — 6
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /api/marketing/campaigns | GET | قائمة الحملات | ✅ marketing |
| /api/marketing/campaigns | POST | إنشاء حملة | ✅ marketing |
| /api/marketing/audience-size | GET | حجم جمهور الحملة | ✅ marketing |
| /api/marketing/campaigns/{id}/send | POST | إرسال حملة | ✅ marketing |
| /api/marketing/campaigns/{id}/stats | GET | إحصاءات حملة | ❌ |
| /api/marketing/campaigns/{id} | DELETE | حذف حملة | ✅ marketing |

### routers/admin_routes.py — 14
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /api/admin/config | GET | قراءة إعدادات المنصة | ✅ admin/settings |
| /api/admin/config | POST | حفظ إعدادات المنصة | ✅ admin/settings |
| /api/setup-status | GET | حالة اكتمال الإعداد | ✅ SetupWarnings |
| /api/cron/status | GET | حالة قنوات الكرون/النبضات | ✅ CronHeartbeatCard |
| /api/cron/alert-test | POST | اختبار قناة التنبيه | ❌ |
| /api/repair | POST | إصلاح ذاتي للبيانات | ❌ |
| /api/admin/tenants/{id} | DELETE | حذف مستأجر + كامل بيانه | ❌ |
| /api/admin/rules/{id}/priority | POST | ترتيب أولوية قاعدة | ❌ |
| /api/admin/cooldown | POST | ضبط تهدئة الردود | ❌ |
| /api/admin/template-vars | GET | متغيرات القوالب المتاحة | ❌ |
| /api/admin/rules-categories | GET | تصنيفات القواعد | ❌ |
| /api/admin/platform/users | GET | كل مستخدمي المنصة | ❌ |
| /api/admin/platform/users/{id} | PATCH | تعديل مستخدم منصة (دور/حالة) | ❌ |

### routers/dashboard_stats.py — 2
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /api/dashboard/bundle | GET | حزمة إحصاءات اللوحة الرئيسية | ✅ dashboard/page |
| /api/system/stats | GET | إحصاءات النظام العامة | ❌ |

### routers/scheduled_posts_routes.py — 4 (كلها ✅)
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /api/scheduled-posts | GET | المنشورات المجدولة | ✅ posts + scheduled |
| /api/scheduled-posts | POST | جدولة منشور | ✅ posts + scheduled |
| /api/scheduled-posts/{id}/publish | POST | نشر مجدول فورًا | ✅ posts + scheduled |
| /api/scheduled-posts/{id} | DELETE | حذف مجدول | ✅ posts + scheduled |

### routers/commerce_routes.py — 5 (كلها ❌)
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /api/commerce/status | GET | حالة تكامل التجارة | ❌ |
| /api/commerce/shopify/configure | POST | ضبط Shopify (أدمن منصة) | ❌ |
| /api/commerce/shopify/webhook/{topic} | POST | مستقبل ويبهوك Shopify (HMAC) | ❌ (خارجي محتمل لكن لا متجر مضبوط) |
| /api/commerce/shopify/products | GET | منتجات المتجر | ❌ |
| /api/commerce/shopify/orders | GET | طلبات المتجر | ❌ |

### routers/inbox.py — 9
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /api/inbox/conversations | GET | محادثات الماسنجر | ✅ messages |
| /api/inbox/conversations/{id} | GET | رسائل محادثة | ✅ messages |
| /api/inbox/conversations/{id} | DELETE | حذف محادثة | ❌ |
| /api/inbox/conversations/{id}/reply | POST | رد يدوي | ✅ messages |
| /api/inbox/tags | GET | وسوم المحادثة | ❌ |
| /api/inbox/tags | POST | إنشاء وسم محادثة | ❌ |
| /api/inbox/tags/{id} | DELETE | حذف وسم | ❌ |
| /api/inbox/conversations/{id}/tags | POST | وسم محادثة | ❌ |
| /api/inbox/conversations/{id}/tags/{tag_id} | DELETE | إزالة وسم | ❌ |

### routers/telegram_config.py — 10 (كلها ✅)
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /api/telegram/config | GET | إعدادات بوت التلغرام | ✅ admin/telegram |
| /api/telegram/config | POST | حفظ الإعدادات | ✅ admin/telegram |
| /api/telegram/diagnose | GET | تشخيص التلغرام | ✅ admin/telegram |
| /api/admin/telegram/approvers | GET/POST/DELETE (3) | مديرو الموافقات | ✅ admin/telegram (DiagnosticsSection) |
| /api/telegram/broadcast-targets | GET/POST/PATCH/DELETE (4) | أهداف البث | ✅ admin/telegram (BroadcastTargetsSection) |
| /api/telegram/test | POST | رسالة اختبار | ✅ admin/telegram + admin/settings |

### routers/crm_routes.py — 3
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /api/crm/customers | GET | قائمة العملاء (Leads) | ✅ leads |
| /api/crm/customers | POST | إنشاء عميل يدويًا | ❌ |
| /api/crm/customers/{id} | PUT | تحديث عميل | ❌ |

### routers/broadcasts.py — 7
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /api/broadcasts | GET | قائمة عمليات البث | ✅ broadcast |
| /api/broadcasts | POST | إنشاء مسودة بث | ✅ broadcast |
| /api/broadcasts/{id} | GET | تفاصيل بث | ❌ |
| /api/broadcasts/{id} | PUT | تعديل مسودة | ❌ |
| /api/broadcasts/{id}/send | POST | إرسال البث (يُصرَّف في cycle) | ✅ broadcast |
| /api/broadcasts/{id}/cancel | POST | **إلغاء بث معلق** | ❌ |
| /api/broadcasts/estimate | POST | تقدير جمهور البث | ❌ |

### routers/ai.py — 8 (كلها ❌ — dec-agent-stack)
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /api/ai/suggest | POST | 3 اقتراحات رد لتعليق | ❌ |
| /api/ai/analyze | POST | تحليل نبرة/مشاعر تعليق | ❌ |
| /api/ai/generate-reply | POST | توليد رد بسياق كلمات مفتاحية | ❌ |
| /api/ai/analyze-image | POST | تحليل صورة | ❌ |
| /api/ai/status | GET | حالة مزود AI | ❌ |
| /api/agent/interpret | POST | الوكيل الذكي: فهم أمر عربي وتنفيذه | ❌ |
| /api/agent/memory | GET | ذاكرة جلسة الوكيل | ❌ |
| /api/agent/memory/clear | POST | مسح ذاكرة الجلسة | ❌ |

### routers/publisher_routes.py — 4 (كلها ❌)
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /api/publisher/status | GET | حالة الناشر متعدد المنصات | ❌ |
| /api/publisher/settings/{platform} | GET | قالب حقول منصة | ❌ |
| /api/publisher/configure | POST | حفظ اعتمادات منصة | ❌ |
| /api/publisher/publish | POST | نشر/جدولة عبر منصة | ❌ |

### routers/users.py — 3 (كلها ❌)
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /api/users | POST | **إضافة عضو فريق** | ❌ (صفحة الفريق للقراءة فقط!) |
| /api/users/{id} | PUT | تعديل دور/كلمة مرور عضو | ❌ |
| /api/users/{id} | DELETE | حذف عضو | ❌ |

### routers/analytics.py — 11
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /api/analytics/overview | GET | نظرة عامة 30 يومًا | ✅ analytics + audience |
| /api/analytics/export | GET | تصدير CSV | ❌ |
| /api/analytics/scheduler-check | POST | فحص مجدول التقارير | ❌ |
| /api/analytics/dashboard | GET | لوحة تحليلات مجمعة | ✅ reports |
| /api/analytics/daily-trend | GET | اتجاه يومي | ❌ |
| /api/analytics/hourly-heatmap | GET | خريطة حرارية ساعية | ❌ |
| /api/analytics/top-rules | GET | أكثر القواعد اشتعالًا | ❌ |
| /api/analytics/sentiment-trend | GET | اتجاه المشاعر | ❌ |
| /api/analytics/peak-hour | GET | ساعة الذروة | ❌ |
| /api/analytics/top-commenters | GET | أكثر المعلقين | ✅ audience + reports |
| /api/analytics/period-comparison | GET | مقارنة فترتين | ❌ |

### routers/reports_routes.py — 5 (كلها ❌)
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /api/reports/status | GET | توافر محرك PDF | ❌ |
| /api/reports/generate | POST | **توليد تقرير PDF** (شهري/مشتركين/حملة + شعار مخصص) | ❌ |
| /api/reports/schedule | POST | جدولة تقرير دوري | ❌ |
| /api/reports/schedules | GET | قائمة الجداول | ❌ |
| /api/reports/schedules/{id} | DELETE | حذف جدول | ❌ |

### خارج `routers/` (app/) — للاكتمال
| المسار | الفعل | الوصف (سطر واحد) | مستهلك واجهة؟ |
|---|---|---|---|
| /webhook | GET/POST | ويبهوك فيسبوك (محرك كل شيء حي) | ⚙️ فيسبوك |
| /ws | WebSocket | بث حي (stats/bot_health/agent_message) | ❌ لا مستهلك |
| /api/events | GET (SSE) | بث أحداث حي | ❌ لا مستهلك (الواجهة تعتمد polling) |

---

## 3) الميزات الموعودة في الخطط المدفوعة مقابل الواقع

**مصدر الوعود:** بذور الخطط في `app/startup.py:96-168` (تنعكس في `/api/plans` → بطاقات /pricing و/subscribe). أسعار: Free=0 · Basic=19د.ل · Premium=29د.ل · Pro=129د.ل · Enterprise=299د.ل.

| الميزة الموعودة | الخطة الواعدة | Backend؟ | UI؟ | الحكم |
|---|---|---|---|---|
| ردود تلقائية (حدود شهرية) | الكل | ✅ بوابة max_replies في pipeline + ماسنجر | ✅ autoreply | ✅ **يعمل** |
| صفحات فيسبوك (حسب الخطة) | الكل | ⚠️ max_pages علم بلا إنفاذ (مقيد بنيويًا بصفحة واحدة) | ✅ pages | ⚠️ جزئي (قيد غير مفروض) |
| قواعد رد (5/20/50/100/∞) | الكل | ⚠️ **max_rules علم زخرفي — لا إنفاذ في POST /api/rules** | ✅ autoreply | ⚠️ الوعد غير مفروض خلفيًا |
| إحصاءات أساسية | Free+ | ✅ overview/dashboard | ✅ analytics | ✅ يعمل |
| رد خاص على التعليقات (DM) | Basic+ | ✅ بوابة has_dm (pipeline:413) | — (سلوك تلقائي) | ✅ يعمل |
| **ردود ذكية بالذكاء الاصطناعي** | Basic+ | ⚠️ 5 endpoints AI حية + بوابة has_ai في onboarding فقط — **البوت نفسه لا يستدعي AI في الرد (pipeline rule-based صرف)** | ❌ **لا زر «اقترح ردًا» في أي صفحة تعليقات** | ❌ **وعد بلا تفعيل ملموس للعميل** |
| تقارير أسبوعية | Basic | ⚠️ ReportSchedule يُكتب عبر API بلا مستهلك ولا مكدس بريد (dec-dead-tables) | ❌ | ❌ **وعد كاذب — لا آلية تسليم** |
| دعم فوري/ممتاز/24-7 | Basic+ | ✅ تذاكر + طابور أدمن + تلغرام | ✅ support + admin/support | ✅ يعمل (24-7 وعد تشغيلي لا برمجي) |
| بث جماعي للرسائل | Premium+ | ✅ has_broadcast مفروض + تصريف في cycle | ✅ broadcast | ✅ يعمل |
| جدولة المنشورات | Premium+ | ✅ مجدول calendar + تصريف | ✅ posts/scheduled/calendar | ✅ يعمل (⚠️ has_scheduling علم زخرفي — متاح عمليًا للجميع) |
| **تقارير PDF** | Premium | ✅ POST /api/reports/generate حي (606 سطر محرك) | ❌ **لا زر/صفحة** | ❌ **وعد بلا سطح** |
| **محرك العروض الترويجية** | Premium+ | ✅ موصول بالبوت (pipeline مرحلة 6) | ⚠️ **جزئي: عرض/تبديل/حذف فقط — لا إنشاء عرض من الواجهة** (POST /api/offers بلا مستهلك) | ❌ **فخ: العميل يدفع مقابل عروض لا يستطيع إضافتها** |
| **تحليلات متقدمة** | Premium+ | ✅ 8 endpoints جاهزة (heatmap/trend/comparison…) + has_analytics_advanced زخرفي | ❌ صفحة analytics تستهلك overview فقط | ❌ **وعد بلا سطح** |
| فريق حتى 2/5/∞ | Premium+ | ⚠️ POST/PUT/DELETE /api/users حية **بلا إنفاذ max_team** | ❌ **صفحة الفريق قراءة فقط — لا دعوة عضو** | ❌ **وعد بلا سطح + بلا إنفاذ** |
| **حملات تسلسلية** | Pro+ | ✅ محرك حي يُصرَّف كل نبضة (v16) + 11 endpoint | ❌ **صفر واجهة — لا يمكن إنشاء حملة أصلًا** | ❌ **أغلى وعد (129د.ل) بلا سطح** |
| جميع الميزات المتقدمة/بلا استثناء | Pro/Enterprise | — | — | تُفسَّر بما سبق: يشمل الناقص كله |
| محفظة/شحن الرصيد | (تُعرض في الفواتير) | ⚠️ topup/confirm بلا مستهلك + **لا مسار إنفاق** (dec-wallet-spend: فخ مال) | ⚠️ billing يعرض الرصيد فقط | ❌ نصف ميزة (شحن بلا إنفاق بلا زر شحن) |

**أعلام الخطة الزخرفية (decorative) بلا نقطة إنفاذ:** `max_rules` · `max_pages` · `max_team` · `has_scheduling` · `has_flows` · `has_offers` · `has_sequences` · `has_reports` · `has_analytics_advanced`. **المفروضة فعليًا:** `max_replies` · `has_dm` · `has_ai` (onboarding فقط) · `has_broadcast` · حالة الاشتراك/الانتهاء (engine.py:115).

---

## 4) الجداول الميتة (dec-dead-tables) — فحص سريع v17

| الجدول | الحالة v17 | الدليل |
|---|---|---|
| `conversation_notes` | **ما زال ميتًا** — صفر قارئ/كاتب | لا يظهر إلا في models.py:620 + cascade حذف المستأجر (admin_routes:373) |
| `conversation_assignees` | **ما زال ميتًا** | models.py:632 + cascade الحذف فقط |
| `offer_claims` | **ما زال ميتًا** | models.py:330 + cascade الحذف فقط |
| `ReportSchedule` | **يُكتب ولا يُرسل** — الصفوف تُنشأ عبر POST /api/reports/schedule (لا مستهلك واجهة أصلًا) ولا مكدس بريد/كرون يقرأها | كتابة/قراءة فقط في reports_routes.py؛ `last_sent` لا يحدّثه أحد |

الخلاصة: **لا تغيير منذ v16** — البند ما زال مفتوحًا بانتظار قرار منتج (بناء مستهلك/واجهة أو حذف موقّع).

---

## 5) المحركات — من يشغّلها وهل لها واجهة؟

| المحرك (سطور v17) | من يشغّله؟ | واجهة؟ | الحكم |
|---|---|---|---|
| **bot_engine** (pipeline/engine ~769) | حلقة خلفية محليًا + Vercel Cron يوميًا + الويبهوك (fast_ack) | — (سلوك تلقائي) + صفحات المراقبة | ✅ حي ومستهلك |
| **sequence_engine** (748) | ✅ **حي منذ v16**: `process_due_sequence_steps` يُصرَّف في كل نبضة (engine.py:256) + SequenceScheduler محلي (startup:254) + 11 endpoint | ❌ **صفر واجهة** — لا يمكن لأحد إنشاء حملة/اشتراك مشترك | ⚠️ **محرك يعمل بلا وقود — أعلى مرشح لواجهة** |
| **flow_engine** (586) | ⚠️ لا أحد تلقائيًا — يُنفَّذ فقط عبر POST /api/flows/{id}/test (يدوي) | ❌ | ❌ **ميت عمليًا** (بلا مشغّل ولا واجهة) — قرار منتج dec-agent-stack |
| **agent_engine + brain + tools + memory** (~820) | لا أحد إلا POST /api/agent/interpret | ❌ | ❌ dec-agent-stack — إما واجهة مساعد ذكي أو إيقاف (~3,400 سطر مع الحزمة) |
| **publisher_engine** (232) | endpoints فقط (publisher_routes) — لا كرون | ❌ | ❌ ميت سطحًا (منصات خارج فيسبوك بلا اعتمادات ولا واجهة) |
| **commerce_engine** (164) | endpoints فقط (Shopify) | ❌ | ❌ ميت سطحًا (أدمن منصة، لا متجر مربوط) |
| **offer_engine** (76) | ✅ **موصول بالبوت** (pipeline مرحلة 6: عرض تلقائي حسب النية) | ⚠️ جزئي (list/toggle/delete بلا create) | ⚠️ يعمل للمستأجرين الذين أُدخلت عروضهم يدويًا/API — فجوة الإنشاء قاتلة تجاريًا |
| **pdf_reports_engine** (606) | عند الطلب فقط (POST /api/reports/generate) | ❌ | ❌ حي خلفيًا بلا زر |
| **broadcast_engine** (564) | ✅ cycle يصرّف pending + بوابة has_broadcast | ✅ broadcast | ✅ كامل الطرفين |
| **content_calendar** (501) | ✅ CalendarScheduler محلي + تصريف الكرون (release_scheduled_post) | ✅ posts/scheduled/calendar | ✅ كامل الطرفين |
| **ai_service** (get_ai) | endpoints /api/ai/* + onboarding/suggest-reply فقط — **البوت لا يستعمله** | ⚠️ onboarding فقط | ⚠️ نصف موصول |
| **subscriber_engine/tag_engine/team_engine** | endpoints المناظرة | ⚠️ جزئي (subscribers GET وteam/members فقط) | ⚠️ قراءة فقط بلا إدارة |
| **ws_manager + event_bus + /api/events SSE** | جسور startup تبث (stats/bot_health/agent_message) | ❌ **لا مستهلك WS/SSE في الواجهة** (كل الصفحات polling) | ⚠️ طبقة حية بلا مستمع |

---

## 6) أسماء عربية مقترحة للميزات الناقطة

| الميزة الناقطة | الاسم العربي المقترح (UI) |
|---|---|
| POST /api/offers (إنشاء عرض) | **«إضافة عرض جديد»** (قسم العروض — أدوات) |
| /api/sequences/* | **«الحملات التسلسلية»** / «سلاسل الرسائل المتباعدة» (Drip) |
| POST /api/reports/generate | **«تنزيل تقرير PDF»** / «تقرير شهري جاهز للطباعة» |
| POST /api/subscriptions/upgrade | **«ترقية خطتك»** |
| POST /api/payments/topup + confirm | **«شحن الرصيد»** (محفظة SmartBot) |
| POST/PUT/DELETE /api/users | **«إضافة عضو فريق»** / «إدارة الفريق والأدوار» |
| /api/ai/suggest | **«اقترح ردًا بالذكاء الاصطناعي»** |
| /api/agent/* | **«المساعد الذكي»** (وكيل الأوامر العربي) |
| PUT /api/rules/{id} | **«تعديل القاعدة»** |
| PUT /api/templates/{id} | **«تعديل القالب»** |
| POST /api/broadcasts/{id}/cancel | **«إلغاء البث المعلق»** |
| POST /api/support/tickets/{id}/close | **«إغلاق التذكرة»** |
| /api/health/bot-check + alerts | **«صحة البوت»** / «فحص فوري» |
| /api/analytics/{daily-trend, hourly-heatmap, peak-hour, period-comparison, top-rules, sentiment-trend} | **«اتجاه الردود اليومي» · «خريطة ساعات الذروة» · «ساعة الذروة» · «مقارنة الفترات» · «أكثر القواعد استخدامًا» · «مزاج الجمهور»** |
| /api/widgets/recent-activity | **«آخر الأنشطة»** |
| /api/subscribers/{id}/tags + /api/tags | **«وسوم الجمهور»** |
| /api/inbox/tags | **«تصنيف المحادثات»** |
| /api/team/{activity,performance} | **«نشاط الفريق» · «أداء الأعضاء»** |
| POST /api/crm/customers | **«إضافة عميل يدويًا»** |
| /api/broadcasts/estimate | **«تقدير حجم البث»** |
| GET /api/replies | **«سجل ردود البوت»** |
| /api/posts (فيسبوك) | **«منشورات صفحتك»** |
| /api/admin/platform/users | **«مستخدمو المنصة»** (أدمن) |
| /api/diagnostics/* | **«تشخيص النظام»** (أدمن) |
| /api/audit/logs | **«سجل التدقيق»** |
| /ws + /api/events | **«التحديث الحي»** (بلا polling) |

---

## 7) قائمة مرتبة بالأولوية — ما يستحق واجهة في جولة v17 (مع الكلفة)

الكلفة: 🟢 = عنصر في صفحة قائمة (نموذج/زر) · 🟡 = صفحة جديدة كاملة أو تكوين مكوّن كبير · المعيار: قيمة مدفوعة × جاهزية الخلفية ÷ الكلفة.

| # | الميزة | لماذا الآن | الكلفة | ملاحظات |
|---|---|---|---|---|
| 1 | **زر «إضافة عرض جديد»** (POST /api/offers) | وعد Premium «محرك العروض» معطوب نصفًا: البوت يقدم العروض لكن لا سبيل لإنشائها — فجوة إنشاء واحدة تغلق الوعد | 🟢 نموذج صغير في tools (نفس نمط نموذج «قالب جديد» الموجود حرفيًا) | أرخص إصلاح لوعد مدفوع في كل النظام |
| 2 | **زر «ترقية خطتك»** (POST /api/subscriptions/upgrade) | مسار مال جاهز طرفًا-لطرفًا بلا مدخل؛ حاليًا الترقية تمر بالدعم يدويًا | 🟢 زر في billing/subscribe يعيد استخدام PaymentDialog كما هو | endpoint يفرض الخطة الأعلى ويمنع الأدنى |
| 3 | **صفحة «الحملات التسلسلية»** (/api/sequences) | وعد Pro (129د.ل) «حملات تسلسلية» — المحرك حي يُصرَّف كل نبضة منذ v16 لكن لا أحد يستطيع إنشاء حملة؛ أعلى قيمة مفقودة | 🟡 صفحة dashboard/sequences جديدة (قائمة + محرر خطوات + زر اشتراك مشترك) | 11 endpoint جاهزة؛ اقتراح نسخ بنية صفحة broadcast |
| 4 | **زر «تنزيل تقرير PDF»** (POST /api/reports/generate) | وعد «تقارير PDF/أسبوعية» في Basic+Premium — الصفحة موجودة (reports) لكنها تقرأ analytics فقط | 🟢 زر + تحميل blob + خيارات النوع/المدة في صفحة reports القائمة | الجدولة البريدية (schedule) تبقى مؤجلة (لا مكدس بريد — dec-dead-tables) |
| 5 | **«إدارة الفريق»** (POST/PUT/DELETE /api/users) | وعد «فريق حتى N» في 3 خطط مدفوعة — الصفحة الحالية قراءة فقط | 🟢→🟡 نموذج إضافة عضو + تعديل دور + زر حذف في صفحة team القائمة | يتطلب أيضًا قرار إنفاذ max_team خلفيًا (سطر واحد في POST) |
| 6 | **زر «اقترح ردًا بالذكاء الاصطناعي»** (POST /api/ai/suggest) | وعد Basic «ردود ذكية AI» بلا أي أثر ملموس للعميل؛ الباقي سلوك onboarding فقط | 🟢 زر في comments يفتح dialog باقتراحات قابلة للإدراج في الرد | يتطلب مفاتيح AI نشطة (ai/status موجود للفحص) |
| 7 | **«إلغاء البث المعلق» + «إغلاق التذكرة» + «تعديل قاعدة/قالب»** (cancel/close/PUT×2) | 4 endpoints CRUD مكتملة بلا أزرار — قيمة تشغيلية يومية | 🟢 أزرار صغيرة (أربعة مواضع) | دفعة واحدة رخيصة |
| 8 | **«تحليلات متقدمة»** (daily-trend/heatmap/peak-hour/top-rules/period-comparison) | وعد Premium بلا سطح؛ البيانات والendpoints جاهزة | 🟡 تكوين مخططات في صفحة analytics القائمة (ChartCard موجود) | قد يُنفذ تدريجيًا (مخطط واحد لكل موجة) |
| 9 | **بطاقة «صحة البوت»** (/api/health/bot-check + alerts) | تشغيلية: انقطاع التوكن/القواعد يكتشفه الأدمن متأخرًا؛ يكمل CronHeartbeatCard | 🟢 بطاقة في dashboard الرئيسية | زر «فحص فوري» + قائمة تنبيهات |
| 10 | **«شحن الرصيد»** (topup/confirm) | نصف ميزة المحفظة | 🟢 بطاقة+dialog في billing | ⚠️ **مقيّد بقرار منتج dec-wallet-spend** — لا معنى للشحن قبل مسار إنفاق؛ يُبنى فقط مع القرار |
| 11 | **«المساعد الذكي»** (/api/agent/*) | جوهر dec-agent-stack: ~820 سطرًا موصولة بلا مستهلك | 🟡 صفحة/لوحة دردشة | ⚠️ **قرار منتج صريح مطلوب** (بناء أو إيقاف 3,400 سطر) — لا يُبنى ضمنيًا |
| 12 | **وسوم الجمهور/المحادثات** (tags) | تنظيم CRM واعد | 🟡 | أولوية منخفضة هذه الجولة |
| 13 | **«التحديث الحي» (WS/SSE) للوحة الرئيسية** | بنية موجودة (ws_manager/event_bus) تحل محل polling | 🟡 | تحسين تجربة — مرشح جولات لاحقة |

**لا يُوصى بواجهة هذه الجولة (يبقى قرار المالك):** flows (لا مشغّل أصلًا — إما ربطها بالويبهوك أو إيقافها ضمن dec-agent-stack) · publisher/commerce (منصات خارجية بلا اعتمادات/منتج) · brand (هوية منصة عالمية — use-case ضعيف) · diagnostics/admin التشغيلية (repair/cooldown/priority/template-vars/rules-categories/platform-users) — أدوات مشغل API-first مقبولة · /api/posts و/api/messages (مكررة وظيفيًا بـscheduled-posts وinbox) · /api/agent/* (مقيّد بالقرار أعلاه).

---

## 8) ملاحظات قرار للمنسّق

1. **dec-agent-stack** ما زال مفتوحًا كما هو: الحزمة الآن ~820 (وكيل) + 586 (flow) + 232 (publisher) + 164 (commerce) + 606 (pdf) + راوتراتها. أعلاه فصلٌ عملي: **pdf وsequences وusers وai-suggest وoffers-create تستحق واجهة فورًا بلا قرار** (كلها ميزات موعودة أو مسارات مال)، بينما agent/flow/publisher/commerce هي جوهر قرار «بناء أو إيقاف».
2. **فجوات إنفاذ أعلام الخطة** (max_rules/max_team/max_pages/has_scheduling) — ليست فجوة واجهة لكنها تكمل صورة «الوعد مقابل الواقع»: أي واجهة جديدة للفريق يجب أن تصحبها بوابة max_team خلفية.
3. **البطاقة الأمنية للتقرير:** لا تعديلات أُجريت (READ-ONLY). كل الأرقام من قراءة مباشرة بتاريخ الجولة (commit main @ 1338038c).
4. طرق التحقق المستخدمة: rg للمسارات في frontend/src (مطابقة المقاطع الأخيرة للمسارات الديناميكية) + قراءة كل راوتر لاستخراج الفعل/الوصف + قراءة بذور الخطط للمطابقة. عدد الendpoints تحقق برمجيًا (240 decorator عبر 41 ملفًا).
