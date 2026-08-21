/* Color/label tokens for status-style badges, shared by the web app
   (client/src/lib/badges.jsx) and the mobile app (mobile/src/components/Badges.js).
   Hex values are lifted straight from client/src/style.css's .badge-* classes
   so both clients render the same palette in light mode. The web app has no
   dark mode; DARK_TONES is mobile-only, tuned so pastel badge backgrounds
   don't look washed-out against a near-black card surface. */

export const TONES = {
  green: { bg: '#E8F5E9', fg: '#1B5E20' },
  orange: { bg: '#FFF8E1', fg: '#E65100' },
  red: { bg: '#FFEBEE', fg: '#D32F2F' },
  blue: { bg: '#E3F2FD', fg: '#1976D2' },
  purple: { bg: '#F3E5F5', fg: '#7B1FA2' },
  gray: { bg: '#ECEFF1', fg: '#546E7A' },
};

export const DARK_TONES = {
  green: { bg: '#1B3A20', fg: '#81C784' },
  orange: { bg: '#4A3B14', fg: '#FFB74D' },
  red: { bg: '#4A1F1D', fg: '#EF5350' },
  blue: { bg: '#173A5E', fg: '#64B5F6' },
  purple: { bg: '#3C1F52', fg: '#BA68C8' },
  gray: { bg: '#333333', fg: '#B0BEC5' },
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
