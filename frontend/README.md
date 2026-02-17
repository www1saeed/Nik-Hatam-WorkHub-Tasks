# Nik Hatam WorkHub Frontend

Angular frontend for the Nik Hatam WorkHub platform.

## Main frontend feature areas
- Dashboard with role-aware widgets and quick links
- Daily responsibilities (tasks) with assignment and done workflow
- Task comments in detail dialogs
- Task photo handling (upload, camera capture, preview, delete)
- Notification center and unread badge in header
- Offline-first behavior for task/comment/photo sync queues
- Language switching (`fa`, `en`, `de`) and RTL/LTR support
- Light/Dark theme switching

## Run locally
1. Install dependencies:
   - `npm install`
2. Start development server:
   - `npm run start`

## Build
- `npm run build`

## Test and quality
- Lint: `npm run lint`
- Unit tests: `npm run test:coverage`
- E2E desktop: `npm run e2e:desktop`
- E2E mobile: `npm run e2e:mobile`
