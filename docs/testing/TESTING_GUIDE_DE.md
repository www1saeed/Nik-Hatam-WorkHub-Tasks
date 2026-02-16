# Testleitfaden (DE)

## Umfang
Dieser Leitfaden beschreibt die implementierten Testebenen fuer Angular (Frontend) und Laravel (Backend) sowie die Ausfuehrung von Coverage.

## Frontend (Angular)

### Implementiert
- Unit-Tests fuer:
  - `AuthService`, `LanguageService`, `AdminUsersService`, `AdminRolesService`, `AdminPermissionsService`, `ProfileService`, `SidebarService`
  - `authGuard`, `permissionGuard`
  - `authTokenInterceptor`
  - `DateUtils`, `Validators`, `error-mapper`
  - Logik von `DashboardShellComponent`
  - Routing-Smoketests (`app.routes`)
  - Root-App-Smoketests (`app`)
- E2E (Playwright), getrennt nach Geraetetyp:
  - Desktop-Specs: `frontend/e2e/*.desktop.spec.ts`
  - Mobile-Specs: `frontend/e2e/*.mobile.spec.ts`

### Ausfuehren
```bash
npm --prefix frontend run lint
npm --prefix frontend test -- --watch=false
npm --prefix frontend run test:coverage
npm --prefix frontend run e2e
npm --prefix frontend run e2e:desktop
npm --prefix frontend run e2e:mobile
npm --prefix frontend run e2e:list
```

### Playwright-Hinweise
- Browser einmalig installieren:
```bash
npx playwright install
```
- Bei `npm exec` muessen Projekt-Argumente nach `--` uebergeben werden:
```bash
npm --prefix frontend exec playwright test -- --project=chromium-mobile
```
- Bevorzugt die Package-Skripte (`e2e:desktop`, `e2e:mobile`) nutzen, um npm-Argumentwarnungen zu vermeiden.

### Coverage-Ausgabe
- Angular-Coverage liegt unter `frontend/coverage/` (bei `npm --prefix frontend run test:coverage`).
- Coverage-Provider als Dev-Dependency: `@vitest/coverage-v8`.

## Backend (Laravel)

### Implementiert
- Unit-Tests:
  - Modellverhalten von `User` (Mutator + Rollen-/Rechtepruefung)
  - `TelegramAuthService`
  - `PasswordResetLinkService`
  - `ProfilePresenter`
- Feature/API-Tests:
  - Auth-Flows und Negativfaelle (`/api/auth/*`)
  - Profile-API (`/api/profile`, `/api/profile/availability`) inkl. Validierung und Social-Account-E-Mail-Regeln
  - User-API: Autorisierung, CRUD, Duplicate-Validierung, fehlende Ressourcen
  - Rollen-/Rechte-API: Autorisierung, CRUD-Validierung, fehlende Ressourcen
- Factories:
  - `UserFactory`, `RoleFactory`, `PermissionFactory`
- PHPUnit-Konfiguration:
  - `backend/phpunit.xml`

### Ausfuehren
```bash
cd backend
php artisan test
php artisan test --testsuite=Unit
php artisan test --testsuite=Feature
php artisan test --coverage-html=coverage
php artisan test --filter=ProfileApiTest
```

### Voraussetzungen fuer Backend-Tests
- Backend-Abhaengigkeiten installieren: `cd backend && composer install`
- Testdatenbank muss erreichbar sein, sonst schlagen Feature-Tests mit DB-Verbindungsfehlern fehl (`SQLSTATE[HY000] [2002]`).

### Coverage-Ausgabe
- HTML-Coverage unter `backend/coverage`.

## Abgedeckte Security-/Negativfaelle
- ungueltige Zugangsdaten
- Login mit nicht verifizierter E-Mail blockiert
- Duplicate-Fehler fuer E-Mail/Username
- nicht autorisierte Zugriffe (`401`/`403`)
- ungueltige/malizioese Registrierungsdaten werden abgewiesen
- fehlende Ressourcen (`404`) in geschuetzten APIs

## Weg zu >90%
- weitere Komponenten-Tests fuer verbleibende Angular-Featureseiten
- API-Tests fuer weitere Laravel-Controller (Mitglieder/Personen (guest-Slug kompatibel))
- Last-/Security-Szenarien: Rate Limiting, Race Conditions, Upload-Constraints

## Letzter Coverage-Push (Frontend)
- branch-lastige Tests erweitert fuer:
  - `src/app/features/profile/profile.component.ts`
  - `src/app/features/admin/pages/users/users-page.component.ts`
  - `src/app/features/admin/pages/roles/roles-page.component.ts`
  - `src/app/features/admin/pages/permissions/permissions-page.component.ts`
- aktueller Statement-Wert dieser Dateien:
  - profile: `71.94%`
  - users: `82.27%`
  - roles: `82.82%`
  - permissions: `95.04%`
- Hinweis: der globale Frontend-Wert bleibt durch separat ausgewiesene, noch nicht abgedeckte `.html`-Templates niedriger.

## Letzte E2E-Erweiterung
- erweiterte Playwright-Szenarien in:
  - `frontend/e2e/language-and-sidebar.desktop.spec.ts`
  - `frontend/e2e/language-and-sidebar.mobile.spec.ts`
- neu abgesichert:
  - Desktop: Sidebar-Sichtbarkeit fuer Admin vs. eingeschraenkte Benutzer (rechtebasiertes Menu)
  - Desktop: Collapse-/Expand-Verhalten der Sidebar
  - Mobile: Overlay Open/Close und automatisches Schliessen nach Navigation
  - Mobile: Sprachwechsel (`en` -> `fa`) mit RTL-Pruefung im Workspace-Shell-Container

