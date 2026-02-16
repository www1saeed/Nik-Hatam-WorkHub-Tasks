# Testing Guide (EN)

## Scope
This guide documents the implemented test layers for Angular (frontend) and Laravel (backend), plus how to run coverage and extend tests safely.

## Frontend (Angular)

### Implemented
- Unit tests for:
  - `AuthService`, `LanguageService`, `AdminUsersService`, `AdminRolesService`, `AdminPermissionsService`, `ProfileService`, `SidebarService`
  - `authGuard`, `permissionGuard`
  - `authTokenInterceptor`
  - `DateUtils`, `Validators`, `error-mapper`
  - `DashboardShellComponent` logic
  - route smoke tests (`app.routes`)
  - root app smoke tests (`app`)
- E2E (Playwright), split by device:
  - Desktop specs: `frontend/e2e/*.desktop.spec.ts`
  - Mobile specs: `frontend/e2e/*.mobile.spec.ts`

### Run
```bash
npm --prefix frontend run lint
npm --prefix frontend test -- --watch=false
npm --prefix frontend run test:coverage
npm --prefix frontend run e2e
npm --prefix frontend run e2e:desktop
npm --prefix frontend run e2e:mobile
npm --prefix frontend run e2e:list
```

### Playwright notes
- Install browsers once:
```bash
npx playwright install
```
- If you run Playwright via `npm exec`, pass project args after `--`:
```bash
npm --prefix frontend exec playwright test -- --project=chromium-mobile
```
- Prefer the package scripts (`e2e:desktop`, `e2e:mobile`) to avoid npm argument parsing warnings.

### Coverage output
- Angular coverage output is generated under `frontend/coverage/` when `npm --prefix frontend run test:coverage` is used.
- Coverage provider dependency: `@vitest/coverage-v8` (devDependency).

## Backend (Laravel)

### Implemented
- Unit tests:
  - `User` model behavior (mutator + role/permission checks)
  - `TelegramAuthService`
  - `PasswordResetLinkService`
  - `ProfilePresenter`
- Feature/API tests:
  - auth flow and negative cases (`/api/auth/*`)
  - profile API (`/api/profile`, `/api/profile/availability`) including validation and social-account email rules
  - user API authorization + CRUD + duplicate validation + missing resource checks
  - roles/permissions authorization + CRUD validation + missing resource checks
- Factories:
  - `UserFactory`, `RoleFactory`, `PermissionFactory`
- PHPUnit config:
  - `backend/phpunit.xml`

### Run
```bash
cd backend
php artisan test
php artisan test --testsuite=Unit
php artisan test --testsuite=Feature
php artisan test --coverage-html=coverage
php artisan test --filter=ProfileApiTest
```

### Backend test prerequisites
- Ensure backend dependencies are installed: `cd backend && composer install`
- Ensure the test database is reachable before running feature tests (`php artisan test`), otherwise tests fail with DB connection errors (`SQLSTATE[HY000] [2002]`).

### Coverage output
- HTML coverage is generated under `backend/coverage`.

## Security/Negative Scenarios Covered
- invalid credentials
- unverified-email login blocked
- duplicate email/username rejected
- unauthorized access (`401`/`403`)
- invalid and malicious registration payload rejected
- missing resources (`404`) in protected APIs

## Path to >90%
- keep adding component-level tests for remaining Angular feature pages
- add API tests for remaining Laravel controllers (member/person modules (guest slug compatibility))
- add stress/security cases: rate limiting, race conditions, upload constraints

## Latest Coverage Push (Frontend)
- expanded branch-heavy tests for:
  - `src/app/features/profile/profile.component.ts`
  - `src/app/features/admin/pages/users/users-page.component.ts`
  - `src/app/features/admin/pages/roles/roles-page.component.ts`
  - `src/app/features/admin/pages/permissions/permissions-page.component.ts`
- current statement coverage for those files:
  - profile: `71.94%`
  - users: `82.27%`
  - roles: `82.82%`
  - permissions: `95.04%`
- note: global frontend percentage is still reduced by uncovered `.html` template files, which are reported separately by V8 coverage.

## Latest E2E Expansion
- added richer Playwright scenarios in:
  - `frontend/e2e/language-and-sidebar.desktop.spec.ts`
  - `frontend/e2e/language-and-sidebar.mobile.spec.ts`
- new checks include:
  - desktop admin vs limited-user sidebar visibility (permission-driven menu rendering)
  - desktop sidebar collapse/expand behavior
  - mobile overlay open/close and close-on-navigation
  - mobile language switch (`en` -> `fa`) with RTL shell verification

