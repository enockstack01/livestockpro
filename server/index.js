require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { clerkMiddleware } = require('@clerk/express');
const { connect } = require('./db');
const dataRoutes = require('./routes/dataRoutes');
const rpcRoutes = require('./routes/rpcRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '5mb' }));
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
