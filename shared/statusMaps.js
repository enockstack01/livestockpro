/* Color/label tokens for status-style badges, shared by the web app
   (client/src/lib/badges.jsx) and the mobile app (mobile/src/components/Badges.js).
   Hex values are lifted straight from client/src/style.css's .badge-* classes
   so both clients render the same palette. */

export const TONES = {
  green: { bg: '#E8F5E9', fg: '#1B5E20' },
  orange: { bg: '#FFF8E1', fg: '#E65100' },
  red: { bg: '#FFEBEE', fg: '#D32F2F' },
  blue: { bg: '#E3F2FD', fg: '#1976D2' },
  purple: { bg: '#F3E5F5', fg: '#7B1FA2' },
  gray: { bg: '#ECEFF1', fg: '#546E7A' },
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

export function tone(name) {
  return TONES[name] || TONES.gray;
}

export function statusTone(status) {
  return tone(STATUS_TONE[status] || 'gray');
}

export function priorityTone(priority) {
  return tone(PRIORITY_TONE[priority] || 'gray');
}

export function pregnancyTone(status) {
  return tone(PREGNANCY_TONE[status] || 'gray');
}
