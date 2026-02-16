# Nik Hatam WorkHub (EN)

Modern Laravel + Angular workspace platform built for multilingual, testable, and extensible operations.

## Value proposition
- Clean codebase structure across backend and frontend
- High testability (unit + feature + E2E)
- Responsive UI for desktop and mobile
- Full RTL/LTR language direction support
- RBAC and secure authentication flows
- Easy feature extension for future business modules

## Highlights
- Laravel API + Sanctum authentication
- Angular workspace with PrimeNG components
- Users/Roles/Permissions management
- Profile workflows with strong validation
- Persian, English, and German localization
- Telegram social login

## Quick start
- Backend:
  - `cd backend && composer install`
  - configure `.env`
  - `php artisan serve`
- Frontend:
  - `npm --prefix frontend install`
  - `npm --prefix frontend run start`

## Testing
- `npm --prefix frontend run lint`
- `npm --prefix frontend run test:coverage`
- `npm --prefix frontend run e2e:desktop`
- `npm --prefix frontend run e2e:mobile`
- `cd backend && php artisan test`

## Docs
- Index: `docs/INDEX.md`
- Requirements: `docs/requirements/PROJECT_REQUIREMENTS_EN.md`
- Testing: `docs/testing/TESTING_GUIDE_EN.md`
- Extension: `docs/EXTENSION_GUIDE_EN.md`
- Capacitor Android: `docs/MOBILE_CAPACITOR_ANDROID_EN.md`

## License
Released under Creative Commons Attribution 4.0 International (`CC BY 4.0`).

- `LICENSE`
- https://creativecommons.org/licenses/by/4.0/
