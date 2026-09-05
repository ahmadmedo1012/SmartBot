# حماية الفرع الرئيسي (Branch Protection) — المرحلة 1.4

> هذه الإعدادات تُطبَّق من مالك المستودع على GitHub فقط (تتطلب صلاحيات Admin).
> فرع `develop` أُنشئ محلياً وجميع عمل الخطة يجري عليه ثم يُدمج في `main`.

## الحالة

| البند | الحالة | الدليل |
|-------|--------|--------|
| إنشاء فرع develop | ✅ منجز | `git branch` → `develop` موجود وكل الالتزامات تجري عليه |
| Branch protection على main | ⏳ يتطلب صلاحيات المالك | لا يمكن تكوينه عبر CLI بدون توكن GitHub بصلاحية admin |

## خطوات التطبيق على GitHub (للمالك)

1. GitHub → **Settings** → **Branches** → **Add branch ruleset** → target: `main`
2. فعِّل:
   - ✅ Require pull request reviews before merging → **1 approval**
   - ✅ Dismiss stale pull request approvals when new commits are pushed
   - ✅ Require linear history
   - ✅ Block force pushes (`Do not allow force pushes`)
3. (اختياري لكن موصى به) Require status checks: `pytest` و `npm run build`
4. سير العمل بعد ذلك: `develop` → PR → مراجعة → دمج في `main`

## سير العمل المعتمد محلياً حتى التفعيل

```
main ──┬── develop (كل مراحل الخطة تُنفذ هنا، التزام لكل مرحلة)
       └── دمج محلي --no-ff بعد إغلاق بوابة خروج كل مرحلة
```
