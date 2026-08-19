import { useAuth } from '@clerk/clerk-react';
import { useMemo } from 'react';

const API_BASE = '/api';

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
    return { data: null, error: { message: 'Network error: could not reach the server.' } };
  }

  let json = null;
  try { json = await res.json(); } catch (e) { /* empty body */ }

  if (!res.ok) {
    const message = (json && json.error && json.error.message) || `Request failed (${res.status})`;
    return { data: null, error: { message } };
  }
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
    async setUserStatus(userId, banned) {
      return request(getToken, `/admin/users/${encodeURIComponent(userId)}/status`, { method: 'PATCH', body: JSON.stringify({ banned }) });
    },
    async setUserRole(userId, role) {
      return request(getToken, `/admin/users/${encodeURIComponent(userId)}/role`, { method: 'PATCH', body: JSON.stringify({ role }) });
    },
    async deleteUserAccount(userId) {
      return request(getToken, `/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
    }
  }), [getToken]);
}
