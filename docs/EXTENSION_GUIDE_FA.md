# راهنمای توسعه (FA)

این راهنما نحوه توسعه امن پروژه در فرانت‌اند و بک‌اند را توضیح می‌دهد.

---

## ۱) توسعه فرانت‌اند

### ۱.۱ افزودن فیچر جدید
1. یک فولدر جدید در `frontend/src/app/features/{feature-name}` بسازید.
2. کامپوننت‌ها و استایل‌ها را داخل همان فولدر قرار دهید.
3. مسیر را در `frontend/src/app/app.routes.ts` ثبت کنید.
4. کلیدهای ترجمه را در `frontend/public/i18n/fa.json` و `frontend/public/i18n/en.json` اضافه کنید.

### ۱.۲ افزودن سرویس API
1. سرویس را در `frontend/src/app/core/services` بسازید.
2. از `API_BASE_URL` در `frontend/src/app/core/config/api.config.ts` استفاده کنید.
3. برای payload/response اینترفیس تایپ‌شده بسازید.
4. خطاها را از طریق `core/utils/error-mapper` مدیریت کنید.

### ۱.۳ افزودن اعتبارسنجی
1. اعتبارسنج‌ها را در `frontend/src/app/core/utils/validators.ts` متمرکز کنید.
2. در فرم‌ها استفاده کنید و خطاها را هنگام تایپ نمایش دهید.

---

## ۲) توسعه بک‌اند

### ۲.۱ افزودن کنترلر جدید
1. کنترلر را در `backend/app/Http/Controllers` بسازید.
2. مسیرها را در `backend/routes/api.php` ثبت کنید.
3. مسیرها را با مجوزها محافظت کنید.

### ۲.۲ افزودن سرویس جدید
1. کلاس سرویس را در `backend/app/Services` بسازید.
2. از طریق DI در کنترلر تزریق کنید.
3. منطق را قابل استفاده مجدد نگه دارید.

### ۲.۳ افزودن مجوز جدید
1. مجوز را در Seeder اضافه کنید.
2. به نقش‌ها اختصاص دهید.
3. در UI و Guardها لحاظ کنید.

---

## ۳) ترجمه و بومی‌سازی
1. پیام‌های بک‌اند در `backend/resources/lang/fa` و `backend/resources/lang/en`.
2. پیام‌های فرانت‌اند در `frontend/public/i18n/fa.json` و `frontend/public/i18n/en.json`.
3. کلیدهای خطا را ثابت نگه دارید تا `error-mapper` درست کار کند.
