const STATUS_MAP = {
  Healthy: 'badge-green', 'Under Treatment': 'badge-orange', Critical: 'badge-red', Deceased: 'badge-gray',
  Pregnant: 'badge-purple', Completed: 'badge-green', Pending: 'badge-orange',
  'In Progress': 'badge-blue', Recovered: 'badge-green', 'Not Confirmed': 'badge-gray'
};
export function StatusBadge({ status }) {
  return <span className={`badge ${STATUS_MAP[status] || 'badge-gray'}`}>{status}</span>;
}

const PRIORITY_MAP = { High: 'badge-red', Medium: 'badge-orange', Low: 'badge-blue' };
export function PriorityBadge({ priority }) {
  return <span className={`badge ${PRIORITY_MAP[priority] || 'badge-gray'}`}>{priority || 'Medium'}</span>;
}

const PREGNANCY_MAP = { Pregnant: 'badge-purple', 'Not Confirmed': 'badge-gray', 'Not Pregnant': 'badge-orange', Delivered: 'badge-green' };
export function PregnancyBadge({ status }) {
  return <span className={`badge ${PREGNANCY_MAP[status] || 'badge-gray'}`}>{status}</span>;
}

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
