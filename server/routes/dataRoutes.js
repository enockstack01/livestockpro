const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../db');
const { requireAuth } = require('../authMiddleware');

const router = express.Router();

/* Whitelist of client-settable fields per collection reachable through the generic REST layer. */
const SCHEMAS = {
  profiles: ['farm_name', 'location', 'phone', 'avatar_url'],
  animals: ['tag_id', 'name', 'species', 'breed', 'sex', 'date_of_birth', 'location', 'district', 'latitude', 'longitude', 'health_status', 'last_check_date', 'notes'],
  health_records: ['animal_id', 'tag_id', 'disease', 'treatment', 'medicine', 'vet_name', 'check_date', 'next_check_date', 'status', 'district', 'latitude', 'longitude', 'notes'],
  feeding_records: ['feed_type', 'quantity', 'unit', 'cost', 'feeding_date', 'animal_group', 'district', 'latitude', 'longitude', 'notes'],
  breeding_records: ['animal_id', 'tag_id', 'breeding_date', 'pregnancy_status', 'expected_birth_date', 'birth_date', 'newborn_count', 'newborn_details', 'district', 'latitude', 'longitude', 'notes'],
  production_records: ['animal_id', 'tag_id', 'production_type', 'quantity', 'unit', 'production_date', 'district', 'latitude', 'longitude', 'notes'],
  finance_records: ['type', 'category', 'amount', 'date', 'description', 'district', 'latitude', 'longitude'],
  tasks: ['title', 'description', 'due_date', 'status', 'priority', 'district', 'latitude', 'longitude']
};

router.use(requireAuth);

router.param('table', (req, res, next, table) => {
  if (!Object.prototype.hasOwnProperty.call(SCHEMAS, table)) {
    return res.status(404).json({ error: { message: 'Unknown table: ' + table } });
  }
  req.fields = SCHEMAS[table];
  next();
});

function reservedKey(key) {
  return key === 'select' || key === 'order' || key === 'limit';
}

function toClient(doc) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

/* Builds a Mongo filter from query params, always scoped to the caller's own rows.
   'id' is special-cased to the document's real _id since it isn't a whitelisted
   data field but is exactly how the frontend targets a single record. */
function buildFilter(req) {
  const filter = { user_id: req.user.id };
  for (const [key, value] of Object.entries(req.query)) {
    if (reservedKey(key)) continue;
    if (key === 'id') {
      filter._id = value;
    } else if (req.fields.includes(key)) {
      filter[key] = value;
    }
  }
  return filter;
}

/* GET /api/data/:table — filtered select, scoped to the caller's rows */
router.get('/:table', async (req, res) => {
  try {
    const col = getDb().collection(req.params.table);
    const filter = buildFilter(req);

    let projection;
    if (req.query.select && req.query.select !== '*') {
      const requested = req.query.select.split(',').map((s) => s.trim()).filter((c) => req.fields.includes(c));
      if (requested.length) {
        projection = { user_id: 0 };
        req.fields.forEach((f) => { if (!requested.includes(f)) projection[f] = 0; });
      }
    }

    let cursor = col.find(filter, projection ? { projection } : undefined);

    if (req.query.order) {
      const [orderCol, dir] = String(req.query.order).split('.');
      if (req.fields.includes(orderCol) || orderCol === 'created_at') {
        cursor = cursor.sort({ [orderCol]: dir === 'desc' ? -1 : 1 });
      }
    }
    if (req.query.limit) {
      const n = parseInt(req.query.limit, 10);
      if (Number.isFinite(n) && n > 0) cursor = cursor.limit(n);
    }

    const docs = await cursor.toArray();
    res.json({ data: docs.map(toClient), error: null });
  } catch (err) {
    res.status(400).json({ error: { message: err.message } });
  }
});

/* POST /api/data/:table — insert one or many rows, user_id always forced server-side */
router.post('/:table', async (req, res) => {
  try {
    const col = getDb().collection(req.params.table);
    const records = Array.isArray(req.body) ? req.body : [req.body];
    if (records.length === 0) return res.json({ data: [], error: null });

    const docs = records.map((rec) => {
      const doc = { _id: crypto.randomUUID(), user_id: req.user.id, created_at: new Date().toISOString() };
      for (const key of req.fields) {
        if (Object.prototype.hasOwnProperty.call(rec, key)) doc[key] = rec[key];
      }
      return doc;
    });

    await col.insertMany(docs);
    res.json({ data: docs.map(toClient), error: null });
  } catch (err) {
    res.status(400).json({ error: { message: err.message } });
  }
});

/* PATCH /api/data/:table?col=value — update rows matching filters, scoped to caller */
router.patch('/:table', async (req, res) => {
  try {
    const col = getDb().collection(req.params.table);
    const body = req.body || {};

    const set = {};
    for (const key of req.fields) {
      if (Object.prototype.hasOwnProperty.call(body, key)) set[key] = body[key];
    }

    const filter = buildFilter(req);

    if (Object.keys(set).length > 0) {
      await col.updateMany(filter, { $set: set });
    }
    const docs = await col.find(filter).toArray();
    res.json({ data: docs.map(toClient), error: null });
  } catch (err) {
    res.status(400).json({ error: { message: err.message } });
  }
});

/* DELETE /api/data/:table?col=value — delete rows matching filters, scoped to caller */
router.delete('/:table', async (req, res) => {
  try {
    const col = getDb().collection(req.params.table);
    const filter = buildFilter(req);
    await col.deleteMany(filter);
    res.json({ data: null, error: null });
  } catch (err) {
    res.status(400).json({ error: { message: err.message } });
  }
});

module.exports = router;
