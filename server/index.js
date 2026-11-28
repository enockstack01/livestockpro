
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { clerkMiddleware } = require('@clerk/express');
const { connect } = require('./db');

const {
  requireAuth: requireSupabaseAuth
} = require('./supabaseAuthMiddleware');

const dataRoutes = require('./routes/dataRoutes');
const rpcRoutes = require('./routes/rpcRoutes');
const adminRoutes = require('./routes/adminRoutes');
const accountRoutes = require('./routes/accountRoutes');
const supabaseAccountRoutes = require('./routes/supabaseAccountRoutes');
const ratesRoutes = require('./routes/ratesRoutes');
const aiRoutes = require('./routes/aiRoutes');
const orgRoutes = require('./routes/orgRoutes');
const teamRoutes = require('./routes/teamRoutes');
const adminOrgRoutes = require('./routes/adminOrgRoutes');
const adminAiRoutes = require('./routes/adminAiRoutes');

const {
  join: joinRoutes,
  me: meOrgRoutes,
  notes: notificationRoutes
} = require('./routes/joinRoutes');

const { startStatsJob } = require('./lib/orgs');

const app = express();
const PORT = process.env.PORT || 3001;

/* -------------------------------------------------------
   GENERAL EXPRESS CONFIGURATION
------------------------------------------------------- */

app.set('trust proxy', 1);

/* Keep Mongo query parameters as plain strings. */
app.set('query parser', 'simple');

/* -------------------------------------------------------
   CORS CONFIGURATION
------------------------------------------------------- */

const DEFAULT_ORIGINS = [
  'https://livestock.agricoders.com',
  'https://livestockpro.agricoders.com',
  'https://livestockpro.onrender.com',
  'http://localhost:5173',
  'http://localhost:8081'
];

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : DEFAULT_ORIGINS;

/* -------------------------------------------------------
   CLERK CSP CONFIGURATION
------------------------------------------------------- */

function clerkFrontendApiHost() {
  const key = process.env.CLERK_PUBLISHABLE_KEY || '';

  const match = key.match(/^pk_(?:test|live)_([A-Za-z0-9+/=]+)$/);

  if (!match) return null;

  try {
    return Buffer.from(match[1], 'base64')
      .toString('utf8')
      .replace(/\$+$/, '');
  } catch {
    return null;
  }
}

const CLERK_FAPI_HOST = clerkFrontendApiHost();

const CLERK_FAPI_ORIGIN = CLERK_FAPI_HOST
  ? [`https://${CLERK_FAPI_HOST}`]
  : [];

/* -------------------------------------------------------
   SECURITY HEADERS
------------------------------------------------------- */

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],

      scriptSrc: [
        "'self'",
        ...CLERK_FAPI_ORIGIN,
        'https://challenges.cloudflare.com',
        'https://*.protect.clerk.com'
      ],

      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        'https://fonts.googleapis.com',
        'https://cdnjs.cloudflare.com'
      ],

      fontSrc: [
        "'self'",
        'https://fonts.gstatic.com',
        'https://cdnjs.cloudflare.com'
      ],

      imgSrc: [
        "'self'",
        'data:',
        'blob:',
        'https://img.clerk.com',
        'https://tile.openstreetmap.org',
        'https://*.tile.openstreetmap.org',
        'https://server.arcgisonline.com',
        'https://*.basemaps.cartocdn.com'
      ],

      connectSrc: [
        "'self'",
        ...CLERK_FAPI_ORIGIN,
        'https://*.protect.clerk.com',
        'data:',
        'blob:'
      ],

      workerSrc: [
        "'self'",
        'blob:'
      ],

      frameSrc: [
        'https://challenges.cloudflare.com',
        'https://*.protect.clerk.com'
      ]
    }
  }
}));

/* -------------------------------------------------------
   API CORS
------------------------------------------------------- */

const isOwnOrigin = (origin, req) => {
  try {
    return new URL(origin).host === req.get('host');
  } catch {
    return false;
  }
};

app.use('/api', cors((req, callback) => {
  const origin = req.get('origin');

  const allowed =
    !origin ||
    ALLOWED_ORIGINS.includes(origin) ||
    isOwnOrigin(origin, req);

  callback(null, {
    origin: allowed
  });
}));

/* -------------------------------------------------------
   REQUEST BODY PARSING
------------------------------------------------------- */

app.use('/api/ai', express.json({
  limit: '25mb'
}));

app.use(express.json({
  limit: '5mb'
}));

/* -------------------------------------------------------
   API RATE LIMITING
------------------------------------------------------- */

app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
}));

/* -------------------------------------------------------
   SUPABASE AUTHENTICATION TEST
-------------------------------------------------------

   Temporary endpoint for testing Supabase authentication.

   It runs BEFORE Clerk middleware intentionally.

   It:
   1. Reads the Supabase Bearer token.
   2. Validates the token with Supabase Auth.
   3. Retrieves the authenticated user's role.
   4. Returns basic authenticated user information.

   Existing application routes continue using Clerk.
------------------------------------------------------- */

app.get(
  '/api/supabase-test',
  requireSupabaseAuth,
  (req, res) => {
    res.json({
      success: true,

      message: 'Supabase authentication is working.',

      user: {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role
      }
    });
  }
);

/* -------------------------------------------------------
   EXISTING CLERK AUTHENTICATION
-------------------------------------------------------

   Keep Clerk enabled for existing routes while Supabase
   authentication is being tested and migrated.
------------------------------------------------------- */

app.use('/api/supabase/account', supabaseAccountRoutes);

app.use('/api', clerkMiddleware());

/* -------------------------------------------------------
   EXISTING API ROUTES
------------------------------------------------------- */

app.use('/api/data', dataRoutes);
app.use('/api/rpc', rpcRoutes);

app.use('/api/admin', adminOrgRoutes);
app.use('/api/admin', adminAiRoutes);
app.use('/api/admin', adminRoutes);

app.use('/api/account', accountRoutes);
app.use('/api/rates', ratesRoutes);
app.use('/api/ai', aiRoutes);

app.use('/api/organizations', orgRoutes);
app.use('/api/team', teamRoutes);

app.use('/api/join', joinRoutes);
app.use('/api/me/organization', meOrgRoutes);
app.use('/api/notifications', notificationRoutes);

/* -------------------------------------------------------
   ANDROID APP LINKS
------------------------------------------------------- */

app.get('/.well-known/assetlinks.json', (req, res) => {
  const prints = (process.env.ANDROID_CERT_SHA256 || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  res.json(
    prints.length
      ? [{
          relation: [
            'delegate_permission/common.handle_all_urls'
          ],
          target: {
            namespace: 'android_app',
            package_name: 'com.livestockpro.mobile',
            sha256_cert_fingerprints: prints
          }
        }]
      : []
  );
});

/* -------------------------------------------------------
   APPLE APP LINKS
------------------------------------------------------- */

app.get('/.well-known/apple-app-site-association', (req, res) => {
  const appId = process.env.IOS_APP_ID;

  res.json({
    applinks: {
      apps: [],
      details: appId
        ? [{
            appID: appId,
            paths: ['/join/*']
          }]
        : []
    }
  });
});

/* -------------------------------------------------------
   FRONTEND STATIC FILES
------------------------------------------------------- */

const clientDist = path.join(
  __dirname,
  '..',
  'client',
  'dist'
);

app.use(express.static(clientDist));

/* -------------------------------------------------------
   API 404 HANDLER
------------------------------------------------------- */

app.use('/api', (req, res) => {
  res.status(404).json({
    error: {
      message: 'Not found'
    }
  });
});

/* -------------------------------------------------------
   REACT SPA FALLBACK
------------------------------------------------------- */

app.get('*', (req, res) => {
  res.sendFile(
    path.join(clientDist, 'index.html')
  );
});

/* -------------------------------------------------------
   CENTRAL ERROR HANDLER
------------------------------------------------------- */

const BODY_ERRORS = {
  'entity.too.large': [
    'REQUEST_TOO_LARGE',
    'The request is too large. Send fewer or smaller photos.'
  ],

  'entity.parse.failed': [
    'BAD_JSON',
    'The request could not be read.'
  ]
};

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const body = BODY_ERRORS[err.type];

  if (body && err.status) {
    return res.status(err.status).json({
      error: {
        code: body[0],
        message: body[1]
      }
    });
  }

  console.error(
    'Unhandled request error:',
    err.message
  );

  res.status(401).json({
    error: {
      message: 'Not authenticated.'
    }
  });
});

/* -------------------------------------------------------
   DATABASE CONNECTION AND SERVER STARTUP
------------------------------------------------------- */

connect()
  .then(() => {
    startStatsJob();

    app.listen(PORT, () => {
      console.log(
        `LivestockPro server running at http://localhost:${PORT}`
      );

      console.log(
        `AI key: ${require('./lib/ai').keyFingerprint()}`
      );

      console.log(
        'Supabase authentication test: /api/supabase-test'
      );
    });
  })
  .catch((err) => {
    console.error(
      'Failed to connect to MongoDB:',
      err.message
    );

    process.exit(1);
  });

