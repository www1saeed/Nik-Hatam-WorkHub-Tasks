# نیک‌حاتم کار‌مدار (FA)

یک پلتفرم مدرن Laravel + Angular برای مدیریت عمومی، چندزبانه، تست‌پذیر و توسعه‌پذیر.

## چرا این پروژه یک راهکار قوی است
- معماری تمیز و تفکیک‌شده بین Backend API و Frontend
- تست‌پذیری بالا (Unit + Feature + E2E)
- رابط کاربری واکنش‌گرا برای دسکتاپ و موبایل
- پشتیبانی کامل از RTL/LTR
- احراز هویت امن با Sanctum و کنترل دسترسی مبتنی بر نقش (RBAC)
- توسعه‌پذیری سریع برای افزودن ماژول‌های جدید

## قابلیت‌های کلیدی
- بک‌اند Laravel با Sanctum
- فرانت‌اند Angular با PrimeNG
- مدیریت کاربران، نقش‌ها و مجوزها (CRUD کامل)
- تغییر پویا بین زبان و جهت متن
- فرم‌ها و اعتبارسنجی حرفه‌ای در پروفایل و احراز هویت
- ورود و ثبت‌نام اجتماعی با Telegram
- آماده برای PWA (manifest، آیکن‌ها و browser config)

## شروع سریع
- Backend:
  - `cd backend && composer install`
  - تنظیم `backend/.env`
  - `php artisan serve`
- Frontend:
  - `npm --prefix frontend install`
  - `npm --prefix frontend run start`

## کیفیت و تست
- `npm --prefix frontend run lint`
- `npm --prefix frontend run test:coverage`
- `npm --prefix frontend run e2e:desktop`
- `npm --prefix frontend run e2e:mobile`
- `cd backend && php artisan test`

## مستندات
- فهرست مستندات: `docs/INDEX.md`
- الزامات پروژه: `docs/requirements/PROJECT_REQUIREMENTS_FA.md`
- راهنمای تست: `docs/testing/TESTING_GUIDE_FA.md`
- راهنمای توسعه: `docs/EXTENSION_GUIDE_FA.md`
- راهنمای Android/Capacitor: `docs/MOBILE_CAPACITOR_ANDROID_EN.md` و `docs/MOBILE_CAPACITOR_ANDROID_DE.md`

## مجوز
این مخزن با مجوز Creative Commons Attribution 4.0 International (`CC BY 4.0`) منتشر می‌شود.

- `LICENSE`
- https://creativecommons.org/licenses/by/4.0/
