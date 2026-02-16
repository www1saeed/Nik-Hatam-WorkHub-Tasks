# Projektanforderungen & Architekturleitfaden (DE)

> Hinweis: Dieses Dokument beschreibt die ursprÃ¼nglichen Anforderungen und das gewÃ¼nschte Verhalten, nicht spÃ¤tere Bugfixes oder kleine UI-Anpassungen.

---

## 1) Produktvision
Ein modernes, RTLâ€‘first Workspace fuer allgemeine Verwaltung mit Persisch (fa) als Hauptsprache und Englisch (en) als Zweitsprache. Frontend: Angular (latest) mit PrimeNG + Sakai und Transloco. Backend: Laravel + Sanctum.

## 2) Hauptanforderungen

### 2.1 Sprachen & UI-Richtung
- Hauptsprache: Persisch (RTL).
- Zweitsprache: Englisch (LTR).
- Alle Texte werden Ã¼ber Transloco (Frontend) und Laravel Lang-Files (Backend) lokalisiert.
- HTML `dir` und `lang` werden dynamisch umgeschaltet.
- Datumsanzeige: Jalali fÃ¼r fa, Gregorian fÃ¼r en.
- Ziffern: persisch bei fa, lateinisch bei en.

### 2.2 Design & Theme
- UI-Theme orientiert an den Logo-Farben (logo_fa.png).
- Moderner Workspace im Sakai-Stil.
- Buttons, VerlÃ¤ufe, Rahmen und Inputs folgen dem Theme.

### 2.3 Authentifizierung & Account-Lifecycle
- Login: Benutzername/E-Mail + Passwort.
- Registrierung: E-Mail-Verifizierung (Aktivierungscode).
- Passwort-Reset: Anfrage + Reset (Login kann E-Mail oder Username sein).
- Login gesperrt, wenn E-Mail nicht verifiziert ist (falls vorhanden).
- Social Login: Telegram.
- Social Completion: fehlende Profilfelder mÃ¼ssen ergÃ¤nzt werden.
- Account-Merge: Telegram-Konto kann mit lokalem Konto verknÃ¼pft werden.

### 2.4 Profil & IdentitÃ¤t
- VollstÃ¤ndiges Profil anzeigen/bearbeiten (persÃ¶nliche Daten, Avatar, Telefonnummern, Adressen).
- Avatar Upload/Remove (Drag & Drop).
- PasswortÃ¤nderung in separatem Modal.
- Social-Provider-Icons im Profil.
- Validierung: Code Meli & SHABA.
- Live-VerfÃ¼gbarkeit von Username/E-Mail.

### 2.5 Jalali Datum
- Backend speichert Gregorian.
- Frontend konvertiert zu Jalali (fa).
- Eingabe ohne fÃ¼hrende Nullen mÃ¶glich (z. B. 1400/3/8).
- Jalali Monatsregeln:
  - Monate 1â€“6 = 31 Tage
  - Monate 7â€“11 = 30 Tage
  - Monat 12 = 29/30 Tage
- Speichern: Jalali â†’ Gregorian.
- Sprachwechsel aktualisiert Datumsanzeige.

### 2.6 Workspace & RBAC
- Rollen/Permissions:
  - Admin: alle Rechte
  - Neue User: Standardrolle Mitglied (Slug: guest)
- CRUD fÃ¼r Users, Roles, Permissions.
- Responsive Sidebar mit Gruppenstruktur und Icons.
- Sidebar unterstÃ¼tzt RTL/LTR, einklappbar am Desktop und Overlay auf Mobile.
- Mobile Header enthÃ¤lt einen Sidebar-Button neben dem Branding und wird beim Scrollen mit Glas-Effekt (Blur) fixiert.
- Tabellen mit Suche, Sortierung, Pagination.
- Create/Edit in Modal, Delete mit BestÃ¤tigung.
- Seiten + Sidebar respektieren Berechtigungen.

### 2.7 Notifications & E-Mail
- E-Mails lokalisiert (fa/en).
- Aktivierungscode + Passwort-Reset.
- Admin-erstellte User bekommen Credentials per E-Mail.
- Mailpit fÃ¼r lokale Entwicklung (8025).

---

## 3) Wichtige User Stories (mit Diagrammen)

### 3.1 Registrierung â†’ E-Mail-Verifizierung â†’ Login
```mermaid
sequenceDiagram
  participant U as User
  participant FE as Angular
  participant BE as Laravel API
  participant Mail as Mail Server

  U->>FE: Registrierung
  FE->>BE: POST /auth/register
  BE->>Mail: Code senden
  U->>FE: Code eingeben
  FE->>BE: POST /auth/verify-email
  BE-->>FE: Verifiziert
  U->>FE: Login
  FE->>BE: POST /auth/login
  BE-->>FE: Token + Profil
```

### 3.2 Telegram Login â†’ Profil vervollstÃ¤ndigen
```mermaid
sequenceDiagram
  participant U as User
  participant FE as Angular
  participant BE as Laravel API
  participant TG as Telegram

  U->>FE: Telegram Login
  FE->>TG: Widget Ã¶ffnen
  TG-->>FE: Auth Payload
  FE->>BE: POST /auth/telegram
  BE-->>FE: completion_token
  U->>FE: Profil ergÃ¤nzen
  FE->>BE: POST /auth/social/complete
  BE-->>FE: Account ready
```

### 3.3 Profilbearbeitung mit Jalali Datum
```mermaid
stateDiagram-v2
  [*] --> LoadProfile
  LoadProfile --> DisplayJalali: lang=fa
  DisplayJalali --> EditJalaliDate
  EditJalaliDate --> ConvertToGregorian
  ConvertToGregorian --> SaveProfile
  SaveProfile --> DisplayJalali
```

---

## 4) Architektur
- Frontend Feature-Struktur: features/auth, features/profile, features/admin, features/dashboard, features/home.
- Core-Schicht: services, guards, utils, interceptors, config.
- Backend: AuthController, ProfileController, UserController + Services (TelegramAuthService, VerificationCodeService, PasswordResetLinkService, ProfilePresenter).

---

## 5) Erweiterung
- Neue Features unter features/{name}.
- API-Services unter core/services.
- Neue Backend-Controller unter Http/Controllers und Services unter app/Services.
- Berechtigungen in Seeder/Role-Setup pflegen und UI/Routes schÃ¼tzen.


