import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';
import { useOrgData } from '../../lib/org.jsx';
import { Chart } from '../FarmAnalytics.jsx';
import { cartesianOptions, barDataset } from '../../lib/chartTheme.js';

/* Admin dashboard, AI tab: the model LivestockPro AI runs on, the rate
   limits, and a monitor of AI use and refused requests. Admins can look;
   only super admins change settings. Models appear by tier and version
   only (server/lib/aiSettings.js). */

const LIMIT_FIELDS = ['per_minute', 'per_hour', 'total', 'diagnose', 'advisor', 'chat', 'brief', 'admin_multiplier'];
const KIND_ICON = { diagnose: 'fa-stethoscope', advisor: 'fa-lightbulb', chat: 'fa-comments', brief: 'fa-shield-virus' };

function Stat({ icon, color, label, value, hint }) {
  return (
    <div className="summary-card">
      <div className={`summary-icon ${color}`}><i className={`fas ${icon}`}></i></div>
      <div className="summary-info"><h4>{value}</h4><p>{label}</p>{hint ? <small className="ai-muted">{hint}</small> : null}</div>
    </div>
  );
}

export default function AdminAi({ isSuper }) {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const showToast = useToast();
  const s = useOrgData(api, '/admin/ai');
  const [model, setModel] = useState('');
  const [limits, setLimits] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!s.data) return;
    setModel(s.data.model ? s.data.model.key : '');
    setLimits(Object.fromEntries(LIMIT_FIELDS.map((k) => [k, String(s.data.limits[k])])));
  }, [s.data]);

  if (s.error) return <div className="card"><div className="card-body text-muted">{s.error.message}</div></div>;
  if (!s.data) return <div className="card"><div className="card-body text-muted"><i className="fas fa-spinner fa-spin"></i> {t('common.loading')}</div></div>;

  const d = s.data;
  const u = d.usage;
  const n = (v) => Number(v || 0).toLocaleString(i18n.language);
  const dirty = (d.model && model !== d.model.key) || LIMIT_FIELDS.some((k) => String(d.limits[k]) !== limits[k]);

  async function save() {
    setSaving(true);
    const body = { limits: Object.fromEntries(LIMIT_FIELDS.map((k) => [k, Number(limits[k])])) };
    if (!d.model || model !== d.model.key) body.model = model;
    const { error } = await api.http('PATCH', '/admin/ai', body);
    setSaving(false);
    if (error) { showToast(error.message, 'error'); return; }
    showToast(t('aiAdmin.saved'), 'success');
    s.reload();
  }

  const days = u.days;
  const dayLabel = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', timeZone: 'UTC' });

  return (
    <div className="admin-fade-in ai-admin">
      <div className="summary-grid">
        <Stat icon="fa-robot" color={d.configured ? 'green' : 'red'} label={t('aiAdmin.status')} value={d.configured ? t('aiAdmin.on') : t('aiAdmin.off')} hint={d.model ? d.model.label : null} />
        <Stat icon="fa-paper-plane" color="green" label={t('aiAdmin.requestsToday')} value={n(u.today.requests)} hint={t('aiAdmin.okFailed', { ok: n(u.today.ok), failed: n(u.today.failed) })} />
        <Stat icon="fa-hand" color={u.today.refused ? 'orange' : 'green'} label={t('aiAdmin.refusedToday')} value={n(u.today.refused)} />
        <Stat icon="fa-users" color="green" label={t('aiAdmin.usersToday')} value={n(u.today.active_users)} />
        <Stat icon="fa-coins" color="green" label={t('aiAdmin.tokensToday')} value={n(u.today.input_tokens + u.today.output_tokens)} hint={t('aiAdmin.tokensSplit', { input: n(u.today.input_tokens), output: n(u.today.output_tokens) })} />
        <Stat icon="fa-stopwatch" color="green" label={t('aiAdmin.avgTime')} value={t('aiAdmin.seconds', { n: u.today.avg_seconds })} />
      </div>

      <div className="charts-grid ai-admin-grid">
        <div className="card">
          <div className="card-header"><h3><i className="fas fa-sliders"></i> {t('aiAdmin.settingsTitle')}</h3></div>
          <div className="card-body">
            {!d.configured ? <p className="hp-note">{t('aiAdmin.notConfigured')}</p> : null}
            <fieldset disabled={!isSuper || saving} style={{ border: 0, padding: 0, margin: 0 }}>
              <div className="form-group">
                <label>{t('aiAdmin.model')}</label>
                <select className="form-control" value={model} onChange={(e) => setModel(e.target.value)}>
                  {d.model && !d.models.some((m) => m.key === d.model.key) ? <option value={d.model.key}>{d.model.label}</option> : null}
                  {d.models.map((m) => <option key={m.key} value={m.key}>{m.label} · {t(`aiAdmin.tier.${m.tier}`)}</option>)}
                </select>
                <small className="ai-muted">{d.models_error || t('aiAdmin.modelHint')}</small>
              </div>
              <div className="ai-limit-grid">
                {LIMIT_FIELDS.map((k) => (
                  <div className="form-group" key={k}>
                    <label>{t(`aiAdmin.limit.${k}`)}</label>
                    <input type="number" min={k === 'admin_multiplier' ? 1 : 0} max={d.limit_max[k]} step="1" className="form-control" value={limits[k] ?? ''} onChange={(e) => setLimits((l) => ({ ...l, [k]: e.target.value }))} />
                    <small className="ai-muted">{t('aiAdmin.defaultValue', { n: d.defaults[k] })}</small>
                  </div>
                ))}
              </div>
            </fieldset>
            {isSuper ? (
              <button className="btn btn-primary" onClick={save} disabled={!dirty || saving}>
                {saving ? <><i className="fas fa-spinner fa-spin"></i> {t('aiAdmin.testing')}</> : <><i className="fas fa-floppy-disk"></i> {t('common.save')}</>}
              </button>
            ) : <p className="hp-note">{t('org.admin.superOnly')}</p>}
            {d.updated_at ? <p className="ai-muted" style={{ marginTop: 10 }}>{t('aiAdmin.updatedAt', { date: new Date(d.updated_at).toLocaleString(i18n.language) })}</p> : null}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3><i className="fas fa-chart-column"></i> {t('aiAdmin.last14')}</h3></div>
          <div className="card-body">
            <Chart
              depKey={JSON.stringify(days)}
              height={300}
              build={(ct) => ({
                type: 'bar',
                data: {
                  labels: days.map((x) => dayLabel(x.day)),
                  datasets: [
                    barDataset(ct, t('aiAdmin.answered'), days.map((x) => x.ok), ct.series[0], { stacked: true }),
                    barDataset(ct, t('aiAdmin.failed'), days.map((x) => x.failed), ct.status.critical, { stacked: true }),
                    barDataset(ct, t('aiAdmin.refused'), days.map((x) => x.refused), ct.series[1], { stacked: true })
                  ]
                },
                options: cartesianOptions(ct, { stacked: true, legend: true, integer: true })
              })}
            />
          </div>
        </div>
      </div>

      <div className="charts-grid ai-admin-grid">
        <div className="card">
          <div className="card-header"><h3><i className="fas fa-layer-group"></i> {t('aiAdmin.byFeature')}</h3></div>
          <div className="card-body" style={{ padding: 0 }}>
            {u.by_kind.length === 0 ? <div className="empty-state" style={{ padding: 24 }}><p>{t('aiAdmin.noUseToday')}</p></div> : (
              <div className="table-wrapper"><table className="data-table">
                <thead><tr><th>{t('aiAdmin.feature')}</th><th>{t('aiAdmin.answered')}</th><th>{t('aiAdmin.failed')}</th><th>{t('aiAdmin.refused')}</th><th>{t('aiAdmin.tokens')}</th></tr></thead>
                <tbody>{u.by_kind.map((k) => (
                  <tr key={k.kind}><td><i className={`fas ${KIND_ICON[k.kind] || 'fa-robot'}`} style={{ color: 'var(--primary)', marginRight: 6 }}></i>{t(`aiAdmin.kind.${k.kind}`, { defaultValue: k.kind })}</td><td>{n(k.ok)}</td><td>{n(k.failed)}</td><td>{n(k.refused)}</td><td>{n(k.input_tokens + k.output_tokens)}</td></tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3><i className="fas fa-hand"></i> {t('aiAdmin.refusals')}</h3></div>
          <div className="card-body" style={{ padding: 0 }}>
            {u.refusals.length === 0 ? <div className="empty-state" style={{ padding: 24 }}><p>{t('aiAdmin.noRefusals')}</p></div> : (
              <div className="table-wrapper"><table className="data-table">
                <thead><tr><th>{t('aiAdmin.reason')}</th><th>{t('aiAdmin.requests')}</th><th>{t('aiAdmin.users')}</th></tr></thead>
                <tbody>{u.refusals.map((r) => (
                  <tr key={r.code}><td>{t(`aiAdmin.refusal.${r.code}`, { defaultValue: r.code })}</td><td>{n(r.count)}</td><td>{n(r.users)}</td></tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
        </div>
      </div>

      <div className="card mb-24">
        <div className="card-header"><h3><i className="fas fa-ranking-star"></i> {t('aiAdmin.topUsers')}</h3></div>
        <div className="card-body" style={{ padding: 0 }}>
          {u.top_users.length === 0 ? <div className="empty-state" style={{ padding: 24 }}><p>{t('aiAdmin.noUseToday')}</p></div> : (
            <div className="table-wrapper"><table className="data-table">
              <thead><tr><th>{t('aiAdmin.user')}</th><th>{t('settings.livestockId')}</th><th>{t('aiAdmin.requests')}</th><th>{t('aiAdmin.refused')}</th><th>{t('aiAdmin.tokens')}</th></tr></thead>
              <tbody>{u.top_users.map((x) => (
                <tr key={x.user_id}><td><strong>{x.name || x.email || '—'}</strong>{x.name && x.email ? <div className="ai-muted">{x.email}</div> : null}</td><td>{x.public_id || '—'}</td><td>{n(x.requests)}</td><td>{n(x.refused)}</td><td>{n(x.input_tokens + x.output_tokens)}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      </div>

      {u.by_model.length > 0 ? (
        <div className="card mb-24">
          <div className="card-header"><h3><i className="fas fa-microchip"></i> {t('aiAdmin.byModel')}</h3></div>
          <div className="card-body" style={{ padding: 0 }}>
            <div className="table-wrapper"><table className="data-table">
              <thead><tr><th>{t('aiAdmin.model')}</th><th>{t('aiAdmin.answered')}</th><th>{t('aiAdmin.failed')}</th><th>{t('aiAdmin.tokens')}</th><th>{t('aiAdmin.avgTime')}</th></tr></thead>
              <tbody>{u.by_model.map((m) => (
                <tr key={m.model}><td>{m.model}</td><td>{n(m.ok)}</td><td>{n(m.failed)}</td><td>{n(m.input_tokens + m.output_tokens)}</td><td>{t('aiAdmin.seconds', { n: m.avg_seconds })}</td></tr>
              ))}</tbody>
            </table></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
