import { useAuth } from '@clerk/expo';
import { useMemo } from 'react';
import { setAiUsage } from '../../../shared/aiUsage';
import { getDeviceId } from '../lib/deviceId';

/* Absolute URL required on native (no page origin to be relative to, unlike
   client/src/lib/api.js's '/api'). Set per environment in .env / EAS build
   profiles — see mobile/.env.example. */
const API_BASE = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/$/, '') + '/api';

async function request(getToken, path, options = {}) {
  let headers = { 'Content-Type': 'application/json', 'X-Device-Id': await getDeviceId() };
  try {
    const token = await getToken();
    if (token) headers.Authorization = 'Bearer ' + token;
  } catch {
    /* not signed in */
  }

  let res;
  try {
    res = await fetch(API_BASE + path, { ...options, headers });
  } catch {
    return { data: null, error: { message: 'Network error: could not reach the server.', networkError: true } };
  }

  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }

  if (!res.ok) {
    const message = (json && json.error && json.error.message) || `Request failed (${res.status})`;
    const err = (json && json.error) || {};
    if (err.usage) setAiUsage(err.usage);
    return { data: null, error: { message, status: res.status, code: err.code, kind: err.kind, usage: err.usage } };
  }
  if (json && json.usage) setAiUsage(json.usage);
  return json || { data: null, error: null };
}

/* Same {data,error} contract and method shapes as client/src/lib/api.js's
   useApi(), so the two clients read identically. Screens don't call this
   directly for the 8 record tables (they go through src/db/repository.js
   instead) — it's used by the sync engine, and directly for rpc()/push token
   registration which are inherently server-authoritative, low-frequency calls. */
export function useApi() {
  const { getToken } = useAuth();

  return useMemo(() => ({
    async list(table, { select, eq, order, limit, updatedSince, includeDeleted } = {}) {
      const params = new URLSearchParams();
      if (select) params.set('select', select);
      if (eq) Object.entries(eq).forEach(([k, v]) => { if (v !== undefined && v !== null) params.set(k, v); });
      if (order) params.set('order', order);
      if (limit) params.set('limit', limit);
      if (updatedSince) params.set('updated_since', updatedSince);
      if (includeDeleted) params.set('include_deleted', 'true');
      const qs = params.toString();
      return request(getToken, `/data/${table}${qs ? '?' + qs : ''}`);
    },
    /* Delta pull for the sync engine: every row changed since the last sync,
       tombstones included so locally-cached rows deleted elsewhere can be
       removed on-device too. */
    async listSince(table, updatedSince, { includeDeleted = true } = {}) {
      return this.list(table, { updatedSince, includeDeleted, order: 'created_at.asc' });
    },
    async getById(table, id) {
      const result = await request(getToken, `/data/${table}?id=${encodeURIComponent(id)}`);
      if (result.error) return { data: null, error: result.error };
      if (!result.data || result.data.length === 0) return { data: null, error: { message: 'Not found.' } };
      return { data: result.data[0], error: null };
    },
    async insert(table, records) {
      return request(getToken, `/data/${table}`, { method: 'POST', body: JSON.stringify(records) });
    },
    async update(table, id, patch) {
      return request(getToken, `/data/${table}?id=${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
    },
    async remove(table, id) {
      return request(getToken, `/data/${table}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
    async rpc(fn, args) {
      return request(getToken, `/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args || {}) });
    },
    async myRole() {
      return request(getToken, '/admin/role');
    },
    /* AI features (server/routes/aiRoutes.js): need a connection, never cached. */
    /* Generic call for the organization API (/api/organizations, /api/join,
       /api/me/organization, /api/admin/organizations, /api/notifications). */
    async http(method, path, body) {
      return request(getToken, path, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    },
    async aiStatus() {
      return request(getToken, '/ai/status');
    },
    async aiUsage() {
      const res = await request(getToken, '/ai/usage');
      if (res.data) setAiUsage(res.data);
      return res;
    },
    async aiDiagnose(body) {
      return request(getToken, '/ai/diagnose', { method: 'POST', body: JSON.stringify(body) });
    },
    async aiAdvisor(body) {
      return request(getToken, '/ai/advisor', { method: 'POST', body: JSON.stringify(body) });
    },
    async aiChat(body) {
      return request(getToken, '/ai/chat', { method: 'POST', body: JSON.stringify(body) });
    },
    async aiReports(params = {}) {
      const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
      return request(getToken, '/ai/reports' + (qs ? '?' + qs : ''));
    },
    async aiDeleteReport(id) {
      return request(getToken, '/ai/reports/' + encodeURIComponent(id), { method: 'DELETE' });
    },
    async rates() {
      return request(getToken, '/rates');
    },
    async myAccount() {
      return request(getToken, '/account');
    },
    async requestAccount(fields) {
      return request(getToken, '/account/request', { method: 'POST', body: JSON.stringify(fields) });
    },
    async setPreferences(prefs) {
      return request(getToken, '/account/preferences', { method: 'PATCH', body: JSON.stringify(prefs) });
    },
  }), [getToken]);
}
