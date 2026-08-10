# Livestock Farm Management

A full-stack (MERN) livestock farm management system: track animals, health
records, feeding, breeding, production, finances, and tasks.

- **Frontend:** React + Vite (`client/`)
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

## Project layout

```
server/            Express API
  db.js              MongoDB connection
  authMiddleware.js  Clerk session verification
  routes/
    dataRoutes.js      generic CRUD for animals, health, feeding, breeding,
                       production, finance, tasks, profiles
    rpcRoutes.js       account deletion
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
                         Tasks, Reports, Settings
    style.css            shared stylesheet (design system, unchanged)
  dist/               production build output (git-ignored, created by `npm run build`)
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
