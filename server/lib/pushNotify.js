const { getDb } = require('../db');

/* Sends an Expo push notification to every device a user has registered
   (the `push_tokens` table — just another generic dataRoutes.js collection,
   see its SCHEMAS entry). No queue/cron: called inline, best-effort, from
   the write path that detects the triggering change (dataRoutes.js's PATCH/
   POST handlers) — same "compute live" philosophy as the One Health
   endpoints. Callers must never let a push failure fail the actual request. */
async function sendPushToUser(userId, { title, body, data }) {
  const db = getDb();
  const tokens = await db.collection('push_tokens').find({ user_id: userId, deleted_at: null }).toArray();
  if (!tokens.length) return;

  const messages = tokens.map((t) => ({ to: t.expo_push_token, title, body, data, sound: 'default' }));
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });
}

module.exports = { sendPushToUser };
