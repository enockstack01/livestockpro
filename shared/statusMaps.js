/* Color/label tokens for status-style badges, shared by the web app
   (client/src/lib/badges.jsx) and the mobile app (mobile/src/components/Badges.js).
   Hex values are lifted straight from client/src/style.css's .badge-* classes
   so both clients render the same palette in light mode. The web app has no
   dark mode; DARK_TONES is mobile-only, tuned so pastel badge backgrounds
   don't look washed-out against a near-black card surface. */

/* Agricoders pills: solid fills with white or Ink text (White on Forest,
   Ink on Amber, White on Alert Red), never pale tints. */
export const TONES = {
  green: { bg: '#1B5E20', fg: '#FFFFFF' },
  orange: { bg: '#F9A825', fg: '#1C2B1E' },
  red: { bg: '#C62828', fg: '#FFFFFF' },
  blue: { bg: '#5B6B5D', fg: '#FFFFFF' },
  purple: { bg: '#14532D', fg: '#FFFFFF' },
  gray: { bg: '#5B6B5D', fg: '#FFFFFF' },
};

export const DARK_TONES = {
  green: { bg: '#2E7D32', fg: '#FFFFFF' },
  orange: { bg: '#F9A825', fg: '#1C2B1E' },
  red: { bg: '#C62828', fg: '#FFFFFF' },
  blue: { bg: '#5B6B5D', fg: '#FFFFFF' },
  purple: { bg: '#14532D', fg: '#FFFFFF' },
  gray: { bg: '#4A554B', fg: '#FFFFFF' },
};

export const STATUS_TONE = {
  Healthy: 'green',
  'Under Treatment': 'orange',
  Critical: 'red',
  Deceased: 'gray',
  Pregnant: 'purple',
  Completed: 'green',
  Pending: 'orange',
  'In Progress': 'blue',
  Recovered: 'green',
  'Not Confirmed': 'gray',
};

export const PRIORITY_TONE = { High: 'red', Medium: 'orange', Low: 'blue' };

export const PREGNANCY_TONE = {
  Pregnant: 'purple',
  'Not Confirmed': 'gray',
  'Not Pregnant': 'orange',
  Delivered: 'green',
};

export function tone(name, dark) {
  const palette = dark ? DARK_TONES : TONES;
  return palette[name] || palette.gray;
}

export function statusTone(status, dark) {
  return tone(STATUS_TONE[status] || 'gray', dark);
}

export function priorityTone(priority, dark) {
  return tone(PRIORITY_TONE[priority] || 'gray', dark);
}

export function pregnancyTone(status, dark) {
  return tone(PREGNANCY_TONE[status] || 'gray', dark);
}
