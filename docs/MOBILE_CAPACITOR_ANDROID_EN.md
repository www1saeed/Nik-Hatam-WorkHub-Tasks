# Angular to Android (Capacitor) Guide

## Goal
Convert the existing Angular frontend into an Android app shell with Ionic Capacitor, while keeping Laravel API integration, RTL/LTR behavior, and authentication stable.

## 1) Capacitor setup (Angular project)
Run inside `frontend`:

```bash
npm i @capacitor/core @capacitor/cli @capacitor/android
npx cap init "Nik Hatam" "com.nikhatam.app" --web-dir=dist/frontend/browser
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

Notes:
- For Angular 17+ app builder, `web-dir` is usually `dist/frontend/browser`.
- After each web change:
```bash
npm run build
npx cap sync android
```

Optional for faster local iteration:
```bash
npx cap run android -l --external
```

## 2) RTL/LTR in Android WebView
Your current approach (`<html lang=".." dir="..">` + language service updates) works in Capacitor WebView too.

Checklist:
- Keep setting direction on root html:
  - `document.documentElement.lang = locale`
  - `document.documentElement.dir = locale === 'fa' ? 'rtl' : 'ltr'`
- Persist locale (`localStorage` already used).
- Ensure Android app supports RTL at native level (`android:supportsRtl="true"` in AndroidManifest, usually true by default).
- Prefer logical CSS properties where possible (`margin-inline-start`, `padding-inline-end`) to reduce RTL bugs.

## 3) Auth storage (Sanctum token-based) with Capacitor
For mobile, do not rely on browser-only storage assumptions. Persist token using Capacitor Preferences.

Install:
```bash
npm i @capacitor/preferences
npx cap sync android
```

Service pattern:
```ts
import { Preferences } from '@capacitor/preferences';

const TOKEN_KEY = 'nh_admin_token';

export async function setToken(token: string): Promise<void> {
  await Preferences.set({ key: TOKEN_KEY, value: token });
}

export async function getToken(): Promise<string | null> {
  const { value } = await Preferences.get({ key: TOKEN_KEY });
  return value ?? null;
}

export async function clearToken(): Promise<void> {
  await Preferences.remove({ key: TOKEN_KEY });
}
```

Security note:
- `Preferences` is practical but not the strongest option.
- For higher security, move token to secure storage plugin (Keystore-backed) later.

Interceptor impact:
- If token loading is async, bootstrap auth state before first guarded API call.
- Keep `Authorization: Bearer <token>` flow unchanged.

## 4) API access and Laravel backend config
Development URLs:
- Android Emulator to host machine: `http://10.0.2.2:8000`
- Device to LAN backend: `http://<your-lan-ip>:8000`
- Production: real HTTPS API domain.

Angular environment strategy:
- `environment.ts` for web local
- `environment.android.ts` or runtime config for Android builds

Laravel CORS (`backend/config/cors.php`) for Capacitor:
- allow origin `http://localhost` (Capacitor WebView origin)
- keep API paths enabled (`api/*`, `sanctum/csrf-cookie` if needed)
- allow headers including `Authorization`

If using plain HTTP in development:
- Android may block cleartext traffic.
- Enable cleartext in Android app config for dev only (Network Security Config / `usesCleartextTraffic`).

## 5) PrimeNG UI/UX optimization for mobile app
PrimeNG defaults are desktop-first. Recommended mobile pass:

- Typography and spacing:
  - reduce paddings and row heights under `max-width: 720px`
  - increase touch target min-height to at least `44px`
- Data tables:
  - switch to stacked/card-like rows on mobile
  - keep critical columns first; move actions to compact icon row
- Dialogs:
  - use near-fullscreen modal on mobile
  - sticky header/footer actions for long forms
- Sidebar/navigation:
  - overlay behavior on mobile
  - disable hover-dependent interactions, use explicit tap targets
- Performance:
  - avoid heavy shadows/filters in large lists
  - defer expensive content behind tabs/expansion

## 6) Recommended rollout order
1. Add Capacitor + Android project and verify app boots.
2. Move auth token persistence to Capacitor Preferences.
3. Configure Android dev API URL (`10.0.2.2`) and Laravel CORS.
4. Validate RTL/LTR switch in app runtime.
5. Apply mobile-first CSS tuning for PrimeNG-heavy views.
6. Add device E2E smoke run (login, workspace, sidebar, profile).

