const express = require('express');
const { requireAuth, requireRole } = require('../authMiddleware');
const { getDb } = require('../db');
const { audit } = require('../lib/orgs');
const { isConfigured, getClient, ask } = require('../lib/ai');
const {
  LIMIT_KEYS, LIMIT_MAX, envLimits, describeModel, usable, publicModel,
  getAiSettings, updateAiSettings, events
} = require('../lib/aiSettings');
const { dayKey } = require('../lib/aiQuota');
const { livestockIdsFor } = require('../lib/livestockId');

/* System admin AI controls (admin dashboard, AI tab): which model the
   platform uses and the rate limits, plus a monitor of AI use and of the
   requests the limits refused. Admins can read; only super admins change
   settings. Mounted at /api/admin. Models are named by tier and version only
   (server/lib/aiSettings.js). */
const router = express.Router();
router.use(requireAuth, requireRole('admin'));
const superOnly = requireRole('super_admin');

/* The models this account may use, newest first, cached for an hour. */
let modelCache = null;
let modelCacheUntil = 0;
async function availableModels() {
  if (modelCache && modelCacheUntil > Date.now()) return modelCache;
  const client = getClient();
  if (!client) return [];
  const ids = [];
  for await (const m of client.models.list({ limit: 100 })) ids.push(m.id);
  const seen = new Set();
  modelCache = ids
    .map(describeModel)
    .filter(usable)
    .sort((a, b) => (b.major - a.major) || (b.minor - a.minor) || (a.rank - b.rank))
    .filter((d) => (seen.has(d.key) ? false : seen.add(d.key)));
  modelCacheUntil = Date.now() + 60 * 60 * 1000;
  return modelCache;
}

const startOfUtcDay = (offsetDays = 0) => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - offsetDays));
};

async function usageSummary() {
  const today = startOfUtcDay();
  const since14 = startOfUtcDay(13);
  const ev = events();
  const sum = (field) => ({ $sum: field });
  const okCond = { $cond: [{ $eq: ['$ok', true] }, 1, 0] };
  const refusedCond = { $cond: [{ $eq: ['$refused', true] }, 1, 0] };
  const failedCond = { $cond: [{ $and: [{ $ne: ['$ok', true] }, { $ne: ['$refused', true] }] }, 1, 0] };
  const counters = {
    requests: sum({ $cond: [{ $ne: ['$refused', true] }, 1, 0] }),
    ok: sum(okCond),
    failed: sum(failedCond),
    refused: sum(refusedCond),
    input_tokens: sum('$input_tokens'),
    output_tokens: sum('$output_tokens'),
    ms: sum('$ms')
  };

  const [todayTotals, byKind, byDay, byModel, refusals, topUsers, quotaHits] = await Promise.all([
    ev.aggregate([{ $match: { at: { $gte: today } } }, { $group: { _id: null, ...counters } }]).toArray(),
    ev.aggregate([{ $match: { at: { $gte: today } } }, { $group: { _id: '$kind', ...counters } }]).toArray(),
    ev.aggregate([
      { $match: { at: { $gte: since14 } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$at' } }, ...counters } },
      { $sort: { _id: 1 } }
    ]).toArray(),
    ev.aggregate([
      { $match: { at: { $gte: since14 }, model: { $ne: null } } },
      { $group: { _id: '$model', ...counters } }
    ]).toArray(),
    ev.aggregate([
      { $match: { at: { $gte: today }, refused: true } },
      { $group: { _id: '$code', n: { $sum: 1 }, users: { $addToSet: '$user_id' } } }
    ]).toArray(),
    ev.aggregate([
      { $match: { at: { $gte: today } } },
      { $group: { _id: '$user_id', ...counters } },
      { $sort: { requests: -1, refused: -1 } },
      { $limit: 10 }
    ]).toArray(),
    getDb().collection('ai_usage').countDocuments({ day: dayKey() })
  ]);

  const ids = topUsers.map((u) => u._id).filter(Boolean);
  const accounts = ids.length
    ? await getDb().collection('accounts').find({ _id: { $in: ids } }, { projection: { full_name: 1, email: 1 } }).toArray()
    : [];
  const who = Object.fromEntries(accounts.map((a) => [a._id, a]));
  const livestockIds = await livestockIdsFor(ids);
  const shape = (x) => ({
    requests: x.requests || 0, ok: x.ok || 0, failed: x.failed || 0, refused: x.refused || 0,
    input_tokens: x.input_tokens || 0, output_tokens: x.output_tokens || 0,
    avg_seconds: x.requests ? Math.round((x.ms / x.requests) / 100) / 10 : 0
  });

  /* Every day of the last two weeks, including quiet ones. */
  const dayMap = Object.fromEntries(byDay.map((d) => [d._id, d]));
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const key = new Date(startOfUtcDay(i).getTime()).toISOString().slice(0, 10);
    days.push({ day: key, ...shape(dayMap[key] || {}) });
  }

  return {
    today: { ...shape(todayTotals[0] || {}), active_users: quotaHits },
    by_kind: byKind.filter((k) => k._id).map((k) => ({ kind: k._id, ...shape(k) })),
    days,
    by_model: byModel.map((m) => {
      const d = publicModel(describeModel(m._id));
      return { model: d ? d.label : 'Other', ...shape(m) };
    }),
    refusals: refusals.map((r) => ({ code: r._id, count: r.n, users: r.users.length })),
    top_users: topUsers.filter((u) => u._id).map((u) => {
      const a = who[u._id] || {};
      return { user_id: u._id, name: a.full_name || null, email: a.email || null, public_id: livestockIds[u._id] || null, ...shape(u) };
    })
  };
}

/* GET /api/admin/ai */
router.get('/ai', async (req, res) => {
  try {
    const settings = await getAiSettings();
    let models = [];
    let modelsError = null;
    if (isConfigured()) {
      try { models = await availableModels(); } catch (err) { modelsError = 'The list of AI models could not be loaded.'; console.error('AI models list:', err.message); }
    }
    const current = describeModel(settings.model);
    res.json({
      data: {
        configured: isConfigured(),
        model: publicModel(current),
        models: models.map(publicModel),
        models_error: modelsError,
        limits: settings.limits,
        limit_max: LIMIT_MAX,
        defaults: envLimits(),
        updated_at: settings.updated_at,
        usage: await usageSummary()
      },
      error: null
    });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

/* Before switching, check the model accepts what LivestockPro sends it:
   a structured answer at the effort the features use. */
async function testModel(id) {
  await ask({
    model: id,
    system: 'Reply with the JSON requested.',
    messages: [{ role: 'user', content: 'Return {"ok": true}.' }],
    schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false },
    effort: 'high',
    maxTokens: 300
  });
}

/* PATCH /api/admin/ai  { model?: key, limits?: { per_minute, ... } } */
router.patch('/ai', superOnly, async (req, res) => {
  try {
    const body = req.body || {};
    const before = await getAiSettings();
    const change = {};
    if (body.model !== undefined) {
      const models = await availableModels();
      const chosen = models.find((m) => m.key === String(body.model));
      if (!chosen) return res.status(400).json({ error: { message: 'Choose one of the listed models.', code: 'AI_MODEL_UNKNOWN' } });
      if (chosen.id !== before.model) {
        try {
          await testModel(chosen.id);
        } catch {
          return res.status(400).json({ error: { message: `${chosen.label} could not run LivestockPro's AI features, so the model was not changed.`, code: 'AI_MODEL_TEST_FAILED' } });
        }
      }
      change.model = chosen.id;
    }
    if (body.limits && typeof body.limits === 'object') {
      change.limits = {};
      for (const k of LIMIT_KEYS) if (body.limits[k] !== undefined) change.limits[k] = body.limits[k];
    }
    const after = await updateAiSettings(change, req.user.id);
    const label = (id) => { const d = publicModel(describeModel(id)); return d ? d.label : null; };
    await audit(req, 'ai.settings.update', {
      targetType: 'settings',
      targetId: 'ai',
      details: { before: { model: label(before.model), limits: before.limits }, after: { model: label(after.model), limits: after.limits } }
    });
    res.json({ data: { model: publicModel(describeModel(after.model)), limits: after.limits, updated_at: after.updated_at }, error: null });
  } catch (err) {
    res.status(err.status || 500).json({ error: { message: err.message } });
  }
});

module.exports = router;
