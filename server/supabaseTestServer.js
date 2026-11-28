require('dotenv').config();

const express = require('express');

const {
  requireAuth
} = require('./supabaseAuthMiddleware');

const app = express();
const PORT = process.env.SUPABASE_TEST_PORT || 3002;

app.use(express.json());

app.get('/api/supabase-test', requireAuth, (req, res) => {
  res.json({
    success: true,
    message: 'Supabase authentication is working.',
    user: {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role
    }
  });
});

app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Supabase test server is running.'
  });
});

app.listen(PORT, () => {
  console.log(`Supabase test server running at http://localhost:${PORT}`);
  console.log(`Authentication endpoint: http://localhost:${PORT}/api/supabase-test`);
});
