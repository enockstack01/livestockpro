import { useAuth } from '@clerk/clerk-react';
import { useMemo } from 'react';
import { setAiUsage } from '../../../shared/aiUsage';

const API_BASE = '/api';

/* A random id for this browser, sent with every request so the join
   endpoint can rate limit per device as well as per IP. */
function deviceId() {
  try {
    let id = localStorage.getItem('lp_device_id');
    if (!id) { id = (crypto.randomUUID && crypto.randomUUID()) || String(Math.random()).slice(2); localStorage.setItem('lp_device_id', id); }
    return id;
  } catch {
    return '';
  }
}

async function request(getToken, path, options = {}) {
  let headers = { 'Content-Type': 'application/json', 'X-Device-Id': deviceId() };
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
    return { data: null, error: { message: 'Network error: could not reach the server.' } };
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

/* Mirrors the shape of the old vanilla supabase.js data client, minus auth
   (Clerk's React hooks handle that directly in components). */
export function useApi() {
  const { getToken } = useAuth();

  return useMemo(() => ({
    async list(table, { select, eq, order, limit } = {}) {
      const params = new URLSearchParams();
      if (select) params.set('select', select);
      if (eq) Object.entries(eq).forEach(([k, v]) => { if (v !== undefined && v !== null) params.set(k, v); });
      if (order) params.set('order', order);
      if (limit) params.set('limit', limit);
      const qs = params.toString();
      return request(getToken, `/data/${table}${qs ? '?' + qs : ''}`);
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
    /* AI features (server/routes/aiRoutes.js). */
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
    async aiOneHealthBrief(body) {
      return request(getToken, '/ai/onehealth/brief', { method: 'POST', body: JSON.stringify(body) });
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
    async adminStats() {
      return request(getToken, '/admin/stats');
    },
    async adminUsers() {
      return request(getToken, '/admin/users');
    },
    async adminSpatial() {
      return request(getToken, '/admin/spatial');
    },
    async adminOneHealth() {
      return request(getToken, '/admin/onehealth');
    },
    async adminOneHealthMap() {
      return request(getToken, '/admin/onehealth/map');
    },
    async setUserStatus(userId, banned) {
      return request(getToken, `/admin/users/${encodeURIComponent(userId)}/status`, { method: 'PATCH', body: JSON.stringify({ banned }) });
    },
    async setUserRole(userId, role) {
      return request(getToken, `/admin/users/${encodeURIComponent(userId)}/role`, { method: 'PATCH', body: JSON.stringify({ role }) });
    },
    async setAccountStatus(userId, status, note) {
      return request(getToken, `/admin/users/${encodeURIComponent(userId)}/account`, { method: 'PATCH', body: JSON.stringify({ status, note }) });
    },
    async deleteUserAccount(userId) {
      return request(getToken, `/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
    }
  }), [getToken]);
}
