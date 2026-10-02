const express = require('express');

const router = express.Router();

/* GET /api/rates — exchange rates for converting amounts recorded in
   different currencies into the user's display currency. Proxied (rather
   than fetched by each client) so the browser CSP stays closed, the mobile
   app talks to one host, and the free upstream is hit at most a few times a
   day. Rates are units of each currency per 1 USD. */
const SOURCE = 'https://open.er-api.com/v6/latest/USD';
const TTL_MS = 6 * 60 * 60 * 1000;

let cache = null; // { base, rates, updatedAt, fetchedAt }

async function loadRates() {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache;
  try {
    const res = await fetch(SOURCE, { signal: AbortSignal.timeout(8000) });
    const json = await res.json();
    if (!res.ok || json.result !== 'success' || !json.rates) throw new Error('Bad rates response');
    cache = { base: 'USD', rates: json.rates, updatedAt: new Date(json.time_last_update_unix * 1000).toISOString(), fetchedAt: Date.now() };
  } catch (err) {
    if (!cache) throw err; // serve the last good copy if the upstream is down
  }
  return cache;
}

router.get('/', async (req, res) => {
  try {
    const { base, rates, updatedAt } = await loadRates();
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({ data: { base, rates, updatedAt }, error: null });
  } catch {
    res.status(503).json({ error: { message: 'Exchange rates are unavailable right now.' } });
  }
});

module.exports = router;
