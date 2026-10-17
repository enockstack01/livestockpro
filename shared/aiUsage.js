/* Today's AI allowance, shared by every AI screen on a client: the server
   sends the latest usage with each AI answer (and with a quota refusal), and
   GET /api/ai/usage loads it on demand. Screens subscribe to show
   "12 of 50 AI requests left today". */
let current = null;
const listeners = new Set();

export function setAiUsage(usage) {
  if (!usage || typeof usage !== 'object') return;
  current = usage;
  listeners.forEach((fn) => fn(current));
}

export function getAiUsage() {
  return current;
}

export function subscribeAiUsage(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* "14:00" style local time the daily allowance resets. */
export function aiResetTime(usage, lang) {
  if (!usage || !usage.resetAt) return '';
  try { return new Date(usage.resetAt).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
}
