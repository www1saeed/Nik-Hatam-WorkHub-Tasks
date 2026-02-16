# Angular zu Android (Capacitor) Leitfaden

## Ziel
Das bestehende Angular-Frontend als Android-App-Shell mit Ionic Capacitor ausliefern, ohne Laravel-API, RTL/LTR und Auth-Flows zu brechen.

## 1) Capacitor Setup (Angular Projekt)
Im Ordner `frontend` ausfuehren:

```bash
npm i @capacitor/core @capacitor/cli @capacitor/android
npx cap init "Nik Hatam" "com.nikhatam.app" --web-dir=dist/frontend/browser
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

Hinweise:
- Bei Angular 17+ liegt der Build in der Regel unter `dist/frontend/browser`.
- Nach jeder Web-Aenderung:
```bash
npm run build
npx cap sync android
```

Optional fuer schnellere lokale Iteration:
```bash
npx cap run android -l --external
```

## 2) RTL/LTR in Android WebView
Der vorhandene Ansatz mit `lang`/`dir` auf `<html>` funktioniert auch in der nativen WebView.

Checkliste:
- Root html weiterhin dynamisch setzen:
  - `document.documentElement.lang = locale`
  - `document.documentElement.dir = locale === 'fa' ? 'rtl' : 'ltr'`
- Sprache persistent halten (lokaler Speicher).
- Native RTL-Unterstuetzung sicherstellen (`android:supportsRtl="true"` in Manifest, meist bereits aktiv).
- In CSS moeglichst logische Properties nutzen (`margin-inline-start`, `padding-inline-end`).

## 3) Auth-Speicher (Sanctum Token-basiert) mit Capacitor
Fuer Mobile Token nicht nur browser-typisch behandeln. In Capacitor Preferences speichern.

Installation:
```bash
npm i @capacitor/preferences
npx cap sync android
```

Service-Muster:
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

Sicherheit:
- `Preferences` ist pragmatisch, aber nicht maximal sicher.
- Fuer spaeter: Secure-Storage (Keystore-backed) fuer sensiblere Tokenhaltung.

Interceptor:
- Bei asynchronem Token-Load Auth-State frueh initialisieren.
- `Authorization: Bearer <token>` bleibt unveraendert.

## 4) API Zugriff und Laravel Backend Konfiguration
Dev-URLs:
- Android Emulator zur Host-Maschine: `http://10.0.2.2:8000`
- Echtes Geraet ins LAN: `http://<deine-lan-ip>:8000`
- Produktion: echte HTTPS API Domain.

Angular Konfiguration:
- getrennte Environments fuer Web und Android oder Runtime-Config.

Laravel CORS (`backend/config/cors.php`):
- Origin `http://localhost` (Capacitor WebView Origin) erlauben
- API-Pfade aktiv (`api/*`, optional `sanctum/csrf-cookie`)
- Header inkl. `Authorization` erlauben

Bei HTTP im Dev-Modus:
- Android blockt ggf. Cleartext.
- Fuer Dev-only `usesCleartextTraffic` / Network Security Config setzen.

## 5) PrimeNG UI/UX fuer Mobile optimieren
PrimeNG ist desktop-lastig, daher mobile Nacharbeit:

- Abstaende/Typografie:
  - unter `max-width: 720px` paddings und Zeilenhoehen reduzieren
  - Touch-Targets mindestens `44px`
- Tabellen:
  - mobile gestapelte/cardartige Darstellung
  - wichtigste Spalten zuerst, Aktionen kompakt
- Dialoge:
  - auf Mobile nahezu fullscreen
  - sticky Header/Footer fuer lange Formulare
- Sidebar:
  - Overlay-Verhalten
  - keine Hover-Abhaengigkeiten, nur Tap
- Performance:
  - schwere Effekte in langen Listen reduzieren
  - teure Inhalte spaeter laden (Tabs/Expansion)

## 6) Empfohlene Reihenfolge
1. Capacitor + Android Projekt anlegen und Start pruefen.
2. Token-Speicherung auf Capacitor Preferences umstellen.
3. Android Dev API URL (`10.0.2.2`) + Laravel CORS sauber setzen.
4. RTL/LTR Laufzeitwechsel in der App pruefen.
5. Mobile CSS fuer PrimeNG-Views optimieren.
6. Geraete-Tests fuer Kernfluesse (Login, Workspace, Sidebar, Profil).

