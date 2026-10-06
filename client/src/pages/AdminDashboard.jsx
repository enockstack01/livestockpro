import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { useCanvasChart } from '../lib/useChart.js';
import { useTopbarSearch } from '../lib/topbarSearch.jsx';
import Modal from '../components/Modal.jsx';
import SpatialMap from '../components/SpatialMap.jsx';
import { ACCOUNT_TYPE_ICONS } from '../../../shared/account';

const RESOURCE_LABELS = {
  animals: { labelKey: 'tables.animals.label', icon: 'fa-cow', color: '#2E7D32' },
  health_records: { labelKey: 'healthPage.title', icon: 'fa-stethoscope', color: '#F9A825' },
  feeding_records: { labelKey: 'tables.feeding_records.singular', icon: 'fa-wheat-awn', color: '#1976D2' },
  breeding_records: { labelKey: 'tables.breeding_records.singular', icon: 'fa-venus-mars', color: '#7B1FA2' },
  production_records: { labelKey: 'tables.production_records.singular', icon: 'fa-gauge', color: '#0097A7' },
  finance_records: { labelKey: 'tables.finance_records.singular', icon: 'fa-coins', color: '#D32F2F' },
  tasks: { labelKey: 'tables.tasks.label', icon: 'fa-list-check', color: '#5D4037' }
};

const ROLE_BADGE = { super_admin: 'badge-purple', admin: 'badge-blue', user: 'badge-gray' };
const ROLE_LABEL_KEY = { super_admin: 'adminDashboard.roleSuperAdmin', admin: 'adminDashboard.roleAdmin', user: 'adminDashboard.roleUser' };
const ACCOUNT_BADGE = { approved: 'badge-green', pending: 'badge-orange', on_hold: 'badge-blue', rejected: 'badge-red', none: 'badge-gray' };

/* The account-review actions available for a user in a given state, in the
   order they're offered: approve/activate/re-activate all set 'approved'. */
function accountActions(u) {
  const out = [];
  const status = u.accountStatus;
  if (status !== 'approved' || u.banned) {
    const key = status === 'pending' ? 'approve' : status === 'none' ? 'activate' : 'reactivate';
    out.push({ status: 'approved', key, icon: 'fa-user-check', btn: 'btn-primary' });
  }
  if (status === 'approved' || status === 'pending') out.push({ status: 'on_hold', key: 'hold', icon: 'fa-circle-pause', btn: 'btn-secondary' });
  if (status === 'pending' || status === 'none') out.push({ status: 'rejected', key: 'reject', icon: 'fa-user-xmark', btn: 'btn-danger' });
  return out;
}

function fmtDateTime(ms) {
  return ms ? new Date(ms).toLocaleString() : '—';
}

function timeAgo(ms, t) {
  if (!ms) return '—';
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('adminDashboard.justNow');
  if (mins < 60) return t('adminDashboard.minutesAgo', { count: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t('adminDashboard.hoursAgo', { count: hrs });
  const days = Math.floor(hrs / 24);
  if (days < 30) return t('adminDashboard.daysAgo', { count: days });
  return new Date(ms).toLocaleDateString();
}

/* Small ease-out count-up used on the overview stat cards — purely cosmetic. */
function useCountUp(target, durationMs = 700) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (typeof target !== 'number') return;
    let raf;
    const start = performance.now();
    function tick(now) {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

function StatCard({ icon, color, label, value, link }) {
  const isNumber = typeof value === 'number';
  const animated = useCountUp(isNumber ? value : null);
  return (
    <div className={`summary-card${link ? ' clickable' : ''}`} onClick={link}>
      <div className={`summary-icon ${color}`}><i className={`fas ${icon}`}></i></div>
      <div className="summary-info"><h4>{isNumber ? animated.toLocaleString() : value}</h4><p>{label}</p></div>
    </div>
  );
}

function SortHeader({ label, sortKey, active, dir, onSort }) {
  return (
    <th className="sortable-th" onClick={() => onSort(sortKey)}>
      {label} <i className={`fas ${active ? (dir === 'asc' ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort'}`} style={{ opacity: active ? 1 : 0.35, marginLeft: 4 }}></i>
    </th>
  );
}

export default function AdminDashboard() {
  const { t } = useTranslation();
  const { role } = useOutletContext();
  const { user: currentUser } = useUser();
  const api = useApi();
  const showToast = useToast();
  const navigate = useNavigate();

  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [tab, setTab] = useState('overview');

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortKey, setSortKey] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');

  const [banTarget, setBanTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [grantUserId, setGrantUserId] = useState('');
  const [accountTarget, setAccountTarget] = useState(null);
  const [accountNote, setAccountNote] = useState('');
  const [requestFilter, setRequestFilter] = useState('pending');

  const isSuperAdmin = role === 'super_admin';

  useTopbarSearch(t('adminDashboard.searchUsersPlaceholder'), setSearch);

  useEffect(() => {
    if (role === 'user') navigate('/dashboard', { replace: true });
  }, [role, navigate]);

  async function loadAll(isRefresh) {
    if (isRefresh) setRefreshing(true);
    const [statsRes, usersRes] = await Promise.all([api.adminStats(), api.adminUsers()]);
    if (statsRes.error) showToast(t('adminDashboard.failedLoadStats', { message: statsRes.error.message }), 'error');
    else if (!statsRes.data) showToast(t('adminDashboard.failedLoadStatsEmpty'), 'error');
    else setStats(statsRes.data);
    if (usersRes.error) showToast(t('adminDashboard.failedLoadUsers', { message: usersRes.error.message }), 'error');
    else setUsers(usersRes.data || []);
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    if (role === 'admin' || role === 'super_admin') loadAll(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  }

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase();
    let list = users.filter((u) => {
      const matchSearch = !q || u.email.toLowerCase().includes(q) || (u.farmName || '').toLowerCase().includes(q);
      const matchRole = !roleFilter || u.role === roleFilter;
      const matchStatus = !statusFilter || (statusFilter === 'banned' ? u.banned : u.accountStatus === statusFilter && !u.banned);
      return matchSearch && matchRole && matchStatus;
    });
    list = list.slice().sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (typeof av === 'string') { av = av.toLowerCase(); bv = bv.toLowerCase(); }
      if (av == null) av = sortDir === 'asc' ? Infinity : -Infinity;
      if (bv == null) bv = sortDir === 'asc' ? Infinity : -Infinity;
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [users, search, roleFilter, statusFilter, sortKey, sortDir]);

  const pendingCount = useMemo(() => users.filter((u) => u.role === 'user' && u.accountStatus === 'pending').length, [users]);
  const requests = useMemo(() => users
    .filter((u) => u.role === 'user' && (requestFilter === 'all' ? u.request : u.accountStatus === requestFilter))
    .sort((a, b) => String((b.request && b.request.submittedAt) || '').localeCompare(String((a.request && a.request.submittedAt) || ''))), [users, requestFilter]);
  const admins = useMemo(() => users.filter((u) => u.role !== 'user').sort((a, b) => b.createdAt - a.createdAt), [users]);
  const promotableUsers = useMemo(() => users.filter((u) => u.role === 'user' && u.id !== currentUser?.id), [users, currentUser]);
  const recentSignups = useMemo(() => users.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 5), [users]);
  const topFarms = useMemo(() => users.filter((u) => u.recordCount > 0).slice().sort((a, b) => b.recordCount - a.recordCount).slice(0, 5), [users]);

  const engagement = useMemo(() => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    let today = 0, week = 0, month = 0, inactive = 0;
    users.forEach((u) => {
      const age = u.lastSignInAt ? now - u.lastSignInAt : Infinity;
      if (age <= day) today++;
      else if (age <= 7 * day) week++;
      else if (age <= 30 * day) month++;
      else inactive++;
    });
    return { today, week, month, inactive };
  }, [users]);

  const signupTrend = useMemo(() => {
    const days = 14;
    const buckets = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      buckets.push({ label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), start: d.getTime(), end: d.getTime() + 24 * 60 * 60 * 1000, count: 0 });
    }
    users.forEach((u) => {
      const bucket = buckets.find((b) => u.createdAt >= b.start && u.createdAt < b.end);
      if (bucket) bucket.count++;
    });
    return buckets;
  }, [users]);

  async function toggleBan(target) {
    setBusyId(target.id);
    const { error } = await api.setUserStatus(target.id, !target.banned);
    setBusyId(null);
    if (error) { showToast(t('adminDashboard.failedWithMessage', { message: error.message }), 'error'); return; }
    showToast(target.banned ? t('adminDashboard.userUnbanned') : t('adminDashboard.userBanned'), 'success');
    setBanTarget(null);
    await loadAll(true);
  }

  function openAccountAction(user, action) {
    setAccountTarget({ user, ...action });
    setAccountNote('');
  }

  async function applyAccountAction() {
    if (!accountTarget) return;
    const { user, status } = accountTarget;
    setBusyId(user.id);
    const { error } = await api.setAccountStatus(user.id, status, accountNote.trim());
    setBusyId(null);
    if (error) { showToast(t('adminDashboard.failedWithMessage', { message: error.message }), 'error'); return; }
    showToast(t('adminDashboard.accountUpdated'), 'success');
    setAccountTarget(null);
    await loadAll(true);
  }

  async function changeRole(userId, newRole) {
    setBusyId(userId);
    const { error } = await api.setUserRole(userId, newRole);
    setBusyId(null);
    if (error) { showToast(t('adminDashboard.failedWithMessage', { message: error.message }), 'error'); return; }
    showToast(t('adminDashboard.roleUpdated'), 'success');
    await loadAll(true);
  }

  async function grantAdmin() {
    if (!grantUserId) { showToast(t('adminDashboard.pickUserFirst'), 'error'); return; }
    await changeRole(grantUserId, 'admin');
    setGrantUserId('');
  }

  async function doDelete() {
    if (!deleteTarget) return;
    if (deleteConfirmText !== 'DELETE') { showToast(t('settings.typeDeleteToConfirm'), 'error'); return; }
    setBusyId(deleteTarget.id);
    const { error } = await api.deleteUserAccount(deleteTarget.id);
    setBusyId(null);
    if (error) { showToast(t('adminDashboard.failedWithMessage', { message: error.message }), 'error'); return; }
    showToast(t('adminDashboard.userAccountDeleted'), 'success');
    setDeleteTarget(null);
    setDeleteConfirmText('');
    await loadAll(true);
  }

  if (role === null || (role !== 'admin' && role !== 'super_admin')) return null;

  const overview = stats ? [
    { key: 'totalUsers', icon: 'fa-users', color: 'blue', label: t('adminDashboard.totalUsers'), value: stats.totalUsers },
    { key: 'totalRecords', icon: 'fa-database', color: 'green', label: t('adminDashboard.totalRecords'), value: stats.totalRecords },
    { key: 'newUsers7d', icon: 'fa-user-plus', color: 'purple', label: t('adminDashboard.newUsers7d'), value: stats.newUsersLast7Days },
    { key: 'pendingRequests', icon: 'fa-user-clock', color: pendingCount > 0 ? 'orange' : 'green', label: t('adminDashboard.pendingRequests'), value: pendingCount },
    { key: 'bannedUsers', icon: 'fa-user-slash', color: stats.bannedUsers > 0 ? 'red' : 'orange', label: t('adminDashboard.bannedUsers'), value: stats.bannedUsers },
    { key: 'avgRecordsPerFarm', icon: 'fa-chart-simple', color: 'blue', label: t('adminDashboard.avgRecordsPerFarm'), value: stats.totalUsers ? Math.round(stats.totalRecords / stats.totalUsers) : 0 },
    { key: 'activeThisWeek', icon: 'fa-signal', color: 'green', label: t('adminDashboard.activeThisWeek'), value: engagement.today + engagement.week }
  ] : [];

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{t('adminDashboard.title')} <span className={`badge ${ROLE_BADGE[role]}`} style={{ verticalAlign: 'middle', marginLeft: 8 }}>{t(ROLE_LABEL_KEY[role])}</span></h1>
          <p>{t('adminDashboard.subtitle')}</p>
        </div>
        <button className="btn btn-secondary" onClick={() => loadAll(true)} disabled={refreshing}>
          {refreshing ? <><i className="fas fa-spinner fa-spin"></i> {t('common.refreshing')}</> : <><i className="fas fa-rotate"></i> {t('common.refresh')}</>}
        </button>
      </div>

      {loading ? (
        <div className="empty-state" style={{ padding: '60px 20px' }}><i className="fas fa-spinner fa-spin"></i><h3>{t('adminDashboard.loadingPlatformData')}</h3></div>
      ) : (
        <>
          <div className="tabs">
            <button className={`tab-btn${tab === 'overview' ? ' active' : ''}`} onClick={() => setTab('overview')}><i className="fas fa-chart-line"></i> {t('adminDashboard.tabOverview')}</button>
            <button className={`tab-btn${tab === 'requests' ? ' active' : ''}`} onClick={() => setTab('requests')}><i className="fas fa-user-clock"></i> {t('adminDashboard.tabRequests')} <span className="tab-count">{pendingCount}</span></button>
            <button className={`tab-btn${tab === 'users' ? ' active' : ''}`} onClick={() => setTab('users')}><i className="fas fa-users"></i> {t('adminDashboard.tabUsers')} <span className="tab-count">{users.length}</span></button>
            <button className={`tab-btn${tab === 'admins' ? ' active' : ''}`} onClick={() => setTab('admins')}><i className="fas fa-user-shield"></i> {t('adminDashboard.tabAdmins')} <span className="tab-count">{admins.length}</span></button>
            <button className={`tab-btn${tab === 'map' ? ' active' : ''}`} onClick={() => setTab('map')}><i className="fas fa-map-location-dot"></i> {t('adminDashboard.tabMap')}</button>
          </div>

          {tab === 'overview' && (
            <div className="admin-fade-in">
              <div className="summary-grid">
                {overview.map((s) => <StatCard key={s.key} {...s} link={s.key === 'pendingRequests' ? () => { setRequestFilter('pending'); setTab('requests'); } : s.key === 'totalUsers' || s.key === 'bannedUsers' ? () => setTab('users') : undefined} />)}
              </div>

              <div className="charts-grid">
                <div className="card">
                  <div className="card-header"><h3>{t('adminDashboard.resourceBreakdown')}</h3></div>
                  <div className="card-body"><ResourceChart byCollection={stats?.byCollection} /></div>
                </div>
                <div className="card">
                  <div className="card-header"><h3>{t('adminDashboard.usersByRole')}</h3></div>
                  <div className="card-body"><RoleChart users={users} /></div>
                </div>
              </div>

              <div className="charts-grid">
                <div className="card">
                  <div className="card-header"><h3><i className="fas fa-heart-pulse" style={{ color: 'var(--primary)', marginRight: 6 }}></i> {t('adminDashboard.platformAnimalHealth')}</h3></div>
                  <div className="card-body"><HealthBreakdownChart breakdown={stats?.healthBreakdown} /></div>
                </div>
                <div className="card">
                  <div className="card-header"><h3><i className="fas fa-paw" style={{ color: 'var(--orange)', marginRight: 6 }}></i> {t('adminDashboard.popularSpecies')}</h3></div>
                  <div className="card-body"><SpeciesChart breakdown={stats?.speciesBreakdown} /></div>
                </div>
                <div className="card">
                  <div className="card-header"><h3><i className="fas fa-list-check" style={{ color: 'var(--blue)', marginRight: 6 }}></i> {t('adminDashboard.taskCompletion')}</h3></div>
                  <div className="card-body"><TaskBreakdownChart breakdown={stats?.taskBreakdown} /></div>
                </div>
              </div>

              <div className="card mb-24">
                <div className="card-header"><h3><i className="fas fa-arrow-trend-up" style={{ color: 'var(--primary)', marginRight: 6 }}></i> {t('adminDashboard.signupTrend')}</h3></div>
                <div className="card-body"><SignupTrendChart buckets={signupTrend} /></div>
              </div>

              <div className="card mb-24">
                <div className="card-header"><h3><i className="fas fa-trophy" style={{ color: 'var(--orange)', marginRight: 6 }}></i> {t('adminDashboard.topFarmsByActivity')}</h3></div>
                <div className="card-body" style={{ padding: 0 }}>
                  {topFarms.length === 0 ? (
                    <div className="empty-state"><i className="fas fa-trophy"></i><h3>{t('adminDashboard.noActivityYet')}</h3></div>
                  ) : (
                    <div className="table-wrapper"><table className="data-table">
                      <thead><tr><th>{t('adminDashboard.colRank')}</th><th>{t('adminDashboard.colFarm')}</th><th>{t('adminDashboard.colEmail')}</th><th>{t('adminDashboard.colRecords')}</th></tr></thead>
                      <tbody>{topFarms.map((u, i) => (
                        <tr key={u.id} style={{ cursor: 'pointer' }} onClick={() => setTab('users')}>
                          <td className="fw-600">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</td>
                          <td>{u.farmName || '—'}</td>
                          <td className="fw-600">{u.email}</td>
                          <td>{u.recordCount.toLocaleString()}</td>
                        </tr>
                      ))}</tbody>
                    </table></div>
                  )}
                </div>
              </div>

              <div className="card">
                <div className="card-header"><h3>{t('adminDashboard.recentSignups')}</h3><span className="badge badge-green">{t('adminDashboard.last', { count: recentSignups.length })}</span></div>
                <div className="card-body" style={{ padding: 0 }}>
                  {recentSignups.length === 0 ? (
                    <div className="empty-state"><i className="fas fa-user-plus"></i><h3>{t('adminDashboard.noUsersYet')}</h3></div>
                  ) : (
                    <div className="table-wrapper"><table className="data-table">
                      <thead><tr><th>{t('adminDashboard.colEmail')}</th><th>{t('adminDashboard.colFarm')}</th><th>{t('adminDashboard.colRole')}</th><th>{t('adminDashboard.colJoined')}</th></tr></thead>
                      <tbody>{recentSignups.map((u) => (
                        <tr key={u.id} style={{ cursor: 'pointer' }} onClick={() => setTab('users')}>
                          <td className="fw-600">{u.email}</td>
                          <td>{u.farmName || '—'}</td>
                          <td><span className={`badge ${ROLE_BADGE[u.role]}`}>{t(ROLE_LABEL_KEY[u.role])}</span></td>
                          <td>{timeAgo(u.createdAt, t)}</td>
                        </tr>
                      ))}</tbody>
                    </table></div>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'requests' && (
            <div className="admin-fade-in">
              <div className="filter-bar">
                <select className="form-control" value={requestFilter} onChange={(e) => setRequestFilter(e.target.value)}>
                  <option value="pending">{t('account.status.pending')}</option>
                  <option value="on_hold">{t('account.status.on_hold')}</option>
                  <option value="rejected">{t('account.status.rejected')}</option>
                  <option value="approved">{t('account.status.approved')}</option>
                  <option value="all">{t('adminDashboard.allRequests')}</option>
                </select>
              </div>
              {requests.length === 0 ? (
                <div className="card"><div className="empty-state"><i className="fas fa-inbox"></i><h3>{t('adminDashboard.noRequests')}</h3><p>{t('adminDashboard.noRequestsHint')}</p></div></div>
              ) : (
                <div className="request-grid">
                  {requests.map((u) => {
                    const r = u.request || {};
                    const type = u.accountType || 'farmer';
                    return (
                      <div key={u.id} className="card request-card">
                        <div className="card-body">
                          <div className="request-card-head">
                            <div className="summary-icon green"><i className={`fas fa-${ACCOUNT_TYPE_ICONS[type] || 'user'}`}></i></div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <h4>{r.fullName || u.email}</h4>
                              <p>{u.email}</p>
                            </div>
                            <span className={`badge ${ACCOUNT_BADGE[u.accountStatus]}`}>{t(`account.status.${u.accountStatus}`)}</span>
                          </div>
                          <div className="request-fields">
                            <div><span>{t('account.accountType')}</span>{t(`account.types.${type}`)}</div>
                            <div><span>{t('account.farmName')}</span>{r.farmName || '—'}</div>
                            <div><span>{t('settings.location')}</span>{r.location || '—'}</div>
                            <div><span>{t('settings.phoneNumber')}</span>{r.phone || '—'}</div>
                            <div><span>{t('account.herdSize')}</span>{r.herdSize || '—'}</div>
                            <div><span>{t('account.livestockTypes')}</span>{r.livestockTypes || '—'}</div>
                          </div>
                          {r.notes && <div className="request-notes">{r.notes}</div>}
                          {u.reviewNote && u.accountStatus !== 'pending' && <div className="request-notes"><strong>{t('account.adminNote')}:</strong> {u.reviewNote}</div>}
                          <div className="text-muted" style={{ fontSize: 12 }}>{r.submittedAt ? t('account.submittedOn', { date: new Date(r.submittedAt).toLocaleString() }) : ''}</div>
                          <div className="request-actions">
                            {accountActions(u).map((a) => (
                              <button key={a.key} className={`btn btn-sm ${a.btn}`} disabled={busyId === u.id} onClick={() => openAccountAction(u, a)}>
                                <i className={`fas ${a.icon}`}></i> {t(`adminDashboard.${a.key}`)}
                              </button>
                            ))}
                            <button className="btn btn-sm btn-secondary" disabled={busyId === u.id} onClick={() => { setDeleteTarget(u); setDeleteConfirmText(''); }}>
                              <i className="fas fa-trash"></i> {t('common.delete')}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'users' && (
            <div className="admin-fade-in">
              <div className="filter-bar">
                <select className="form-control" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                  <option value="">{t('adminDashboard.allRoles')}</option>
                  <option value="user">{t('adminDashboard.roleUser')}</option>
                  <option value="admin">{t('adminDashboard.roleAdmin')}</option>
                  <option value="super_admin">{t('adminDashboard.roleSuperAdmin')}</option>
                </select>
                <select className="form-control" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">{t('adminDashboard.allStatuses')}</option>
                  <option value="approved">{t('account.status.approved')}</option>
                  <option value="pending">{t('account.status.pending')}</option>
                  <option value="on_hold">{t('account.status.on_hold')}</option>
                  <option value="rejected">{t('account.status.rejected')}</option>
                  <option value="none">{t('account.status.none')}</option>
                  <option value="banned">{t('adminDashboard.banned')}</option>
                </select>
                {(roleFilter || statusFilter || search) && (
                  <button className="btn btn-secondary btn-sm" onClick={() => { setRoleFilter(''); setStatusFilter(''); }}>
                    <i className="fas fa-xmark"></i> {t('common.clearFilters')}
                  </button>
                )}
              </div>

              <div className="card">
                <div className="card-header"><h3>{t('adminDashboard.userManagement')}</h3><span className="badge badge-green">{t('adminDashboard.xOfY', { filtered: filteredUsers.length, total: users.length })}</span></div>
                <div className="card-body" style={{ padding: 0 }}>
                  <div className="table-wrapper">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <SortHeader label={t('adminDashboard.colUser')} sortKey="email" active={sortKey === 'email'} dir={sortDir} onSort={toggleSort} />
                          <th>{t('adminDashboard.colFarm')}</th>
                          <th>{t('adminDashboard.colRole')}</th>
                          <SortHeader label={t('adminDashboard.colJoined')} sortKey="createdAt" active={sortKey === 'createdAt'} dir={sortDir} onSort={toggleSort} />
                          <SortHeader label={t('adminDashboard.colLastSignIn')} sortKey="lastSignInAt" active={sortKey === 'lastSignInAt'} dir={sortDir} onSort={toggleSort} />
                          <SortHeader label={t('adminDashboard.colRecords')} sortKey="recordCount" active={sortKey === 'recordCount'} dir={sortDir} onSort={toggleSort} />
                          <th>{t('adminDashboard.colStatus')}</th>
                          <th>{t('adminDashboard.colActions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers.length === 0 ? (
                          <tr><td colSpan={8}><div className="empty-state"><i className="fas fa-users-slash"></i><h3>{t('adminDashboard.noMatchingUsers')}</h3><p>{t('adminDashboard.tryDifferentSearch')}</p></div></td></tr>
                        ) : filteredUsers.map((u) => {
                          const isSelf = u.id === currentUser?.id;
                          const canBan = isSuperAdmin || u.role === 'user';
                          const canEditRole = !isSelf && (isSuperAdmin || u.role === 'user');
                          const rowBusy = busyId === u.id;
                          return (
                            <tr key={u.id}>
                              <td className="fw-600">{u.email}{isSelf && <span className="badge badge-blue" style={{ marginLeft: 6 }}>{t('adminDashboard.you')}</span>}</td>
                              <td>{u.farmName || '—'}</td>
                              <td>
                                {canEditRole ? (
                                  <select className="form-control" style={{ padding: '4px 8px', fontSize: 12, minWidth: 130 }} value={u.role} disabled={rowBusy} onChange={(e) => changeRole(u.id, e.target.value)}>
                                    <option value="user">{t('adminDashboard.roleUser')}</option>
                                    <option value="admin">{t('adminDashboard.roleAdmin')}</option>
                                    {isSuperAdmin && <option value="super_admin">{t('adminDashboard.roleSuperAdmin')}</option>}
                                  </select>
                                ) : (
                                  <span className={`badge ${ROLE_BADGE[u.role]}`}>{t(ROLE_LABEL_KEY[u.role])}</span>
                                )}
                              </td>
                              <td>{fmtDateTime(u.createdAt)}</td>
                              <td>{timeAgo(u.lastSignInAt, t)}</td>
                              <td>{u.recordCount.toLocaleString()}</td>
                              <td>{u.banned
                                ? <span className="badge badge-red">{t('adminDashboard.banned')}</span>
                                : <span className={`badge ${ACCOUNT_BADGE[u.accountStatus] || 'badge-gray'}`}>{t(`account.status.${u.accountStatus || 'none'}`)}</span>}</td>
                              <td>
                                <div className="table-actions">
                                  {/* Pending rows keep to approve / reject here; Account Requests offers hold too. */}
                                  {!isSelf && canBan && u.role === 'user' && accountActions(u).filter((a) => !(u.accountStatus === 'pending' && a.status === 'on_hold')).map((a) => (
                                    <button key={a.key} className={`btn-icon${a.status === 'rejected' ? ' danger' : ''}`} title={t(`adminDashboard.${a.key}`)} disabled={rowBusy} onClick={() => openAccountAction(u, a)}>
                                      <i className={`fas ${a.icon}`}></i>
                                    </button>
                                  ))}
                                  {!isSelf && canBan && (
                                    <button className="btn-icon" title={u.banned ? t('adminDashboard.unban') : t('adminDashboard.ban')} disabled={rowBusy} onClick={() => setBanTarget(u)}>
                                      <i className={`fas ${u.banned ? 'fa-unlock' : 'fa-ban'}`}></i>
                                    </button>
                                  )}
                                  {!isSelf && canBan && (
                                    <button className="btn-icon danger" title={t('adminDashboard.deleteAccountTooltip')} disabled={rowBusy} onClick={() => { setDeleteTarget(u); setDeleteConfirmText(''); }}>
                                      <i className="fas fa-trash"></i>
                                    </button>
                                  )}
                                  {(isSelf || !canBan) && <span className="text-muted" style={{ fontSize: 12 }}>—</span>}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'admins' && (
            <div className="admin-fade-in">
              <div className="card mb-24">
                <div className="card-header"><h3><i className="fas fa-user-plus" style={{ color: 'var(--primary)', marginRight: 6 }}></i> {t('adminDashboard.grantAdminAccess')}</h3></div>
                <div className="card-body">
                  <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
                    {isSuperAdmin ? t('adminDashboard.grantAdminDescSuper') : t('adminDashboard.grantAdminDescAdmin')}
                  </p>
                  <div className="filter-bar" style={{ marginBottom: 0 }}>
                    <select className="form-control" style={{ minWidth: 280 }} value={grantUserId} onChange={(e) => setGrantUserId(e.target.value)}>
                      <option value="">{t('adminDashboard.selectUserToPromote')}</option>
                      {promotableUsers.map((u) => <option key={u.id} value={u.id}>{u.email}{u.farmName ? ` (${u.farmName})` : ''}</option>)}
                    </select>
                    <button className="btn btn-primary" disabled={!grantUserId} onClick={grantAdmin}>
                      <i className="fas fa-shield"></i> {t('adminDashboard.grantAdmin')}
                    </button>
                  </div>
                  {promotableUsers.length === 0 && <p className="text-muted mt-16" style={{ fontSize: 13 }}>{t('adminDashboard.allUsersElevated')}</p>}
                </div>
              </div>

              <div className="card">
                <div className="card-header"><h3><i className="fas fa-user-shield" style={{ color: 'var(--purple)', marginRight: 6 }}></i> {t('adminDashboard.currentAdmins')}</h3><span className="badge badge-green">{admins.length}</span></div>
                <div className="card-body" style={{ padding: 0 }}>
                  {admins.length === 0 ? (
                    <div className="empty-state"><i className="fas fa-user-shield"></i><h3>{t('adminDashboard.noAdminsYet')}</h3><p>{t('adminDashboard.grantAccessAbove')}</p></div>
                  ) : (
                    <div className="table-wrapper"><table className="data-table">
                      <thead><tr><th>{t('adminDashboard.colUser')}</th><th>{t('adminDashboard.colRole')}</th><th>{t('adminDashboard.colJoined')}</th><th>{t('adminDashboard.colActions')}</th></tr></thead>
                      <tbody>{admins.map((u) => {
                        const isSelf = u.id === currentUser?.id;
                        const rowBusy = busyId === u.id;
                        const canEdit = isSuperAdmin && !isSelf;
                        return (
                          <tr key={u.id}>
                            <td className="fw-600">{u.email}{isSelf && <span className="badge badge-blue" style={{ marginLeft: 6 }}>{t('adminDashboard.you')}</span>}</td>
                            <td>
                              {canEdit ? (
                                <select className="form-control" style={{ padding: '4px 8px', fontSize: 12, minWidth: 130 }} value={u.role} disabled={rowBusy} onChange={(e) => changeRole(u.id, e.target.value)}>
                                  <option value="admin">{t('adminDashboard.roleAdmin')}</option>
                                  <option value="super_admin">{t('adminDashboard.roleSuperAdmin')}</option>
                                  <option value="user">{t('adminDashboard.removeAccess')}</option>
                                </select>
                              ) : (
                                <span className={`badge ${ROLE_BADGE[u.role]}`}>{t(ROLE_LABEL_KEY[u.role])}</span>
                              )}
                            </td>
                            <td>{fmtDateTime(u.createdAt)}</td>
                            <td>{canEdit ? <span className="text-muted" style={{ fontSize: 12 }}>{t('adminDashboard.changeRoleViaDropdown')}</span> : <span className="text-muted" style={{ fontSize: 12 }}>—</span>}</td>
                          </tr>
                        );
                      })}</tbody>
                    </table></div>
                  )}
                  {!isSuperAdmin && <p className="text-muted" style={{ fontSize: 12, padding: '12px 20px 16px' }}><i className="fas fa-lock"></i> {t('adminDashboard.onlySuperAdminNote')}</p>}
                </div>
              </div>
            </div>
          )}

          {tab === 'map' && (
            <div className="admin-fade-in">
              <SpatialMap />
            </div>
          )}
        </>
      )}

      <Modal
        open={!!banTarget} onClose={() => setBanTarget(null)} title={banTarget?.banned ? t('adminDashboard.unbanUserTitle') : t('adminDashboard.banUserTitle')} maxWidth={420}
        footer={<>
          <button className="btn btn-secondary" onClick={() => setBanTarget(null)}>{t('common.cancel')}</button>
          <button className={`btn ${banTarget?.banned ? 'btn-primary' : 'btn-danger'}`} onClick={() => toggleBan(banTarget)}>
            <i className={`fas ${banTarget?.banned ? 'fa-user-check' : 'fa-user-slash'}`}></i> {banTarget?.banned ? t('adminDashboard.unban') : t('adminDashboard.ban')}
          </button>
        </>}
      >
        <p className="text-muted">
          {banTarget?.banned
            ? t('adminDashboard.restoreAccessConfirm', { email: banTarget?.email })
            : t('adminDashboard.blockSignInConfirm', { email: banTarget?.email })}
        </p>
      </Modal>

      <Modal
        open={!!accountTarget} onClose={() => setAccountTarget(null)} title={accountTarget ? t(`adminDashboard.${accountTarget.key}AccountTitle`) : ''} maxWidth={440}
        footer={<>
          <button className="btn btn-secondary" onClick={() => setAccountTarget(null)}>{t('common.cancel')}</button>
          <button className={`btn ${accountTarget?.btn === 'btn-danger' ? 'btn-danger' : 'btn-primary'}`} disabled={busyId === accountTarget?.user.id} onClick={applyAccountAction}>
            <i className={`fas ${accountTarget?.icon}`}></i> {accountTarget ? t(`adminDashboard.${accountTarget.key}`) : ''}
          </button>
        </>}
      >
        <p className="text-muted">{accountTarget ? t(`adminDashboard.${accountTarget.key}AccountConfirm`, { email: accountTarget.user.email }) : ''}</p>
        {accountTarget && accountTarget.status !== 'approved' && (
          <div className="form-group mt-16" style={{ marginBottom: 0 }}>
            <label>{t('adminDashboard.reviewNoteLabel')}</label>
            <textarea className="form-control" rows={3} placeholder={t('adminDashboard.reviewNotePlaceholder')} value={accountNote} onChange={(e) => setAccountNote(e.target.value)}></textarea>
          </div>
        )}
      </Modal>

      <Modal
        open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title={t('adminDashboard.deleteUserAccountTitle')} maxWidth={440}
        footer={<><button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>{t('common.cancel')}</button><button className="btn btn-danger" onClick={doDelete}><i className="fas fa-trash"></i> {t('settings.deleteForever')}</button></>}
      >
        <p className="text-muted">
          {t('adminDashboard.deleteUserConfirmText', { email: deleteTarget?.email, count: deleteTarget?.recordCount ?? 0 })}
        </p>
        <input type="text" className="form-control mt-16" placeholder={t('settings.typeDeleteHere')} value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} />
      </Modal>
    </>
  );
}

function ResourceChart({ byCollection }) {
  const { t } = useTranslation();
  const entries = Object.entries(byCollection);
  const canvasRef = useCanvasChart(() => ({
    type: 'bar',
    data: {
      labels: entries.map(([key]) => (RESOURCE_LABELS[key] ? t(RESOURCE_LABELS[key].labelKey) : key)),
      datasets: [{ data: entries.map(([, v]) => v), backgroundColor: entries.map(([key]) => RESOURCE_LABELS[key]?.color || '#546E7A'), borderRadius: 6 }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: { beginAtZero: true, grid: { color: '#F0F0F0' }, ticks: { font: { size: 11 } } }, y: { grid: { display: false }, ticks: { font: { size: 11 } } } },
      plugins: { legend: { display: false } }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [JSON.stringify(byCollection), t]);
  return <div className="chart-container"><canvas ref={canvasRef}></canvas></div>;
}

function RoleChart({ users }) {
  const { t } = useTranslation();
  const superAdmins = users.filter((u) => u.role === 'super_admin').length;
  const admins = users.filter((u) => u.role === 'admin').length;
  const plain = users.filter((u) => u.role === 'user').length;
  const total = superAdmins + admins + plain;

  const canvasRef = useCanvasChart(() => {
    if (total === 0) return null;
    return {
      type: 'doughnut',
      data: { labels: [t('adminDashboard.tabUsers'), t('adminDashboard.roleAdmin') + 's', t('adminDashboard.roleSuperAdmin') + 's'], datasets: [{ data: [plain, admins, superAdmins], backgroundColor: ['#90A4AE', '#1976D2', '#7B1FA2'], borderWidth: 0, spacing: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, pointStyleWidth: 10, font: { size: 12 } } } } }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plain, admins, superAdmins, t]);

  if (total === 0) return <div className="empty-state" style={{ padding: '30px 10px' }}><i className="fas fa-chart-pie"></i><h3>{t('adminDashboard.noUsersYet')}</h3></div>;
  return <div className="chart-container"><canvas ref={canvasRef}></canvas></div>;
}

const HEALTH_COLORS = { Healthy: '#2E7D32', 'Under Treatment': '#F9A825', Critical: '#D32F2F', Deceased: '#424242', Unspecified: '#90A4AE' };

function HealthBreakdownChart({ breakdown }) {
  const { t } = useTranslation();
  const entries = Object.entries(breakdown || {});
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const canvasRef = useCanvasChart(() => {
    if (total === 0) return null;
    return {
      type: 'doughnut',
      data: { labels: entries.map(([k]) => t(`enums.animalHealthStatus.${k}`, k)), datasets: [{ data: entries.map(([, v]) => v), backgroundColor: entries.map(([k]) => HEALTH_COLORS[k] || '#90A4AE'), borderWidth: 0, spacing: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom', labels: { padding: 12, usePointStyle: true, pointStyleWidth: 10, font: { size: 11 } } } } }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(breakdown), t]);

  if (total === 0) return <div className="empty-state" style={{ padding: '30px 10px' }}><i className="fas fa-heart-pulse"></i><h3>{t('dashboardPage.chartNoAnimalData')}</h3></div>;
  return <div className="chart-container"><canvas ref={canvasRef}></canvas></div>;
}

const SPECIES_COLORS = ['#2E7D32', '#F9A825', '#1976D2', '#7B1FA2', '#0097A7', '#D32F2F', '#5D4037', '#EF6C00', '#455A64'];

function SpeciesChart({ breakdown }) {
  const { t } = useTranslation();
  const entries = Object.entries(breakdown || {});
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const canvasRef = useCanvasChart(() => {
    if (total === 0) return null;
    return {
      type: 'bar',
      data: { labels: entries.map(([k]) => t(`enums.species.${k}`, k)), datasets: [{ data: entries.map(([, v]) => v), backgroundColor: entries.map((_, i) => SPECIES_COLORS[i % SPECIES_COLORS.length]), borderRadius: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: { color: '#F0F0F0' }, ticks: { font: { size: 11 } } }, x: { grid: { display: false }, ticks: { font: { size: 11 } } } }, plugins: { legend: { display: false } } }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(breakdown), t]);

  if (total === 0) return <div className="empty-state" style={{ padding: '30px 10px' }}><i className="fas fa-paw"></i><h3>{t('dashboardPage.chartNoAnimalData')}</h3></div>;
  return <div className="chart-container"><canvas ref={canvasRef}></canvas></div>;
}

const TASK_COLORS = { Pending: '#F9A825', 'In Progress': '#1976D2', Completed: '#2E7D32', Unspecified: '#90A4AE' };

function TaskBreakdownChart({ breakdown }) {
  const { t } = useTranslation();
  const entries = Object.entries(breakdown || {});
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const canvasRef = useCanvasChart(() => {
    if (total === 0) return null;
    return {
      type: 'doughnut',
      data: { labels: entries.map(([k]) => t(`enums.taskStatus.${k}`, k)), datasets: [{ data: entries.map(([, v]) => v), backgroundColor: entries.map(([k]) => TASK_COLORS[k] || '#90A4AE'), borderWidth: 0, spacing: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom', labels: { padding: 12, usePointStyle: true, pointStyleWidth: 10, font: { size: 11 } } } } }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(breakdown), t]);

  if (total === 0) return <div className="empty-state" style={{ padding: '30px 10px' }}><i className="fas fa-list-check"></i><h3>{t('dashboardPage.chartNoTasksYet')}</h3></div>;
  return <div className="chart-container"><canvas ref={canvasRef}></canvas></div>;
}

function SignupTrendChart({ buckets }) {
  const { t } = useTranslation();
  const hasData = buckets.some((b) => b.count > 0);
  const canvasRef = useCanvasChart(() => {
    if (!hasData) return null;
    return {
      type: 'line',
      data: { labels: buckets.map((b) => b.label), datasets: [{ label: t('adminDashboard.newUsers7d'), data: buckets.map((b) => b.count), borderColor: '#2E7D32', backgroundColor: 'rgba(46,125,50,0.1)', fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: '#2E7D32' }] },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } }, grid: { color: '#F0F0F0' } }, x: { grid: { display: false }, ticks: { font: { size: 10 } } } }, plugins: { legend: { display: false } } }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(buckets.map((b) => b.count)), t]);

  if (!hasData) return <div className="empty-state" style={{ padding: '30px 10px' }}><i className="fas fa-arrow-trend-up"></i><h3>{t('adminDashboard.signupTrend')}</h3></div>;
  return <div className="chart-container"><canvas ref={canvasRef}></canvas></div>;
}
