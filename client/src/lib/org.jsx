import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAccount } from '../components/AccountGate.jsx';
import { farmerExportRows, toCsv } from '../../../shared/org';

/* The signed-in organization member: { orgId, role, name, status, isAdmin }. */
export function useOrgMember() {
  const { account } = useAccount();
  const org = account && account.organization && account.organization.as === 'member' ? account.organization : null;
  return {
    orgId: org ? org.id : null,
    role: org ? org.role : null,
    name: org ? org.name : '',
    status: org ? org.status : null,
    logo: org ? org.logo : null,
    isAdmin: Boolean(org && org.role === 'org_admin'),
    readOnly: Boolean(org && org.status !== 'active')
  };
}

/* Loads `path` with GET and exposes { data, error, loading, reload }. */
export function useOrgData(api, path) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  /* Keyed on the path only: the api helper can be a new object on each
     render (Clerk's getToken), which must not trigger another fetch. */
  const apiRef = useRef(api);
  apiRef.current = api;
  const reload = useCallback(async () => {
    if (!path) return;
    setState((s) => ({ ...s, loading: true }));
    const { data, error } = await apiRef.current.http('GET', path);
    setState({ data, error, loading: false });
  }, [path]);
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}

/* A QR code image (data URL) for `text`, drawn in Ink on white. */
export function useQrCode(text, size = 220) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let live = true;
    if (!text) { setSrc(''); return undefined; }
    import('qrcode').then(({ default: QRCode }) => QRCode.toDataURL(text, { width: size, margin: 1, color: { dark: '#1C2B1E', light: '#FFFFFF' }, errorCorrectionLevel: 'M' }))
      .then((url) => { if (live) setSrc(url); })
      .catch(() => {});
    return () => { live = false; };
  }, [text, size]);
  return src;
}

/* Re-renders every second, for live countdowns. */
export function useTick(active = true) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setN((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* Farmer list as CSV or Excel. */
export function useFarmerExport() {
  const { t } = useTranslation();
  const species = (s) => t(`enums.species.${s}`, { defaultValue: s });
  const stamp = new Date().toISOString().slice(0, 10);
  return {
    csv(farmers, orgName) {
      const rows = farmerExportRows(t, farmers, species);
      download(new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' }), `${(orgName || 'Organization').replace(/[^\w-]+/g, '_')}_farmers_${stamp}.csv`);
    },
    async excel(farmers, orgName) {
      const { default: writeExcelFile } = await import('write-excel-file/browser');
      const rows = farmerExportRows(t, farmers, species);
      const sheet = rows.map((r, i) => r.map((v) => (i === 0 ? { value: String(v), fontWeight: 'bold', color: '#FFFFFF', backgroundColor: '#1B5E20' } : v === '' || v === null || v === undefined ? null : v)));
      await writeExcelFile(sheet, { columns: rows[0].map((h, i) => ({ width: i === 0 ? 26 : 16 })) }).toFile(`${(orgName || 'Organization').replace(/[^\w-]+/g, '_')}_farmers_${stamp}.xlsx`);
    }
  };
}

/* The error message for an organization or join API error code. */
export function orgErrorText(t, error) {
  if (!error) return '';
  const code = error.code;
  if (code && t(`org.errors.${code}`, { defaultValue: '' })) return t(`org.errors.${code}`);
  return error.message || t('auth.somethingWentWrong');
}
