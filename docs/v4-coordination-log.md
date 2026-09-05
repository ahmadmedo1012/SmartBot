# v4 coordination log (خطة المالك §2 — سطر لكل تنسيق)

- main → Team 2: 61 ملفاً هُجّرت دلالياً بعد حذف `--color-orange` من `@theme` في globals.css (الترحيل والتعريفات في نفس الالتزام حتى لا يتعطل البناء لحظة)
- Team 3 → Team 1: حذف تعريفات الخطوط المكررة من `:root` أبقى `var(--font-heading)` يشير إلى انبعاث `@theme` — تم التحقق في CSS المجمَّع (تعريف واحد Readex-first)
- Team 4 → Team 2: `GlowPool` تخلّص من literal oklch وصار يشترك في `--accent-foreground` مع بقية الترحيل
- Team 7 → الجميع: بوابة `scripts/check-css-token-duplication.py` تُشغَّل قبل كل push (exit 0 إلزامي)
- main → المالك: كرون `*/5` رفضته خطة Hobby → يومي 04:00 + نبض خارجي cron-job.org عبر `?token=`
