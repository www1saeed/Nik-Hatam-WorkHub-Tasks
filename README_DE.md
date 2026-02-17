# Nik Hatam WorkHub (DE)

Moderne Laravel- und Angular-Workspace-Plattform für mehrsprachige, testbare und erweiterbare Verwaltungsprozesse.

## Warum diese Lösung
- Saubere Trennung von Backend-API und Frontend-App
- Hohe Testbarkeit (Unit, Feature, E2E)
- Responsive Bedienung auf Desktop und Mobile
- Vollständige RTL/LTR-Unterstützung
- Rollen- und rechtebasierte Sicherheit (RBAC)
- Einfach erweiterbar für neue Module

## Kernfunktionen
- Laravel-API mit Sanctum-Authentifizierung
- Angular-Workspace mit PrimeNG
- CRUD für Benutzer, Rollen und Berechtigungen
- Profil-Workflows mit Validierung
- Lokalisierung für Persisch, Englisch und Deutsch
- Telegram Social Login

## Neue WorkHub-Features
- Tagesaufgaben-Modul (Aufgaben erfassen, bearbeiten, zuweisen, erledigen, loeschen)
- Kommentare in Aufgaben-Dialogen mit Sync-Status
- Fotoverwaltung bei Aufgaben (Upload vom Geraet, Kameraaufnahme, Vorschau, Loeschen)
- Benachrichtigungen fuer Aufgaben-Zuweisungen und neue Kommentare
- Offline-First Synchronisierung mit Retry/Discard fuer fehlgeschlagene Operationen
- Rechtebasierter Fotozugriff (Datei-Endpunkte nur fuer Task-Management-Rollen)
- Header-Steuerung fuer Sprache und Light/Dark Modus

## Schnellstart
- Backend:
  - `cd backend && composer install`
  - `.env` konfigurieren
  - `php artisan serve`
- Frontend:
  - `npm --prefix frontend install`
  - `npm --prefix frontend run start`

## Tests
- `npm --prefix frontend run lint`
- `npm --prefix frontend run test:coverage`
- `npm --prefix frontend run e2e:desktop`
- `npm --prefix frontend run e2e:mobile`
- `cd backend && php artisan test`

## Dokumentation
- Index: `docs/INDEX.md`
- Anforderungen: `docs/requirements/PROJECT_REQUIREMENTS_DE.md`
- Testleitfaden: `docs/testing/TESTING_GUIDE_DE.md`
- Erweiterungsleitfaden: `docs/EXTENSION_GUIDE_DE.md`
- Capacitor Android: `docs/MOBILE_CAPACITOR_ANDROID_DE.md`

## Lizenz
Veröffentlicht unter Creative Commons Attribution 4.0 International (`CC BY 4.0`).

- `LICENSE`
- https://creativecommons.org/licenses/by/4.0/
