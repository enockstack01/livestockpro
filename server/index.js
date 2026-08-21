require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { clerkMiddleware } = require('@clerk/express');
const { connect } = require('./db');
const dataRoutes = require('./routes/dataRoutes');
const rpcRoutes = require('./routes/rpcRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
const PORT = process.env.PORT || 3001;

/* Render sits in front of this app as a single reverse-proxy hop; without
   this, express-rate-limit (and req.ip generally) ignores X-Forwarded-For
   and keys every request off the same upstream address, collapsing the
   per-client rate limit budget below into one shared budget for all users. */
app.set('trust proxy', 1);

/* Express's default 'qs' parser turns bracket notation (?id[$ne]=x) into a
   nested object, which would let a client smuggle a raw Mongo operator into
   buildFilter()'s query-param loop (server/routes/dataRoutes.js). The
   'simple' parser (Node's querystring) never produces nested objects, so
   every query value buildFilter() sees is guaranteed to be a plain string. */
app.set('query parser', 'simple');

/* Requests with no Origin header (native apps — the mobile client, curl,
   server-to-server) always pass; this only gates browser-based cross-origin
   calls. Auth is Bearer-token-based (no cookies), so an open policy here
   was never itself an auth bypass — this is defense-in-depth, not a fix for
   a real vulnerability. Extra origins (e.g. a staging web deploy) can be
   added via the comma-separated ALLOWED_ORIGINS env var without a code change. */
const DEFAULT_ORIGINS = [
  'https://livestockpro.agricoders.com',
  'https://livestockpro.onrender.com',
  'http://localhost:5173', // client/ Vite dev server
  'http://localhost:8081', // mobile/ Expo web dev server
];
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : DEFAULT_ORIGINS;

/* Clerk's browser SDK talks directly to its own Frontend API host (encoded,
   base64, inside the publishable key — e.g. pk_test_<base64>) for every
   sign-in/sign-up/session call, and loads Cloudflare Turnstile + its own
   bot-protection scripts from fixed Clerk domains. A CSP that doesn't allow
   those hosts doesn't break the UI cosmetically like a missing font would —
   it silently fails every one of those network calls, which looks exactly
   like "authentication is disabled" from the user's side. Resolved from
   CLERK_PUBLISHABLE_KEY so this stays correct if the app ever switches Clerk
   instances (dev -> prod) without a code change. See
   https://clerk.com/docs/security/clerk-csp for the required host list. */
function clerkFrontendApiHost() {
  const key = process.env.CLERK_PUBLISHABLE_KEY || '';
  const match = key.match(/^pk_(?:test|live)_([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  try {
    return Buffer.from(match[1], 'base64').toString('utf8').replace(/\$+$/, '');
  } catch {
    return null;
  }
}
const CLERK_FAPI_HOST = clerkFrontendApiHost();
const CLERK_FAPI_ORIGIN = CLERK_FAPI_HOST ? [`https://${CLERK_FAPI_HOST}`] : [];

/* Explicit CSP allowlist instead of helmet's restrictive self-only default —
   client/index.html pulls Google Fonts + the cdnjs Font Awesome stylesheet,
   and the React app renders plenty of inline `style={{...}}` attributes
   (CSP's style-src governs those too, not just <style>/<link> tags), so both
   need naming here or the whole UI loses its icons/fonts/styling. Verified
   against the actual built client/dist/index.html: no inline <script> tags
   of our own, so script-src only needs Clerk's hosts added, not 'unsafe-inline'. */
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", ...CLERK_FAPI_ORIGIN, 'https://challenges.cloudflare.com', 'https://*.protect.clerk.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com'],
      imgSrc: [
        "'self'", 'data:',
        'https://img.clerk.com',
        'https://*.tile.openstreetmap.org',
        'https://server.arcgisonline.com',
        'https://*.basemaps.cartocdn.com',
      ],
      connectSrc: ["'self'", ...CLERK_FAPI_ORIGIN, 'https://*.protect.clerk.com'],
      workerSrc: ["'self'", 'blob:'],
      frameSrc: ['https://challenges.cloudflare.com', 'https://*.protect.clerk.com']
    }
  }
}));
app.use(cors({
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  }
}));
app.use(express.json({ limit: '5mb' }));

/* General abuse/brute-force guard on the API surface — generous enough for
   normal use (a sync pull touches 8 tables per call) but bounds how hard a
   single client can hammer the server. */
app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false }));

app.use(clerkMiddleware());

app.use('/api/data', dataRoutes);
app.use('/api/rpc', rpcRoutes);
app.use('/api/admin', adminRoutes);

const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));

app.use('/api', (req, res) => {
  res.status(404).json({ error: { message: 'Not found' } });
});

/* SPA fallback: any non-API, non-static-file GET resolves to the React app's
   own client-side router (React Router's BrowserRouter). */
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

/* Clerk's middleware throws (rather than just leaving the request signed-out)
   when it's handed a malformed Authorization header — e.g. a stale/corrupted
   token. Without this, that would fall through to Express's default HTML
   error page, which also leaks server file paths. */
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error('Unhandled request error:', err.message);
  res.status(401).json({ error: { message: 'Not authenticated.' } });
});

connect()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`LivestockPro server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });
