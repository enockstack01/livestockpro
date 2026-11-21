import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { useChartTheme } from '../lib/chartTheme.js';
import { lastActive, teamErrorText } from '../lib/team.js';
import { MiniColumns } from '../components/dashboard/MicroViz.jsx';
import Modal from '../components/Modal.jsx';
import { fmtDate } from '../lib/badges.jsx';
import { relativeDay } from '../../../shared/dashboardFeed';
import '../dashboard.css';

const EMPTY = { full_name: '', email: '', phone: '' };
const KIND_ICON = { animals: 'cow', health_records: 'stethoscope', breeding_records: 'venus-mars', feeding_records: 'wheat-awn', production_records: 'gauge', tasks: 'list-check' };
const KIND_LABEL = { animals: 'nav.animals', health_records: 'nav.health', breeding_records: 'nav.breeding', feeding_records: 'nav.feeding', production_records: 'nav.production', tasks: 'nav.tasks' };

/* The farm manager's team of data collectors: invite by email, see how much
   each one recorded, and what they entered most recently. A collector's
   entries land in this farm; they see no money, reports or assistant. */
export default function Team() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const showToast = useToast();
  const ct = useChartTheme();
  const [team, setTeam] = useState(null);
  const [activity, setActivity] = useState([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState(null);

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([api.http('GET', '/team'), api.http('GET', '/team/activity?limit=15')]);
    if (a.error) { showToast(teamErrorText(t, a.error), 'error'); return; }
    setTeam(a.data);
    setActivity(b.data || []);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function invite(e) {
    if (e) e.preventDefault();
    if (!form.full_name.trim() || !form.email.trim()) { setError(t('team.required')); return; }
    setBusy(true);
    setError('');
    const { error: err } = await api.http('POST', '/team/invites', form);
    setBusy(false);
    if (err) { setError(teamErrorText(t, err)); return; }
    showToast(t('team.invited', { email: form.email.trim() }), 'success');
    setForm(EMPTY);
    setInviteOpen(false);
    load();
  }

  async function cancelInvite(inv) {
    const { error: err } = await api.http('DELETE', `/team/invites/${inv.id}`);
    if (err) { showToast(teamErrorText(t, err), 'error'); return; }
    showToast(t('team.inviteCancelled', { email: inv.email }), 'success');
    load();
  }

  async function removeMember() {
    const m = removing;
    setRemoving(null);
    const { error: err } = await api.http('DELETE', `/team/members/${m.id}`);
    if (err) { showToast(teamErrorText(t, err), 'error'); return; }
    showToast(t('team.removed', { name: m.name || m.email }), 'success');
    load();
  }

  if (!team) return null;
  const total14 = team.perDay.reduce((s, d) => s + d.count, 0);
  const total7 = team.members.reduce((s, m) => s + m.week, 0);
  const full = team.members.length + team.invites.length >= team.limit;
  const dayLabel = (d) => new Date(d + 'T00:00:00').toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });

  return (
    <div className="team-page">
      <div className="page-header">
        <div><h1>{t('team.title')}</h1><p>{t('team.subtitle')}</p></div>
        <button className="btn btn-primary" disabled={full} onClick={() => { setError(''); setInviteOpen(true); }}><i className="fas fa-user-plus"></i> {t('team.addCollector')}</button>
      </div>

      <div className="team-stats">
        <div className="card team-stat"><span>{t('team.collectors')}</span><b>{team.members.length}</b></div>
        <div className="card team-stat"><span>{t('team.entriesWeek')}</span><b>{total7}</b></div>
        <div className="card team-stat"><span>{t('team.waiting')}</span><b>{team.invites.length}</b></div>
        <div className="card team-stat wide">
          <div className="activity-chart-head"><span>{t('team.entries14')}</span><b>{total14}</b></div>
          <MiniColumns values={team.perDay.map((d) => d.count)} color={ct.brand} labels={team.perDay.map((d) => dayLabel(d.date))} height={48} />
          <div className="glance-axis spread"><span>{dayLabel(team.perDay[0].date)}</span><span>{t('dashboardFeed.today')}</span></div>
        </div>
      </div>

      <div className="card mb-24">
        <div className="card-header"><h3><i className="fas fa-people-group"></i> {t('team.members')}</h3></div>
        <div className="card-body" style={{ padding: 0 }}>
          {team.members.length === 0 ? (
            <div className="feed-empty"><i className="fas fa-user-plus" />{t('team.empty')}</div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead><tr><th>{t('team.colName')}</th><th>{t('team.colContact')}</th><th>{t('team.colWeek')}</th><th>{t('team.colLast')}</th><th>{t('team.colJoined')}</th><th></th></tr></thead>
                <tbody>
                  {team.members.map((m) => (
                    <tr key={m.id}>
                      <td><span className="team-name"><span className="team-avatar">{(m.name || m.email || '?')[0].toUpperCase()}</span><b>{m.name || m.email}</b></span></td>
                      <td>{m.email}{m.phone ? <><br /><small className="text-muted">{m.phone}</small></> : null}</td>
                      <td><b>{m.week}</b>{Object.keys(m.byTable).length > 0 && <small className="text-muted"> · {Object.entries(m.byTable).map(([k, n]) => `${n} ${t(KIND_LABEL[k]).toLowerCase()}`).join(', ')}</small>}</td>
                      <td>{lastActive(m.last, t)}</td>
                      <td>{m.joined_at ? fmtDate(m.joined_at) : ''}</td>
                      <td><button className="btn-icon danger" title={t('team.remove')} onClick={() => setRemoving(m)}><i className="fas fa-user-minus"></i></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {team.invites.length > 0 && (
        <div className="card mb-24">
          <div className="card-header"><h3><i className="fas fa-envelope-open-text"></i> {t('team.waitingTitle', { count: team.invites.length })}</h3></div>
          <div className="card-body" style={{ padding: 0 }}>
            <div className="table-wrapper">
              <table className="data-table">
                <thead><tr><th>{t('team.colName')}</th><th>{t('team.colContact')}</th><th>{t('team.colInvited')}</th><th></th></tr></thead>
                <tbody>
                  {team.invites.map((i) => (
                    <tr key={i.id}>
                      <td><b>{i.name}</b></td>
                      <td>{i.email}</td>
                      <td>{fmtDate(i.invited_at)}</td>
                      <td><button className="btn btn-secondary btn-sm" onClick={() => cancelInvite(i)}>{t('common.cancel')}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="card feed-card">
        <div className="card-header"><h3><i className="fas fa-clock-rotate-left" style={{ color: 'var(--primary)', marginRight: 8 }} />{t('team.recent')}</h3></div>
        <div className="card-body">
          {activity.length === 0 ? <div className="feed-empty"><i className="fas fa-inbox" />{t('team.noActivity')}</div> : (
            <div className="feed-rows">
              {activity.map((a) => (
                <div key={a.table + a.id} className="feed-row">
                  <span className="feed-chip tone-green"><i className={`fas fa-${KIND_ICON[a.table]}`} /></span>
                  <span className="feed-row-main"><span className="feed-row-name">{a.label || t(KIND_LABEL[a.table])}</span><span className="feed-row-sub">{t(KIND_LABEL[a.table])} · {a.by}</span></span>
                  <span className="feed-row-end"><span className="feed-row-time">{relativeDay(a.at, t)}</span></span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title={t('team.inviteTitle')} maxWidth="520px"
        footer={<><button className="btn btn-secondary" onClick={() => setInviteOpen(false)}>{t('common.cancel')}</button><button className="btn btn-primary" onClick={invite} disabled={busy}><i className={`fas ${busy ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`}></i> {t('team.sendInvite')}</button></>}>
        <form onSubmit={invite} noValidate>
          <p className="text-muted" style={{ marginBottom: 12 }}>{t('team.inviteIntro')}</p>
          <div className="form-group"><label>{t('account.fullName')} *</label><input className="form-control" value={form.full_name} onChange={set('full_name')} /></div>
          <div className="form-row">
            <div className="form-group"><label>{t('team.email')} *</label><input type="email" className="form-control" value={form.email} onChange={set('email')} /></div>
            <div className="form-group"><label>{t('settings.phoneNumber')}</label><input type="tel" className="form-control" value={form.phone} onChange={set('phone')} /></div>
          </div>
          <p className="text-muted" style={{ fontSize: 13 }}>{t('team.inviteAfter')}</p>
          {error ? <div className="ai-notice ai-notice-error"><i className="fas fa-triangle-exclamation"></i><span>{error}</span></div> : null}
        </form>
      </Modal>

      <Modal open={Boolean(removing)} onClose={() => setRemoving(null)} title={t('team.removeTitle')} maxWidth={420}
        footer={<><button className="btn btn-secondary" onClick={() => setRemoving(null)}>{t('common.cancel')}</button><button className="btn btn-danger" onClick={removeMember}><i className="fas fa-user-minus"></i> {t('team.remove')}</button></>}>
        <p className="text-muted">{removing ? t('team.removeMessage', { name: removing.name || removing.email }) : ''}</p>
      </Modal>
    </div>
  );
}
