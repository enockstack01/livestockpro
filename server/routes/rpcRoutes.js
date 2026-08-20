const express = require('express');
const { getDb } = require('../db');
const { requireAuth, clerkClient } = require('../authMiddleware');

const router = express.Router();
router.use(requireAuth);

const COLLECTIONS = [
  'profiles',
  'animals',
  'health_records',
  'feeding_records',
  'breeding_records',
  'production_records',
  'finance_records',
  'tasks',
  'push_tokens'
];

/* POST /api/rpc/:fn — a tiny stand-in for Supabase's Postgres RPC functions */
router.post('/:fn', async (req, res) => {
  const fn = req.params.fn;

  if (fn === 'delete_user') {
    try {
      const db = getDb();
      await Promise.all(COLLECTIONS.map((name) => db.collection(name).deleteMany({ user_id: req.user.id })));
      await clerkClient.users.deleteUser(req.user.id);
      return res.json({ data: {}, error: null });
    } catch (err) {
      return res.status(400).json({ error: { message: err.message } });
    }
  }

  res.status(404).json({ error: { message: 'Unknown function: ' + fn } });
});

module.exports = router;
