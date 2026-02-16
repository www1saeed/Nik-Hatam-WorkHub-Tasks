# Extension Guide (EN)

This guide explains how to extend the project safely on both frontend and backend.

---

## 1) Frontend Extension

### 1.1 Add a new feature
1. Create a new folder under `frontend/src/app/features/{feature-name}`.
2. Place components, styles, and templates inside that feature folder.
3. Register a route in `frontend/src/app/app.routes.ts`.
4. Add Transloco keys in `frontend/public/i18n/fa.json` and `frontend/public/i18n/en.json`.

### 1.2 Add a new API service
1. Create a service in `frontend/src/app/core/services`.
2. Use `API_BASE_URL` from `frontend/src/app/core/config/api.config.ts`.
3. Export typed interfaces for payloads and responses.
4. Keep errors mapped through `core/utils/error-mapper`.

### 1.3 Add validation
1. Add shared validators to `frontend/src/app/core/utils/validators.ts`.
2. Apply validators in forms and show errors on keyup.

---

## 2) Backend Extension

### 2.1 Add a new controller
1. Create controller in `backend/app/Http/Controllers`.
2. Register routes in `backend/routes/api.php`.
3. Protect routes with permissions (see `ensurePermission` usage).

### 2.2 Add a new service
1. Create class under `backend/app/Services`.
2. Inject into controller via constructor.
3. Keep logic reusable and testable.

### 2.3 Add a new permission
1. Add in seeder.
2. Assign to roles.
3. Check in UI guards and hide menu items.

---

## 3) i18n & Localization
1. Backend messages in `backend/resources/lang/fa` and `backend/resources/lang/en`.
2. Frontend messages in `frontend/public/i18n/fa.json` and `frontend/public/i18n/en.json`.
3. Keep error keys stable for `error-mapper`.
