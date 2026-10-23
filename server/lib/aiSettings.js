const { AsyncLocalStorage } = require('async_hooks');
const { getDb } = require('../db');

/* Platform AI settings a system admin manages from the admin dashboard: the
   model every AI feature uses and the rate limits. Stored in
   system_settings (_id 'ai'); environment variables give the defaults so a
   fresh server works before anyone opens the settings.

   Models are never shown to anyone by their provider name. Each one gets a
   neutral key and label ("advanced-5.5", "Advanced 5.5") from its family and
   version; the admin picks a key and only the server knows the real id. */

const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);

const DEFAULT_MODEL = process.env.AI_MODEL || process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';

function envLimits() {
  return {
    per_minute: num(process.env.AI_REQUESTS_PER_MINUTE, 5),
    per_hour: num(process.env.AI_REQUESTS_PER_HOUR, 25),
    total: num(process.env.AI_DAILY_LIMIT, 50),
    diagnose: num(process.env.AI_DAILY_DIAGNOSE, 10),
    advisor: num(process.env.AI_DAILY_ADVISOR, 5),
    chat: num(process.env.AI_DAILY_CHAT, 40),
    brief: num(process.env.AI_DAILY_BRIEF, 10),
    admin_multiplier: num(process.env.AI_ADMIN_MULTIPLIER, 3)
  };
}
const LIMIT_KEYS = Object.keys(envLimits());
const LIMIT_MAX = { per_minute: 60, per_hour: 1000, total: 5000, diagnose: 1000, advisor: 1000, chat: 5000, brief: 1000, admin_multiplier: 20 };

/* ---------- model names ---------- */

const TIERS = [
  { family: 'fable', slug: 'frontier', label: 'Frontier', rank: 0 },
  { family: 'opus', slug: 'advanced', label: 'Advanced', rank: 1 },
  { family: 'sonnet', slug: 'balanced', label: 'Balanced', rank: 2 },
  { family: 'haiku', slug: 'fast', label: 'Fast', rank: 3 }
];

/* claude-opus-5-5 → { key: 'advanced-5.5', label: 'Advanced 5.5', ... };
   dated ids (…-4-5-20251001) keep only the version. */
function describeModel(id) {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/.exec(String(id || ''));
  if (!m) return null;
  const tier = TIERS.find((t) => t.family === m[1]);
  if (!tier) return null;
  const major = Number(m[2]);
  const minor = m[3] !== undefined ? Number(m[3]) : 0;
  const version = m[3] !== undefined ? `${major}.${minor}` : `${major}`;
  return { id, key: `${tier.slug}-${version}`, label: `${tier.label} ${version}`, tier: tier.slug, rank: tier.rank, major, minor };
}

/* Only models new enough for every feature (structured answers, tools,
   effort control) can be chosen. */
const usable = (d) => d && (d.major > 4 || (d.major === 4 && d.minor >= 5));

const publicModel = (d) => (d ? { key: d.key, label: d.label, tier: d.tier } : null);

/* ---------- settings ---------- */

let cache = null;
let cacheUntil = 0;

async function getAiSettings() {
  if (cache && cacheUntil > Date.now()) return cache;
  let doc = null;
  try { doc = await getDb().collection('system_settings').findOne({ _id: 'ai' }); } catch { /* defaults */ }
  const limits = envLimits();
  for (const k of LIMIT_KEYS) if (doc && doc.limits && Number.isFinite(doc.limits[k])) limits[k] = doc.limits[k];
  cache = {
    model: (doc && doc.model) || DEFAULT_MODEL,
    limits,
    updated_at: doc ? doc.updated_at : null,
    updated_by: doc ? doc.updated_by : null
  };
  cacheUntil = Date.now() + 30 * 1000;
  return cache;
}

/* The model id for the next request (cached, so the hot path stays cheap). */
async function currentModel() {
  return (await getAiSettings()).model;
}

function cleanLimits(input) {
  const out = {};
  for (const k of LIMIT_KEYS) {
    if (input[k] === undefined) continue;
    const v = Number(input[k]);
    if (!Number.isInteger(v) || v < (k === 'admin_multiplier' ? 1 : 0) || v > LIMIT_MAX[k]) {
      const err = new Error(`${k} must be a whole number from ${k === 'admin_multiplier' ? 1 : 0} to ${LIMIT_MAX[k]}.`);
      err.status = 400;
      throw err;
    }
    out[k] = v;
  }
  return out;
}

async function updateAiSettings({ model, limits }, userId) {
  const set = { updated_at: new Date().toISOString(), updated_by: userId };
  if (model) set.model = model;
  if (limits) {
    const clean = cleanLimits(limits);
    for (const [k, v] of Object.entries(clean)) set[`limits.${k}`] = v;
  }
  await getDb().collection('system_settings').updateOne({ _id: 'ai' }, { $set: set }, { upsert: true });
  cache = null;
  return getAiSettings();
}

/* ---------- usage events ----------
   One row per AI call or refused request, for the admin monitor. The route
   middleware records who and which feature in an async context, so the
   model call itself can log tokens without every route passing them on. */

const aiContext = new AsyncLocalStorage();

function events() {
  return getDb().collection('ai_events');
}

async function logEvent(entry) {
  try {
    await events().insertOne({ at: new Date(), ...entry });
  } catch { /* monitoring must never break a request */ }
}

/* Called by ask() after every model call. */
function logModelCall({ model, ok, code, usage, ms }) {
  const ctx = aiContext.getStore() || {};
  return logEvent({
    user_id: ctx.userId || null,
    kind: ctx.kind || null,
    model,
    ok,
    code: code || null,
    input_tokens: (usage && usage.input_tokens) || 0,
    output_tokens: (usage && usage.output_tokens) || 0,
    ms
  });
}

/* A request refused by a rate limit or the daily allowance. */
function logRefusal(userId, kind, code) {
  return logEvent({ user_id: userId, kind, model: null, ok: false, code, refused: true, input_tokens: 0, output_tokens: 0, ms: 0 });
}

module.exports = {
  DEFAULT_MODEL,
  LIMIT_KEYS,
  LIMIT_MAX,
  envLimits,
  describeModel,
  usable,
  publicModel,
  getAiSettings,
  currentModel,
  updateAiSettings,
  aiContext,
  logModelCall,
  logRefusal,
  events
};
