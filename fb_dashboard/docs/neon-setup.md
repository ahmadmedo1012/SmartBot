# ربط قاعدة بيانات PostgreSQL (Neon) / Connecting Neon PostgreSQL Database

## DATABASE_URL صيغة / URL Format

```
postgresql://user:password@ep-xxxx.eu-west-1.aws.neon.tech/neondb?sslmode=require
```

Neon لوحة تحكم → Project Settings → Connection Details → copy the "Connection string" (อย่าเลือก pooling لأن asyncpg بتعمله بنفسها).

> **مهم:** السكربت بيحول `postgresql://` لـ `postgresql+asyncpg://` تلقائيًا. فقط حط الـ URL العادي.

---

## خطوات الربط / Connection Steps

### 1. إنشاء قاعدة بيانات مجانية / Create Free Neon Database

1. سجل في https://console.neon.tech (بـ GitHub)
2. اضغط **Create Project** → اختار اسم (مثلاً `fb-dashboard`)
3. المنطقة (Region): الأقرب لك. Frankfurt `eu-west-1` مناسب
4. استلم الـ Connection string

### 2. ضبط DATABASE_URL / Set the Env Variable

في **Render Dashboard** → مشروعك → **Environment** → **Environment Variables**:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | `postgresql://user:password@ep-xxxx.eu-west-1.neon.tech/neondb?sslmode=require` |

**لا تضفها في `.env` — لأنها sensitive.** تضيفها يدويًا في Render Dashboard فقط.

### 3. الترحيل من SQLite لـ PostgreSQL / Migrate from SQLite to PG

نظام SQLAlchemy `Base.metadata.create_all()` بيشتغل تلقائيًا — الجداول بتتنشأ أول مرة.

**لكن: البيانات القديمة مش بتترحل تلقائيًا.** عشان تنقل بياناتك:

#### لو في SQLite local عندك (لازق في السيرفر):

```bash
# 1. على جهازك المحلي: ركّز قاعدة SQLite
sqlite3 data.db .dump > dump.sql

# 2. عدّل `dump.sql`: استبدل أي references لـ SQLite-specific types
sed -i 's/INTEGER PRIMARY KEY AUTOINCREMENT/SERIAL PRIMARY KEY/g' dump.sql

# 3. استورد لـ Neon مباشرة
psql "$DATABASE_URL" < dump.sql
```

#### لو لا:

- قاعدة البيانات هتبدأ فاضية أول تشغيل
- `import_json_data()` موجود (انظر `main.py`) يقدر يستورد بيانات من JSON لو عملت export من SQLite

### 4. التحقق / Verification

بعد أول deploy مع `DATABASE_URL`:

1. افتح `/api/me` → لو رجع 200 يبقى الربط شغال
2. ادخل على Neon dashboard → Tables → بتشوف `rules`, `replies`, `bot_logs`, إلخ.

---

## ملاحظات / Notes

- **SQLite افتراضي**: لو حذفت `DATABASE_URL` بالكامل من env vars، السيرفر بيرجع يشتغل على `data.db` (SQLite) تلقائيًا — لا حاجة لتعديل أي كود.
- **التعامل مع الـ password**: لو فيه `@` في الباسوورد، لازم URL-encode (`%40`).
- **Pool Connections**: `pool_size=5, max_overflow=10` — كافي للاستخدام العادي. لو جالك `too many connections`، قلّل الأرقام.

---

## Troubleshooting

| المشكلة / Issue | الحل / Fix |
|----------------|------------|
| `connection refused` | تأكد إن الـ IP مش ممنوع في Neon → Project Settings → IP许可 |
| `sslmode require` | الـ URL بياخد `?sslmode=require` تلقائي (config.py بيشيل query params للـ asyncpg) |
| `password authentication failed` | اتأكد إن الباسوورد من Neon Console مش من `psql` history |
| `relation "rules" does not exist` | أول تشغيل: `Base.metadata.create_all()` بيتنفذ في lifespan. لو فشل الصبر، شوف logs. |
