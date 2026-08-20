# LivestockPro Mobile

React Native (Expo) companion app for Android + iOS. Talks to the **same**
Express API and MongoDB as the web app (`client/`, `server/`) — same Clerk
accounts, same records, no separate backend. See the root
[README.md](../README.md) for the server/web setup.

Offline-first: records are cached locally (SQLite) and synced in the
background, so the app works with no signal in the field.

## Requirements

- Node.js 18+
- [Expo Go](https://expo.dev/go) on your phone for quick iteration — **note:**
  once you have `expo-sqlite`/offline sync working (already wired up), you
  need an **EAS development build** instead of Expo Go, since SQLite isn't
  available there. See "Running" below.
- The `server/` API running and reachable from your phone (same LAN).

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in:
   - `EXPO_PUBLIC_API_URL` — your machine's LAN IP + port (e.g.
     `http://192.168.1.100:3001`), **not** `localhost` (your phone can't
     resolve that to your PC). Find your LAN IP with `ipconfig` (Windows) /
     `ifconfig` (macOS/Linux).
   - `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` — same Clerk app the web client uses
     (hardcoded in `client/src/main.jsx`).
3. `npx eas init` (one-time, requires a free Expo account) to get a real
   `extra.eas.projectId` in `app.json` — replace the
   `REPLACE_WITH_EAS_PROJECT_ID` placeholder. Required for push notifications
   to work (`src/notifications/registerPushToken.js` no-ops without it).

## Running

- `npm run android` / `npm run ios` / `npm start` — starts the Metro dev
  server. Works in **Expo Go** only until you need a native module Expo Go
  doesn't ship (this project already needs one: `expo-sqlite`). Practically,
  use an EAS development build instead:
  ```bash
  npx eas build --profile development --platform ios     # or android
  ```
  Install the resulting build on your device/simulator once, then
  `npm start` and open it from that custom dev client (not Expo Go) for every
  day after — it hot-reloads your JS just like Expo Go does.

## Project layout

```
app/                 Expo Router file-based routes
  _layout.js            root: ClerkProvider, SQLiteProvider, ToastProvider, SyncProvider
  (auth)/               signed-out stack: sign-in, sign-up
  (app)/                signed-in tab layout: dashboard + all record screens

src/
  api/client.js         REST client — mirrors client/src/lib/api.js's {data,error} contract
  db/                    local SQLite schema + repository (local-first reads/writes)
  sync/                  push/pull sync engine + the provider that triggers it
  notifications/         local date-based reminders + server push registration
  config/tables.js       per-record-type form/list config (drives the generic CRUD screen)
  screens/RecordListScreen.js   the one CRUD screen every record type reuses
  components/, hooks/, lib/     shared UI bits (Modal, Badges, toast, GPS capture, …)

../shared/            cross-client package (also imported by client/) — status
                       colors, date/age formatting, business rules, the field
                       whitelist mirror of server/routes/dataRoutes.js's SCHEMAS
```

## What's intentionally out of scope (v1)

- **Admin/OneHealth dashboards** — desk tools for admins, stay web-only.
- **CSV import** — mobile is form-only entry; export (via the share sheet)
  is supported.
- **Push notification delivery testing** — requires physical devices (not
  simulators/most emulators) and EAS push credentials configured via
  `eas credentials`.
