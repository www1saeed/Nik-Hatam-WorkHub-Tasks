# Nik Hatam WorkHub

Production-ready Laravel + Angular workspace platform for multilingual business operations.

- EN brand: `Nik Hatam WorkHub`
- FA brand: `نیک‌حاتم کار‌مدار`

## Why this project is a strong solution
- Clean architecture: backend API and frontend app are clearly separated and maintainable.
- Testable by design: unit, feature, and E2E test layers are already integrated.
- Responsive UX: desktop and mobile experiences are implemented and continuously tested.
- Multilingual and bi-directional: Persian (RTL), English (LTR), and German (LTR).
- Secure and practical auth: Sanctum token flow, role-based authorization, social auth support.
- Extensible core: new modules can be added quickly without rewriting foundational layers.
- Real-world ready: user/role/permission management, profile workflows, localization, validation.

## Core capabilities
- Backend: Laravel API with Sanctum authentication.
- Frontend: Angular + PrimeNG workspace UI.
- RBAC: users, roles, permissions CRUD with access control checks.
- Localization: dynamic language and direction switching (RTL/LTR).
- Profile management: validations, locale-aware behavior, and account flows.
- Social auth: Telegram-based login/registration flows.
- PWA assets: manifest, icons, browser config integration.

## WorkHub feature modules
- Daily responsibilities (tasks): create, edit, assign, mark done, and delete.
- Task comments: threaded operational notes with sync-state badges.
- Task photos: upload from device, capture from camera, preview, and delete.
- Notifications: unread badge, short feed in header, and dedicated notifications page.
- Offline-first sync: local queue for task/comment/photo operations with retry and dead-letter handling.
- Photo access control: photo files are served only to roles with task-management permissions.
- Theme + language UX: light/dark mode toggle and Persian/English/German switching in header.

## Technology stack
- Backend: Laravel 11, Sanctum, MySQL
- Frontend: Angular 21, PrimeNG, Transloco
- Testing: PHPUnit, Angular test runner, Playwright
- Mobile path: Capacitor Android integration guide included in docs

## Quick start (local)
### Backend
1. Configure `backend/.env` (`DB_*`, `APP_URL`, `FRONTEND_URL`, `MAIL_*`).
2. Install dependencies: `cd backend && composer install`
3. Run migrations/seeders as needed.
4. Start API: `php artisan serve`

### Frontend
1. Install dependencies: `npm --prefix frontend install`
2. Start app: `npm --prefix frontend run start`

## Testing and quality
- Frontend lint: `npm --prefix frontend run lint`
- Frontend coverage: `npm --prefix frontend run test:coverage`
- E2E desktop: `npm --prefix frontend run e2e:desktop`
- E2E mobile: `npm --prefix frontend run e2e:mobile`
- Backend tests: `cd backend && php artisan test`

## GitHub publication checklist
- Keep all secrets out of the repository (`.env`, API tokens, private keys).
- Use `.env.example` files for backend/frontend setup values.
- Keep logo and app icons under `frontend/public`.
- Include release notes/changelog for public versions.

## Documentation
- Docs index: `docs/INDEX.md`
- Requirements: `docs/requirements/PROJECT_REQUIREMENTS_EN.md`
- Testing guide: `docs/testing/TESTING_GUIDE_EN.md`
- Extension guide: `docs/EXTENSION_GUIDE_EN.md`
- Capacitor Android guide: `docs/MOBILE_CAPACITOR_ANDROID_EN.md`
- API reference: `backend/docs/api.md`

## Language-specific overviews
- EN: `README_EN.md`
- DE: `README_DE.md`
- FA: `README_FA.md`

## License
This repository is published under the Creative Commons Attribution 4.0 International license (`CC BY 4.0`).

- License file: `LICENSE`
- License summary: https://creativecommons.org/licenses/by/4.0/
