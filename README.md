# Livestock Farm Management

A full-stack (MERN) livestock farm management system: track animals, health
records, feeding, breeding, production, finances, and tasks.

- **Frontend:** React + Vite (`client/`)
- **Mobile:** React Native + Expo, Android + iOS (`mobile/`) — offline-first,
  shares this same backend/database, see [mobile/README.md](mobile/README.md)
- **Backend:** Node.js + Express REST API (`server/`)
- **Database:** MongoDB (Atlas)
- **Auth:** [Clerk](https://clerk.com) — sign-in/sign-up UI, sessions, and password/email management

## Requirements

- Node.js 18+
- A MongoDB connection string (Atlas or self-hosted)
- A Clerk application (Publishable key + Secret key) — create one free at
  [dashboard.clerk.com](https://dashboard.clerk.com)

## Setup

1. Copy your credentials into a `.env` file in the project root (git-ignored):

   ```
   PORT=3001

   MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?appName=Cluster0
   MONGODB_DB=livestock

   CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   ```

   > If your network/DNS can't resolve `mongodb+srv://` SRV records (some
   > sandboxed or corporate networks block this), use the non-SRV standard
   > connection string instead — Atlas' "Connect" dialog has a "Standard
   > connection string" option that lists the individual shard hosts.

2. The frontend also needs the Publishable key. It's hardcoded in
   `client/src/main.jsx` (publishable keys are safe to expose in client-side
   code). Update it there if you change Clerk apps.

3. Install, build, and run:

   ```bash
   npm install
   npm run build   # installs client deps and builds client/dist
   npm start
   ```

   For frontend development with hot reload instead, run the Express API
   (`npm run dev` in one terminal) and the Vite dev server (`npm run dev`
   inside `client/`, on port 5173, which proxies `/api` to `:3001`) side by
   side.

Then open **http://localhost:3001** (or **http://localhost:5173** in dev mode).

## Deploying (e.g. Render)

This is a single web service — Render (or similar) builds and runs it directly
from the repo root, no separate static site needed:

- **Build Command:** `npm run build`
  (this now runs `npm install` for the root/server deps *and* the client's
  install+build in one step, so it's safe as the entire Build Command)
- **Start Command:** `npm start`
- **Environment variables** (Render → your service → Environment): `MONGODB_URI`,
  `MONGODB_DB`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and optionally
  `SUPER_ADMIN_EMAILS`. `.env` is git-ignored and never deployed — these must
  be set directly in the platform's dashboard, or the server exits immediately
  on boot (`MONGODB_URI is not set`, from `server/db.js`).
- If MongoDB Atlas is used, add the platform's outbound IPs (or `0.0.0.0/0`
  for simplicity) to Atlas' Network Access list — otherwise the connection
  attempt in `connect()` (`server/db.js`) hangs/times out on startup.

## Project layout

```
server/            Express API
  db.js              MongoDB connection
  authMiddleware.js  Clerk session verification
  routes/
    dataRoutes.js      generic CRUD for animals, health, feeding, breeding,
                       production, finance, tasks, profiles
    rpcRoutes.js       account deletion
    adminRoutes.js     platform-wide admin/super_admin endpoints
  index.js           app entry point: serves the API and client/dist (with
                     SPA fallback to index.html for client-side routing)

client/             React (Vite) frontend
  src/
    main.jsx           app entry, ClerkProvider + router + toast provider
    App.jsx             route table
    components/
      Layout.jsx          sidebar + topbar + notification bell (shared shell)
      Modal.jsx           generic modal wrapper
    lib/
      api.js              fetch wrapper (Clerk-token-authenticated REST client)
      toast.jsx           toast notification system
      badges.jsx           status/priority/pregnancy badges + small helpers
      topbarSearch.jsx    lets a page put a search box in the shared topbar
    pages/               one component per route: Login, Dashboard, Animals,
                         Health, Feeding, Breeding, Production, Finance,
                         Tasks, Reports, Settings, AdminDashboard
    style.css            shared stylesheet (design system, unchanged)
  dist/               production build output (git-ignored, created by `npm run build`)

mobile/             React Native (Expo) app — Android + iOS, see mobile/README.md
  app/                 Expo Router file-based routes (auth stack + tab layout)
  src/
    api/client.js        REST client mirroring client/src/lib/api.js's {data,error} contract
    db/                   local SQLite schema + repository (offline-first reads/writes)
    sync/                 push/pull sync engine against server/routes/dataRoutes.js
    notifications/        local reminders + server push token registration
    config/tables.js       per-record-type config driving the one shared CRUD screen

shared/             small cross-client package imported by both client/ and mobile/ —
                    status colors, date/age formatting, business rules, and a JS
                    mirror of dataRoutes.js's SCHEMAS field whitelist
```

## Auth model

- `@clerk/clerk-react`'s `ClerkProvider` wraps the whole app; the Clerk SDK is
  bundled into the app's own JS by Vite — no runtime script-tag/CDN dependency.
- `Login.jsx` renders Clerk's `<SignIn>`/`<SignUp>` components (`routing="virtual"`,
  toggled locally), with Clerk's own cross-link hidden since it defaults to
  navigating to Clerk's hosted account portal.
- `useApi()` (`client/src/lib/api.js`) attaches the current Clerk session token
  (`useAuth().getToken()`) as a `Bearer` header on every request; the backend
  verifies it via `@clerk/express`'s `clerkMiddleware()`.
- Profile photo upload/remove in Settings calls Clerk's own
  `user.setProfileImage()` directly — there's no separate file storage backend.
- "Manage Account Security" in Settings opens Clerk's `openUserProfile()`
  modal for password/email changes.

## Roles & admin access

Three roles: `user` (default — their own farm data only), `admin`, and
`super_admin`. The role lives in Clerk's `publicMetadata.role` on the user;
the backend re-derives it from Clerk on every admin request (never trusts
the client), via `server/authMiddleware.js`'s `getRole()`/`requireRole()`.

- **Bootstrapping the first super admin** — either:
  1. Run a one-off script calling `clerkClient.users.updateUserMetadata(userId, { publicMetadata: { role: 'super_admin' } })`, or
  2. Set the `SUPER_ADMIN_EMAILS` env var (comma-separated emails) — anyone
     signing in with one of those addresses is treated as `super_admin`
     even before any metadata is set. Useful for a fresh deploy (e.g. Render)
     that doesn't have console/script access yet.
- **`admin`** can: view platform-wide stats, the full user list, and the
  spatial map; ban/unban regular (`user`-role) accounts; promote a `user` to
  `admin` (nothing else — can't touch existing admins, can't grant
  `super_admin`).
- **`super_admin`** can additionally: ban/unban other admins, set *any* role
  on *any* user (promote to `admin`/`super_admin`, or demote), and
  permanently delete a user's account and data. A super_admin can't change
  their own role/status (avoids accidental lockout), and the last remaining
  super_admin can't be demoted.
- The "Admin Panel" sidebar link only renders for `admin`/`super_admin`
  (`Layout.jsx`'s `useRole()`, backed by `GET /api/admin/role`); `AdminDashboard.jsx`
  also redirects a plain user away from `/admin` client-side. Real enforcement
  is entirely server-side in `adminRoutes.js`.

## Spatial distribution

Every record form (Animals, Health, Feeding, Breeding, Production, Finance,
Tasks) auto-captures the device's GPS coordinates via the browser
Geolocation API when the "Add" modal opens (`client/src/lib/geolocation.jsx`'s
`useGeoCapture()` + `<LocationCaptureBadge>`), and attaches `latitude`/
`longitude` to the record on save. It never blocks saving — a denied/failed
capture just means that one record has no coordinates. Editing an existing
record leaves its stored coordinates untouched.

The Admin Panel's **Spatial Distribution** tab (visible to both `admin` and
`super_admin`) renders every georeferenced record platform-wide on a
[Leaflet](https://leafletjs.com) map (`client/src/components/SpatialMap.jsx`),
fed by `GET /api/admin/spatial`:

- One color/icon-coded marker layer per record type, each independently
  toggleable via the legend (which also explains the symbology and shows
  live counts).
- Nearby points cluster together (`leaflet.markercluster`) and expand on
  click/zoom — necessary since many demo records share a district-level
  coordinate rather than a unique GPS point.
- Three basemaps (Street/OpenStreetMap, Satellite/Esri, Light/CARTO),
  switchable via Leaflet's layer control — all free tile sources, no API key.
- Marker popups show the record's type, title, status, date, district, and
  which farm/user it belongs to.
- Each layer can independently switch between **markers** (clustered pins)
  and **density** (a `leaflet.heat` heatmap tinted to that layer's color) via
  a small toggle next to its legend row.
- Rwanda's country outline and all 30 district boundaries render as a
  separate overlay (`client/public/geo/rwanda-{country,districts}.geojson`,
  real administrative boundaries from [geoBoundaries.org](https://www.geoboundaries.org),
  CC BY 4.0) — visible on top of every basemap, each independently
  toggleable, with district names on hover.

## API overview

All endpoints are namespaced under `/api` and require a `Bearer` Clerk session
token. Every read/write on `/api/data/:table` is automatically scoped to the
authenticated user (`user_id` filter forced server-side); `?id=` targets a
single document (mapped to Mongo's `_id`).

- `GET|POST|PATCH|DELETE /api/data/:table` — table is one of `profiles`,
  `animals`, `health_records`, `feeding_records`, `breeding_records`,
  `production_records`, `finance_records`, `tasks`
- `POST /api/rpc/delete_user` — deletes all of the user's MongoDB documents
  and their Clerk account
- `GET /api/admin/role` — any authenticated user; returns their own resolved role
- `GET /api/admin/stats`, `GET /api/admin/users`, `GET /api/admin/spatial` — `admin`+
- `PATCH /api/admin/users/:id/status` `{ banned }` — `admin`+ (admins may only
  target `user`-role accounts; `super_admin` may target anyone but themselves)
- `PATCH /api/admin/users/:id/role` `{ role }` — `admin`+, but an `admin` may
  only set `role: 'admin'` on a target whose current role is `user`; any
  other combination (granting `super_admin`, touching an existing admin,
  demoting) requires `super_admin`
- `DELETE /api/admin/users/:id` — `super_admin` only
