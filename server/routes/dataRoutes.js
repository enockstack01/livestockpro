const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../db');
const { requireAuth } = require('../authMiddleware');
const { sendPushToUser } = require('../lib/pushNotify');

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
  tasks: ['title', 'description', 'due_date', 'status', 'priority', 'district', 'latitude', 'longitude'],
  /* Registered by the mobile app (src/notifications/registerPushToken.js) —
     never synced/cached, written and read directly, one row per device. */
  push_tokens: ['expo_push_token', 'platform', 'device_id']
};

/* Fields whose transition to one of these values is worth an immediate push
   to every device the owning user has registered (server/lib/pushNotify.js) —
   e.g. a family member using the web app marks an animal Critical while the
   farmer is out of signal range; they should find out the moment they're
   back online, not next time they happen to open the app. */
const PUSH_TRIGGERS = {
  animals: { field: 'health_status', values: ['Critical', 'Deceased'] },
  health_records: { field: 'status', values: ['Critical'] }
};

function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/* Fire-and-forget: never let a push failure affect the write it's reporting on. */
function notifyCriticalChange(table, doc, userId) {
  const label = table === 'animals' ? (doc.tag_id || doc.name || 'An animal') : (doc.tag_id || 'A health record');
  const statusValue = table === 'animals' ? doc.health_status : doc.status;
  sendPushToUser(userId, {
    title: `${statusValue}: ${label}`,
    body: table === 'animals' ? `${label} is now marked ${statusValue}.` : `${label}'s health record was marked ${statusValue}.`,
    data: { table, id: doc._id || doc.id }
  }).catch((err) => console.error('Push notify failed:', err.message));
}

router.use(requireAuth);

router.param('table', (req, res, next, table) => {
  if (!Object.prototype.hasOwnProperty.call(SCHEMAS, table)) {
    return res.status(404).json({ error: { message: 'Unknown table: ' + table } });
  }
  req.fields = SCHEMAS[table];
  next();
});

function reservedKey(key) {
  return key === 'select' || key === 'order' || key === 'limit' || key === 'updated_since' || key === 'include_deleted';
}

function toClient(doc) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

/* Builds a Mongo filter from query params, always scoped to the caller's own
   rows. 'id' is special-cased to the document's real _id since it isn't a
   whitelisted data field but is exactly how the frontend targets a single
   record. Soft-deleted rows (see the DELETE handler) are excluded by default
   — pass include_deleted=true to see them, which only the mobile app's sync
   pull ever does, so this is transparent to the (unmodified) web client.
   updated_since=<ISO> powers that same delta pull: only rows changed after
   that timestamp. */
function buildFilter(req) {
  const filter = { user_id: req.user.id };
  if (req.query.include_deleted !== 'true') filter.deleted_at = null;
  if (req.query.updated_since) {
    const since = new Date(req.query.updated_since);
    if (!isNaN(since)) filter.updated_at = { $gt: since.toISOString() };
  }
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
      if (req.fields.includes(orderCol) || orderCol === 'created_at' || orderCol === 'updated_at') {
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

/* POST /api/data/:table — insert one or many rows, user_id always forced
   server-side. Accepts a client-supplied UUID `id` (the offline-first mobile
   app generates its own so an offline-created record can be referenced by
   other offline-created records immediately, with no post-sync remap) — a
   non-UUID or missing id still gets a server-generated one, same as before.
   Each doc is upserted (not insertMany'd) on that id so a retried push after
   a dropped response is idempotent instead of erroring on a duplicate key;
   user_id scoping already makes cross-user id collision a non-issue. */
router.post('/:table', async (req, res) => {
  try {
    const col = getDb().collection(req.params.table);
    const records = Array.isArray(req.body) ? req.body : [req.body];
    if (records.length === 0) return res.json({ data: [], error: null });

    const now = new Date().toISOString();
    const docs = records.map((rec) => {
      const doc = { _id: isUuid(rec.id) ? rec.id : crypto.randomUUID(), user_id: req.user.id, created_at: now, updated_at: now };
      for (const key of req.fields) {
        if (Object.prototype.hasOwnProperty.call(rec, key)) doc[key] = rec[key];
      }
      return doc;
    });

    for (const doc of docs) {
      const { _id, ...rest } = doc;
      await col.updateOne({ _id }, { $setOnInsert: { _id, ...rest } }, { upsert: true });
    }
    res.json({ data: docs.map(toClient), error: null });

    const trigger = PUSH_TRIGGERS[req.params.table];
    if (trigger) {
      docs.forEach((doc) => {
        if (trigger.values.includes(doc[trigger.field])) {
          notifyCriticalChange(req.params.table, doc, req.user.id);
        }
      });
    }
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
    const trigger = PUSH_TRIGGERS[req.params.table];
    const wasCritical = trigger && trigger.values.includes(set[trigger.field])
      ? await col.find({ ...filter, [trigger.field]: { $ne: set[trigger.field] } }).toArray()
      : [];

    if (Object.keys(set).length > 0) {
      set.updated_at = new Date().toISOString();
      await col.updateMany(filter, { $set: set });
    }
    const docs = await col.find(filter).toArray();
    res.json({ data: docs.map(toClient), error: null });

    wasCritical.forEach((doc) => notifyCriticalChange(req.params.table, { ...doc, [trigger.field]: set[trigger.field] }, req.user.id));
  } catch (err) {
    res.status(400).json({ error: { message: err.message } });
  }
});

/* DELETE /api/data/:table?col=value — soft-deletes rows matching filters,
   scoped to caller. Kept as a tombstone (deleted_at set) rather than an
   actual removal so the mobile app's delta sync pull can tell a device "this
   record is gone" instead of the row just silently vanishing — buildFilter()
   already excludes deleted_at rows from every normal query by default, so
   this is transparent to the (unmodified) web app. */
router.delete('/:table', async (req, res) => {
  try {
    const col = getDb().collection(req.params.table);
    const filter = buildFilter(req);
    const now = new Date().toISOString();
    await col.updateMany(filter, { $set: { deleted_at: now, updated_at: now } });
    res.json({ data: null, error: null });
  } catch (err) {
    res.status(400).json({ error: { message: err.message } });
  }
});

module.exports = router;
