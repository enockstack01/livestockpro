/* Status -> tone-name mapping lives in shared/statusMaps.js, imported by both
   this file and mobile/src/components/Badges.js, so the two clients can never
   quietly drift on "what color is a Critical animal". Each client still maps
   tone-name -> its own rendering (this file: a CSS class; mobile: a hex pair)
   since a React Native <View> and a <span className> aren't the same kind of
   thing to share further than that. */
import { STATUS_TONE, PRIORITY_TONE, PREGNANCY_TONE } from '../../../shared/statusMaps';

export function StatusBadge({ status }) {
  return <span className={`badge badge-${STATUS_TONE[status] || 'gray'}`}>{status}</span>;
}

export function PriorityBadge({ priority }) {
  return <span className={`badge badge-${PRIORITY_TONE[priority] || 'gray'}`}>{priority || 'Medium'}</span>;
}

export function PregnancyBadge({ status }) {
  return <span className={`badge badge-${PREGNANCY_TONE[status] || 'gray'}`}>{status}</span>;
}

export { fmtDate, calcAge } from '../../../shared/format';

export function downloadCSV(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function csvCell(value) {
  if (value === null || value === undefined) return '""';
  return '"' + String(value).replace(/"/g, '""') + '"';
}
