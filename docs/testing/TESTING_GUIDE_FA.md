# راهنمای تست (FA)

## دامنه
این راهنما لایه‌های تست پیاده‌سازی‌شده برای فرانت‌اند Angular و بک‌اند Laravel را توضیح می‌دهد و روش اجرای پوشش تست را مشخص می‌کند.

## فرانت‌اند (Angular)

### موارد پیاده‌سازی‌شده
- تست واحد برای:
  - `AuthService`، `LanguageService`، `AdminUsersService`، `AdminRolesService`، `AdminPermissionsService`، `ProfileService`، `SidebarService`
  - `authGuard` و `permissionGuard`
  - `authTokenInterceptor`
  - `DateUtils`، `Validators` و `error-mapper`
  - منطق `DashboardShellComponent`
  - تست دود مسیرها (`app.routes`)
  - تست دود اپلیکیشن ریشه (`app`)
- تست E2E با Playwright به‌صورت تفکیک‌شده:
  - تست‌های دسکتاپ: `frontend/e2e/*.desktop.spec.ts`
  - تست‌های موبایل: `frontend/e2e/*.mobile.spec.ts`

### اجرای تست‌ها
```bash
npm --prefix frontend run lint
npm --prefix frontend test -- --watch=false
npm --prefix frontend run test:coverage
npm --prefix frontend run e2e
npm --prefix frontend run e2e:desktop
npm --prefix frontend run e2e:mobile
npm --prefix frontend run e2e:list
```

### نکات Playwright
- مرورگرها را یک‌بار نصب کنید:
```bash
npx playwright install
```
- اگر از `npm exec` استفاده می‌کنید، آرگومان پروژه باید بعد از `--` بیاید:
```bash
npm --prefix frontend exec playwright test -- --project=chromium-mobile
```
- برای جلوگیری از هشدارهای پارس آرگومان npm، اجرای اسکریپت‌های `e2e:desktop` و `e2e:mobile` توصیه می‌شود.

### خروجی پوشش تست
- خروجی در `frontend/coverage/` با `npm --prefix frontend run test:coverage` ساخته می‌شود.
- وابستگی provider برای coverage: `@vitest/coverage-v8`.

## بک‌اند (Laravel)

### موارد پیاده‌سازی‌شده
- تست واحد:
  - رفتار مدل `User` (mutator و بررسی نقش/دسترسی)
  - `TelegramAuthService`
  - `PasswordResetLinkService`
  - `ProfilePresenter`
- تست ویژگی/API:
  - سناریوهای احراز هویت و حالت‌های منفی (`/api/auth/*`)
  - API کاربران: مجوز، CRUD، خطاهای تکراری، بررسی منابع ناموجود
  - API نقش/دسترسی: مجوز، اعتبارسنجی CRUD، بررسی منابع ناموجود
- فکتوری‌ها:
  - `UserFactory`، `RoleFactory`، `PermissionFactory`
- تنظیم PHPUnit:
  - `backend/phpunit.xml`

### اجرای تست‌ها
```bash
cd backend
php artisan test
php artisan test --testsuite=Unit
php artisan test --testsuite=Feature
php artisan test --coverage-html=coverage
```

### خروجی پوشش تست
- گزارش HTML در `backend/coverage` تولید می‌شود.

## سناریوهای منفی/امنیتی پوشش‌داده‌شده
- اطلاعات ورود نامعتبر
- جلوگیری از ورود با ایمیل تاییدنشدۀ کاربر
- جلوگیری از ثبت ایمیل/نام کاربری تکراری
- دسترسی غیرمجاز (`401`/`403`)
- رد ورودی‌های نامعتبر یا مخرب در ثبت‌نام
- مدیریت منابع ناموجود (`404`) در APIهای محافظت‌شده

## مسیر رسیدن به بیش از ۹۰٪ پوشش
- تکمیل تست کامپوننت‌های باقی‌ماندۀ Angular
- تکمیل تست API برای کنترلرهای باقی‌ماندۀ Laravel (`ProfileController` و ماژول‌های عضو/شخص (با حفظ slug مهمان))
- افزودن سناریوهای فشار و امنیت: Rate Limiting، Race Conditions، محدودیت آپلود فایل

