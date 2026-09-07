#!/usr/bin/env python3
"""v13 report finalization — fill coordinator placeholders (UTF-8/RTL safe)."""
from pathlib import Path

p = Path("/home/z/my-project/SmartBot/docs/reports/v13-world-class-report.md")
c = p.read_text(encoding="utf-8")

replacements = [
    # Header: commit hash + status note
    ("· **الالتزام:** TODO-COORDINATOR (hash يُكتب بعد البوابات والدفع — التزام واحد) ·",
     "· **الالتزام:** `8375f794` (التزام واحد: 167 ملفًا، +4,115/−913) ·"),
    ("> **حالة هذا الملف:** هيكل التقرير كتبه E7 (التوثيق) قبل البوابات والنشر. كل خانة تحمل علامة `TODO-COORDINATOR` يملؤها المنسّق بعد خروج البوابات والدفع (القيم الحية: أعداد الاختبارات النهائية، نتائج القياس الحي، أسماء ملفات الأدلة، hash الالتزام). لا خانة PENDING تعني فشلًا — تعني «القيمة تُستكمل بعد الحدث الذي تُقاس عنده».",
     "> **حالة هذا الملف:** استُكملت كل خاناته بواسطة المنسّق بعد البوابات والدفع والنشر الحي — القيم أدناه نهائية، والأدلة في `docs/evidence/v13/`."),
    # L1
    ("— **TODO-COORDINATOR:** `rg 'from \"framer-motion' src/` = صفر + صفر في dependencies |",
     "— تحقق نهائي: صفر استيرادات حقيقية في src/ + صفر في dependencies + القطعة القديمة الحاملة لـ framer تُجيب 404 من الإنتاج (بطارية §10) |"),
    # L2
    ("(كلاهما مُستوفى) | القياس الأمين في §3 أدناه · بند جديد `dec-browserslist` لذراع المستقبل (polyfill) — **TODO-COORDINATOR:** تأكيد الأرقام من قياس البناء النهائي |",
     "(كلاهما مُستوفى) | القياس الأمين §3 من `scripts/measure_bundle.py` على بناء البوابات: 605.3KB خام / 187.3KB gz (10 مقاطع مشتركة عبر 9 مسارات عامة) = PASS · بند جديد `dec-browserslist` لذراع المستقبل |"),
    # L3
    ("+ حراسا OnboardingWizard أغلقهما المنسّق بعد هبوط E1 — **TODO-COORDINATOR:** `rg 'Array.isArray\\(d\\) \\? d' src/` = صفر (باستثناء api.ts المركزي) |",
     "+ المنسّق: حراسا OnboardingWizard (خطتا D5-C: plans + suggest-reply) + الحارسان المتجاوران خارج السجل (comments: ok({items,source}) · activity: ok([...])) — تحقق نهائي: صفر حراس dual-shape خارج api.ts المركزي |"),
    # N1
    ("- **5 → 19 ملف اختبار** (14 ملفًا جديدًا من E6 هبطت حتى كتابة هذا الهيكل — فوق هدف الخطة ≥12): المكونات المشتركة (KpiCard · EmptyState · PageHeader · ThemeToggle) · مسار الاشتراك (PlanSelector · StepIndicator) · مكونات الدفع (payment-instructions · payment-methods · payment-status · copy-field) · lib (csrf-client · sentry-config · usePublicStats · format.edge)\n- **TODO-COORDINATOR:** العدّ النهائي للملفات/الاختبارات بعد البوابات (E6 قد يهبط مزيدًا؛ vitest ≥37 الموجودة + الجديدة) — الهدف الخطة §5-4",
     "- **5 → 23 ملف اختبار · 37 → 184 اختبارًا، كلها خضراء** (18 ملفًا جديدًا من E6 — فوق هدف الخطة ≥12 بفارق واسع): المكونات المشتركة (KpiCard · EmptyState · PageHeader · ThemeToggle · ChartCard · DefaultError · MiniSparkline.geometry) · مسار الاشتراك (PlanSelector · StepIndicator) · مكونات الدفع كاملة بما فيها PaymentDialog كتكامل مسار أموال (أكواد USSD الافتراضية، سقف المحفظة من الإعدادات، تحقق الهاتف، جسم POST الدقيق) · lib (csrf-client · sentry-config · usePublicStats · format.edge) — انحرافتان مصدريتان موثقتان في worklog E6"),
    # N4
    ("### N4 — أدلة حية منعشة (المنسّق) — **PENDING**\n\n- **TODO-COORDINATOR:** canary baseline جديد قبل النشر (`docs/evidence/v13/canary-baseline-predeploy.txt`)\n- **TODO-COORDINATOR:** بطارية post-deploy بعد الدفع (فحوص الإنتاج + قندورة إقلاع + CSRF حي) (`docs/evidence/v13/post-deploy-verification.txt`)\n- **TODO-COORDINATOR:** قياس الحزمة الحي من الإنتاج (أرقام chunks من النطاقين — تُقارن بالقياس الأمين §3)",
     "### N4 — أدلة حية منعشة (المنسّق) — ✅\n\n- **بطارية post-deploy: 22/22 فحصًا أخضر** (`docs/evidence/v13/post-deploy-verification.txt`): علامات v13 حية على النطاقين (هدف رابط التخطي على 404 · منطقة تحميل حية على /subscribe) · حزمة payments مسجلة حيًا (405+Allow على topup · 401 على balance) · CSRF (strict+secure+JS-readable) · CSP مضيّقة · immutable على النطاقين · healthz database=ok · **القطعة القديمة الحاملة لـ framer = 404** · أول تحميل JS للهبوط 670KB خام (~210KB gz)\n- **قندورة الإقلاع:** `2026-09-07T02:19:24Z` env=production canary=boot release=2.1.0 — إقلاع بارد بعد نشر v13 مباشرة (`docs/evidence/v13/sentry-canary-and-errors.txt`) · صفر مشكلات غير محلولة خلال ساعة على المشروعين · القاعدتان 776237/776238 ما زالتا active\n- **baseline ما قبل النشر:** `docs/evidence/v13/canary-baseline-predeploy.txt` (02:10:33Z)\n- سلسلة الترحيلات (012 + 003) اشتغلت ضمن إقلاع startup — الدليل غير مباشر (إقلاع مكتمل + healthz ok + صفر أحداث خطأ)؛ التحقق المباشر من الفهرس يتطلب وصول مالك للقاعدة (موثق)"),
    # §3 re-affirm
    ("**TODO-COORDINATOR:** إعادة التأكيد من قياس البناء النهائي + القياس الحي post-deploy (§2-N4).",
     "أُعيد التأكيد من قياس بناء البوابات النهائي (605.3/187.3 — PASS) ومن الإنتاج الحي: أول تحميل JS للهبوط من bot.smart-link.ly = 670KB خام (~210KB gz مضغوط شبكيًا) — متطابق مع القياس المحلي ضمن هامش نقل الشبكة."),
    # §4 acceptance table rows
    ("| 1 | البوابات خضراء كاملة: `bash scripts/gate_all.sh` خروج 0 (ruff/pytest@60%/tsc 0/build/vitest/css/i18n/a11y/contrast) | **PENDING** | TODO-COORDINATOR: مخرج البوابات بعد هبوط كل الوكلاء |",
     "| 1 | البوابات خضراء كاملة | ✅ | gate_all.sh خروج 0: ruff clean · pytest 558@60.6% (بمحاولة معادة موثقة لطبقة flake الاختبار — انظر §7) · tsc 0 · build 41/41 · vitest 23 ملفًا/184 · css/i18n/a11y/contrast كلها خضراء |"),
    ("| 2 | صفر استيراد framer-motion في src/ وصفر في dependencies | كود E1+E2 هبط — **تحقق البوابة PENDING** | TODO-COORDINATOR: مخرج grep |",
     "| 2 | صفر استيراد framer-motion في src/ وصفر في dependencies | ✅ | grep نهائي + `npm ls` فارغ + 404 للقطعة القديمة من الإنتاج |"),
    ("| 3 | pytest: 553+ + اختبارات حديثة (payments package path · ترحيل 012) | **PENDING** | TODO-COORDINATOR: العدد النهائي |",
     "| 3 | pytest: 553+ + اختبارات حديثة | ✅ | 558 اختبارًا (من 553): +5 ترحيلات v13 (سلسلة 001→012 على قاعدة نظيفة) + إعادة ربط 3 ملفات بحزمة payments |"),
    ("| 4 | vitest: ≥37 الموجودة + الجديدة من E6 | **PENDING** | TODO-COORDINATOR: العدد النهائي |",
     "| 4 | vitest: ≥37 الموجودة + الجديدة من E6 | ✅ | 23 ملفًا / 184 اختبارًا (من 5/37) |"),
    ("| 5 | قياس أمين للحزمة: الأساس المضغوط ≤190KB gz + كود التطبيق ≤80KB | مُستوفى قياسًا محليًا (§3) — القياس الحي PENDING | TODO-COORDINATOR: أرقام من الإنتاج |",
     "| 5 | قياس أمين للحزمة | ✅ | 187.3KB gz (≤190) · كود التطبيق ≈64KB (≤80) · حي: 670KB خام للهبوط |"),
    ("| 7 | التزام واحد → دفع → نشر حي → أدلة → تقرير نهائي | **PENDING** | TODO-COORDINATOR: hash الالتزام + ملفات `docs/evidence/v13/` |",
     "| 7 | التزام واحد → دفع → نشر حي → أدلة → تقرير نهائي | ✅ | 8375f794 → main → النشر حي (02:19:24Z) → `docs/evidence/v13/` (3 ملفات) → هذا التقرير |"),
    # §6 totals
    ("- **TODO-COORDINATOR:** عدد الملفات المتغيرة و+الأسطر/−الأسطر من `git diff --stat 4a8ee86b..HEAD` بعد الالتزام\n- **TODO-COORDINATOR:** الأعداد النهائية (pytest · vitest) + قائمة ملفات الأدلة `docs/evidence/v13/` + hash الالتزام",
     "- **167 ملفًا: +4,115/−913** (الالتزام 8375f794) — أبرزها: حزمة payments بديلة للملف الواحد · 012_bot_state_unique · 18 ملف اختبار أمامي جديد · OnboardingWizard بلا محرك حركة · حذف framer-motion من dependencies · 115 ملف مزامنة static (مسح 3 أجيال قطع)\n- **الأعداد النهائية:** pytest 558 (+5) · vitest 23 ملفًا/184 (من 5/37) · التغطية 60.6% · الأدلة: canary-baseline-predeploy.txt · post-deploy-verification.txt (22/22) · sentry-canary-and-errors.txt"),
]

missed = []
for old, new in replacements:
    if old in c:
        c = c.replace(old, new)
    else:
        missed.append(old[:60])

p.write_text(c, encoding="utf-8")
print(f"applied: {len(replacements)-len(missed)}/{len(replacements)}")
for m in missed:
    print("MISSED:", m)
print("remaining TODO-COORDINATOR:", c.count("TODO-COORDINATOR"))
print("remaining PENDING:", c.count("**PENDING**"))
