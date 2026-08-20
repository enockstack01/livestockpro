import { useAuth } from '@clerk/expo';
import { useMemo } from 'react';

/* Absolute URL required on native (no page origin to be relative to, unlike
   client/src/lib/api.js's '/api'). Set per environment in .env / EAS build
   profiles — see mobile/.env.example. */
const API_BASE = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/$/, '') + '/api';

async function request(getToken, path, options = {}) {
  let headers = { 'Content-Type': 'application/json' };
  try {
    const token = await getToken();
    if (token) headers.Authorization = 'Bearer ' + token;
  } catch (e) {
    /* not signed in */
  }

  let res;
  try {
    res = await fetch(API_BASE + path, { ...options, headers });
  } catch (err) {
    return { data: null, error: { message: 'Network error: could not reach the server.', networkError: true } };
  }

  let json = null;
  try { json = await res.json(); } catch (e) { /* empty body */ }

  if (!res.ok) {
    const message = (json && json.error && json.error.message) || `Request failed (${res.status})`;
    return { data: null, error: { message, status: res.status } };
  }
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
  }), [getToken]);
}
