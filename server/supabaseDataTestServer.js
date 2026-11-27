require('dotenv').config();

const express = require('express');
const supabaseDataRoutes = require('./routes/supabaseDataRoutes');

const app = express();
const PORT = process.env.SUPABASE_DATA_TEST_PORT || 3004;

app.use(express.json({ limit: '5mb' }));

app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Supabase data test server is running.'
  });
});

app.use('/api/supabase/data', supabaseDataRoutes);

app.listen(PORT, () => {
  console.log(`Supabase data test server running at http://localhost:${PORT}`);
  console.log(`Data endpoint: http://localhost:${PORT}/api/supabase/data/:table`);
});
