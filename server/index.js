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

/* Explicit CSP allowlist instead of helmet's restrictive self-only default —
   client/index.html pulls Google Fonts + the cdnjs Font Awesome stylesheet,
   and the React app renders plenty of inline `style={{...}}` attributes
   (CSP's style-src governs those too, not just <style>/<link> tags), so both
   need naming here or the whole UI loses its icons/fonts/styling. Verified
   against the actual built client/dist/index.html: no inline <script> tags,
   so script-src can stay 'self'-only. */
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"]
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
