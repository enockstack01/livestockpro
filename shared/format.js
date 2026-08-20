/* Date/age formatting shared by web (client/src/lib/badges.jsx) and mobile
   (mobile/src/lib/shared.js re-exports this). Kept as the single source of
   truth so the two clients never drift on "what does '3 months' mean". */

export function fmtDate(value) {
  return value ? new Date(value).toLocaleDateString() : '—';
}

export function calcAge(dob) {
  if (!dob) return '—';
  const diff = Date.now() - new Date(dob).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days < 30) return days + ' days';
  if (days < 365) return Math.floor(days / 30) + ' months';
  return (days / 365).toFixed(1) + ' years';
}
