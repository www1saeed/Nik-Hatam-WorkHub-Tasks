# Erweiterungsleitfaden (DE)

Dieser Leitfaden erklärt, wie das Projekt im Frontend und Backend erweitert wird.

---

## 1) Frontend erweitern

### 1.1 Neues Feature
1. Neuen Ordner unter `frontend/src/app/features/{feature-name}` anlegen.
2. Komponenten, Styles und Templates dort platzieren.
3. Route in `frontend/src/app/app.routes.ts` registrieren.
4. Übersetzungen in `frontend/public/i18n/fa.json` und `frontend/public/i18n/en.json` ergänzen.

### 1.2 Neue API-Services
1. Service unter `frontend/src/app/core/services` erstellen.
2. `API_BASE_URL` aus `frontend/src/app/core/config/api.config.ts` nutzen.
3. Typisierte Interfaces für Payload/Response definieren.
4. Fehler über `core/utils/error-mapper` abbilden.

### 1.3 Validierungen
1. Validatoren zentral in `frontend/src/app/core/utils/validators.ts` pflegen.
2. In Formularen verwenden und Fehler bei Eingabe anzeigen.

---

## 2) Backend erweitern

### 2.1 Neue Controller
1. Controller in `backend/app/Http/Controllers` erstellen.
2. Routen in `backend/routes/api.php` registrieren.
3. Berechtigungen prüfen und durchsetzen.

### 2.2 Neue Services
1. Service-Klassen unter `backend/app/Services` anlegen.
2. Per DI in Controller injizieren.
3. Logik wiederverwendbar und testbar halten.

### 2.3 Neue Berechtigungen
1. Berechtigung im Seeder anlegen.
2. Rollen zuweisen.
3. UI/Guards entsprechend schützen.

---

## 3) i18n & Localization
1. Backend-Texte in `backend/resources/lang/fa` und `backend/resources/lang/en`.
2. Frontend-Texte in `frontend/public/i18n/fa.json` und `frontend/public/i18n/en.json`.
3. Fehler-Keys stabil halten, damit `error-mapper` funktioniert.
