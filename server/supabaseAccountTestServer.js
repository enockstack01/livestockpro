require('dotenv').config();

const express = require('express');
const supabaseAccountRoutes = require('./routes/supabaseAccountRoutes');

const app = express();
const PORT = process.env.SUPABASE_ACCOUNT_TEST_PORT || 3003;

app.use(express.json({ limit: '5mb' }));

app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Supabase account test server is running.'
  });
});

app.use('/api/supabase/account', supabaseAccountRoutes);

app.listen(PORT, () => {
  console.log(`Supabase account test server running at http://localhost:${PORT}`);
  console.log(`Account endpoint: http://localhost:${PORT}/api/supabase/account`);
});
