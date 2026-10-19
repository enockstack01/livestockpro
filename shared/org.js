/* Organization helpers shared by the web and mobile apps. */

export const ORG_TYPES = ['cooperative', 'ngo', 'company', 'government', 'other'];
export const ORG_TYPE_ICONS = { cooperative: 'people-group', ngo: 'hand-holding-heart', company: 'briefcase', government: 'landmark', other: 'building' };

/* Status pill tone per organization or link status (badge-* classes). */
export const ORG_STATUS_TONE = { pending: 'orange', active: 'green', suspended: 'red' };
export const LINK_STATUS_TONE = { active: 'green', expired: 'gray', revoked: 'red', full: 'orange', suspended: 'red', invalid: 'gray' };

/* "5 h 12 min" / "3 min 20 s" left until `expiresAt`, from a server time
   offset so a wrong phone clock does not change it. */
export function timeLeft(expiresAt, offsetMs = 0) {
  const ms = new Date(expiresAt).getTime() - (Date.now() + offsetMs);
  if (!(ms > 0)) return { ms: 0, h: 0, m: 0, s: 0 };
  const total = Math.floor(ms / 1000);
  return { ms, h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 };
}

export function formatTimeLeft(t, left) {
  if (!left.ms) return t('org.links.expiredShort');
  if (left.h > 0) return t('org.links.leftHours', { h: left.h, m: left.m });
  if (left.m > 0) return t('org.links.leftMinutes', { m: left.m, s: left.s });
  return t('org.links.leftSeconds', { s: left.s });
}

/* The text sent with a referral link on WhatsApp or SMS. */
export function inviteMessage(t, orgName, url, hours) {
  return t('org.links.shareMessage', { name: orgName, url, hours });
}

export const whatsappUrl = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;
export const smsUrl = (text) => `sms:?&body=${encodeURIComponent(text)}`;

/* The join path from a full link or a bare token. */
export function tokenFromLink(value) {
  const v = String(value || '').trim();
  const m = v.match(/join\/([A-Za-z0-9_-]{20,})/);
  return m ? m[1] : /^[A-Za-z0-9_-]{20,}$/.test(v) ? v : '';
}

/* Farmer list export rows (CSV and Excel use the same columns). */
export function farmerExportRows(t, farmers, speciesLabel = (s) => s) {
  const header = [
    t('org.farmers.colName'), t('org.farmers.colFarm'), t('org.farmers.colPhone'), t('org.farmers.colDistrict'), t('org.farmers.colSector'), t('org.farmers.colCell'),
    t('org.farmers.colHerd'), t('org.farmers.colSpecies'), t('org.farmers.colOpenCases'), t('org.farmers.colJoined'), t('org.farmers.colLastActivity'), t('org.farmers.colStatus')
  ];
  const rows = farmers.map((f) => [
    f.name, f.farm_name, f.phone, f.district, f.sector, f.cell, f.herd_size,
    (f.main_species || []).map((s) => `${speciesLabel(s.species)} ${s.count}`).join(', '),
    f.open_cases, f.joined_at ? f.joined_at.slice(0, 10) : '', f.last_activity ? f.last_activity.slice(0, 10) : '', t(`org.farmers.status.${f.status}`)
  ]);
  return [header, ...rows];
}

export function toCsv(rows) {
  const cell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\n');
}

/* Parses a pasted or uploaded CSV of farmer emails for the bulk import:
   any column holding an email address is used. */
export function emailsFromCsv(text) {
  const out = new Set();
  String(text || '').split(/\r?\n/).forEach((line) => {
    line.split(/[,;\t]/).forEach((v) => {
      const s = v.trim().replace(/^"|"$/g, '').toLowerCase();
      if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) out.add(s);
    });
  });
  return [...out];
}
