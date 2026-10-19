import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useApi } from '../../lib/api.js';
import { useOrgData, useOrgMember } from '../../lib/org.jsx';
import { barDataset, cartesianOptions, doughnutOptions, lineDataset } from '../../lib/chartTheme.js';
import { Chart, ChartCard } from '../../components/FarmAnalytics.jsx';
import CardGrid from '../../components/CardGrid.jsx';
import { ORG_STATUS_TONE, ORG_TYPE_ICONS } from '../../../../shared/org';

/* Organization dashboard (livestock only): a summary of what is happening
   on the farms of the organization's farmers, filterable by month range and
   location. Every headline figure opens the farmers behind it. Built from
   farmer summaries the server refreshes every hour and whenever a farmer
   joins; only farmers with an active link are ever included. */

const monthLabel = (key, lang) => new Date(`${key}-01T00:00:00`).toLocaleString(lang, { month: 'short', year: '2-digit' });

export function UsageMeter({ used, limit }) {
  const { t } = useTranslation();
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const tone = pct >= 100 ? 'red' : pct >= 80 ? 'amber' : 'leaf';
  return (
    <div className="org-usage">
      <div className="org-usage-text"><strong>{t('org.usage.of', { used: used.toLocaleString(), limit: limit.toLocaleString() })}</strong><span>{t('org.usage.farmers')}</span></div>
      <span className="ai-usage-bar"><span className={tone} style={{ width: `${pct}%` }} /></span>
      {pct >= 80 ? <small className={pct >= 100 ? 'org-usage-warn red' : 'org-usage-warn'}>{pct >= 100 ? t('org.usage.full') : t('org.usage.nearly')}</small> : null}
    </div>
  );
}

export function OrgHeader({ org, children }) {
  const { t } = useTranslation();
  return (
    <div className="org-banner">
      {org.logo ? <img className="org-banner-logo" src={org.logo} alt="" /> : <span className="org-banner-mark"><i className={`fas fa-${ORG_TYPE_ICONS[org.type] || 'building'}`}></i></span>}
      <div className="org-banner-text">
        <div className="org-banner-eyebrow">{t(`org.types.${org.type}`)}{org.district ? ` · ${org.district}` : ''}</div>
        <h2>{org.name}</h2>
        <span className={`badge badge-${ORG_STATUS_TONE[org.status] || 'gray'}`}>{t(`org.status.${org.status}`)}</span>
      </div>
      <div className="org-banner-side">{children}</div>
    </div>
  );
}

function Kpi({ icon, tone = 'leaf', label, value, sub, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} className={`org-kpi${onClick ? ' clickable' : ''}`} onClick={onClick}>
      <span className={`org-kpi-icon ${tone}`}><i className={`fas fa-${icon}`}></i></span>
      <span className="org-kpi-label">{label}</span>
      <strong className="org-kpi-value">{value}</strong>
      {sub ? <small className="org-kpi-sub">{sub}</small> : null}
      {onClick ? <i className="fas fa-chevron-right org-kpi-go"></i> : null}
    </Tag>
  );
}

export default function OrgDashboard() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const { orgId } = useOrgMember();
  const [draft, setDraft] = useState({ from: '', to: '', district: '', sector: '', cell: '' });
  const [filters, setFilters] = useState({});
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  const org = useOrgData(api, orgId ? `/organizations/${orgId}` : null);
  const dash = useOrgData(api, orgId ? `/organizations/${orgId}/dashboard${qs ? `?${qs}` : ''}` : null);
  const farmers = useOrgData(api, orgId ? `/organizations/${orgId}/farmers` : null);

  const places = useMemo(() => {
    const list = farmers.data || [];
    const uniq = (k, pred = () => true) => [...new Set(list.filter(pred).map((f) => f[k]).filter(Boolean))].sort();
    return {
      districts: uniq('district'),
      sectors: uniq('sector', (f) => !draft.district || f.district === draft.district),
      cells: uniq('cell', (f) => (!draft.district || f.district === draft.district) && (!draft.sector || f.sector === draft.sector))
    };
  }, [farmers.data, draft.district, draft.sector]);

  const drill = (ids, label) => navigate(`/organization/farmers?ids=${ids.join(',')}&label=${encodeURIComponent(label)}`);

  if (!org.data || !dash.data) {
    return <div className="empty-state" style={{ padding: 60 }}><i className="fas fa-spinner fa-spin"></i></div>;
  }
  const o = org.data;
  const d = dash.data;
  const labels = d.months.map((m) => monthLabel(m, i18n.language));
  const sp = (s) => t(`enums.species.${s}`, { defaultValue: s });
  const statusKeys = ['Healthy', 'Under Treatment', 'Critical'];
  const set = (k) => (e) => setDraft((f) => ({ ...f, [k]: e.target.value, ...(k === 'district' ? { sector: '', cell: '' } : k === 'sector' ? { cell: '' } : {}) }));

  return (
    <div className="org-page">
      <OrgHeader org={o}><UsageMeter used={o.usage.used} limit={o.usage.limit} /></OrgHeader>

      <div className="card org-filters">
        <div className="org-filter"><label>{t('org.filters.from')}</label><input type="month" className="form-control" value={draft.from} onChange={set('from')} /></div>
        <div className="org-filter"><label>{t('org.filters.to')}</label><input type="month" className="form-control" value={draft.to} onChange={set('to')} /></div>
        <div className="org-filter"><label>{t('org.fields.district')}</label>
          <select className="form-control" value={draft.district} onChange={set('district')}><option value="">{t('org.filters.all')}</option>{places.districts.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div className="org-filter"><label>{t('org.fields.sector')}</label>
          <select className="form-control" value={draft.sector} onChange={set('sector')}><option value="">{t('org.filters.all')}</option>{places.sectors.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div className="org-filter"><label>{t('org.fields.cell')}</label>
          <select className="form-control" value={draft.cell} onChange={set('cell')}><option value="">{t('org.filters.all')}</option>{places.cells.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div className="org-filter-actions">
          <button className="btn btn-primary btn-sm" onClick={() => setFilters(draft)}><i className="fas fa-filter"></i> {t('org.filters.apply')}</button>
          {qs ? <button className="btn btn-secondary btn-sm" onClick={() => { setDraft({ from: '', to: '', district: '', sector: '', cell: '' }); setFilters({}); }}>{t('common.clearFilters')}</button> : null}
        </div>
      </div>

      <div className="herd-profile-section">{t('org.dash.overview')}</div>
      <div className="org-kpis">
        <Kpi icon="users" label={t('org.dash.farmers')} value={d.overview.farmers} onClick={() => navigate('/organization/farmers')} />
        <Kpi icon="user-plus" label={t('org.dash.newThisMonth')} value={d.overview.new_this_month.length} onClick={() => drill(d.overview.new_this_month, t('org.dash.newThisMonth'))} />
        <Kpi icon="bolt" label={t('org.dash.active30')} value={d.overview.active_30d.length} sub={t('org.dash.activeSub')} onClick={() => drill(d.overview.active_30d, t('org.dash.active30'))} />
        <Kpi icon="cow" label={t('org.dash.animals')} value={d.herd.animals.toLocaleString()} sub={t('org.dash.pregnant', { count: d.herd.pregnant })} />
        <Kpi icon="stethoscope" tone="amber" label={t('org.dash.openCases')} value={d.health.open_cases} />
      </div>

      <div className="herd-profile-section">{t('org.dash.alerts')}</div>
      <div className="org-kpis">
        <Kpi icon="moon" tone="slate" label={t('org.dash.inactive')} value={d.alerts.inactive.length} sub={t('org.dash.inactiveSub')} onClick={() => drill(d.alerts.inactive, t('org.dash.inactive'))} />
        <Kpi icon="triangle-exclamation" tone="red" label={t('org.dash.critical')} value={d.alerts.critical.length} onClick={() => drill(d.alerts.critical, t('org.dash.critical'))} />
        <Kpi icon="virus" tone="amber" label={t('org.dash.diseaseReports')} value={d.alerts.disease_reports.length} sub={t('org.dash.last30')} onClick={() => drill(d.alerts.disease_reports, t('org.dash.diseaseReports'))} />
        <Kpi icon="clock" tone="red" label={t('org.dash.overdue')} value={d.alerts.overdue_tasks.length} onClick={() => drill(d.alerts.overdue_tasks, t('org.dash.overdue'))} />
      </div>

      <CardGrid>
        <ChartCard title={t('org.dash.herdBySpecies')} icon="fa-layer-group" empty={!d.herd.by_species.length}>
          <Chart height={Math.max(180, d.herd.by_species.length * 34 + 50)} depKey={JSON.stringify(d.herd.by_species)} build={(ct) => ({
            type: 'bar',
            data: { labels: d.herd.by_species.map((s) => sp(s.species)), datasets: [barDataset(ct, t('analytics.animalsLabel'), d.herd.by_species.map((s) => s.count), ct.brand)] },
            options: cartesianOptions(ct, { horizontal: true, integer: true })
          })} />
        </ChartCard>
        <ChartCard title={t('org.dash.herdHealth')} icon="fa-heart-pulse" empty={!d.herd.animals}>
          <Chart height={240} depKey={JSON.stringify(d.herd.by_status)} build={(ct) => ({
            type: 'doughnut',
            data: { labels: statusKeys.map((k) => t(`enums.animalHealthStatus.${k}`)), datasets: [{ data: statusKeys.map((k) => d.herd.by_status[k] || 0), backgroundColor: ['#1B5E20', '#F9A825', '#C62828'], borderColor: ct.surface, borderWidth: 2 }] },
            options: doughnutOptions(ct)
          })} />
        </ChartCard>
        <ChartCard wide title={t('org.dash.healthEvents')} icon="fa-notes-medical" empty={!d.health.totals.events}>
          <Chart height={260} depKey={JSON.stringify([d.health, labels])} build={(ct) => ({
            type: 'bar',
            data: { labels, datasets: [barDataset(ct, t('org.dash.healthEventsShort'), d.health.events, ct.brand), barDataset(ct, t('org.dash.vaccinations'), d.health.vaccinations, '#F9A825'), barDataset(ct, t('org.dash.recovered'), d.health.recovered, '#5B6B5D')] },
            options: cartesianOptions(ct, { legend: true, integer: true })
          })} />
        </ChartCard>
        <ChartCard wide title={t('org.dash.births')} icon="fa-baby" empty={!d.breeding.totals.births}>
          <Chart height={240} depKey={JSON.stringify([d.breeding, labels])} build={(ct) => ({
            type: 'bar',
            data: { labels, datasets: [barDataset(ct, t('org.dash.newborns'), d.breeding.newborns, ct.brand)] },
            options: cartesianOptions(ct, { integer: true })
          })} />
        </ChartCard>
        <ChartCard wide title={t('org.dash.production')} icon="fa-bottle-droplet" empty={!d.production.totals.milk && !d.production.totals.eggs && !d.production.totals.meat}>
          <Chart height={260} depKey={JSON.stringify([d.production, labels])} build={(ct) => ({
            type: 'line',
            data: { labels, datasets: [lineDataset(t('enums.productionType.Milk', { defaultValue: 'Milk' }), d.production.milk, ct.brand), lineDataset(t('enums.productionType.Eggs', { defaultValue: 'Eggs' }), d.production.eggs, '#F9A825'), lineDataset(t('enums.productionType.Meat', { defaultValue: 'Meat' }), d.production.meat, '#B26A2E')] },
            options: cartesianOptions(ct, { legend: true })
          })} />
        </ChartCard>
        <ChartCard wide title={t('org.dash.activity')} icon="fa-chart-line" empty={!d.activity.records.some(Boolean)}>
          <Chart height={240} depKey={JSON.stringify([d.activity, labels])} build={(ct) => ({
            type: 'bar',
            data: { labels, datasets: [barDataset(ct, t('org.dash.recordsAdded'), d.activity.records, ct.brand), barDataset(ct, t('org.dash.animalsAdded'), d.activity.animals_added, '#F9A825')] },
            options: cartesianOptions(ct, { legend: true, integer: true })
          })} />
        </ChartCard>
      </CardGrid>

      <div className="org-two">
        <div className="card">
          <div className="card-header"><h3><i className="fas fa-location-dot"></i> {t('org.dash.byLocation')}</h3></div>
          <div className="card-body" style={{ padding: 0 }}>
            {d.locations.length ? (
              <table className="data-table">
                <thead><tr><th>{t('org.dash.location')}</th><th>{t('org.dash.farmers')}</th><th>{t('org.dash.animals')}</th></tr></thead>
                <tbody>{d.locations.map((l) => <tr key={l.label || 'none'}><td>{l.label || t('org.dash.noLocation')}</td><td>{l.farmers}</td><td>{l.animals}</td></tr>)}</tbody>
              </table>
            ) : <div className="empty-state"><h3>{t('analytics.noData')}</h3></div>}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h3><i className="fas fa-virus"></i> {t('org.dash.topDiseases')}</h3></div>
          <div className="card-body" style={{ padding: 0 }}>
            {d.health.diseases_30d.length ? (
              <table className="data-table">
                <thead><tr><th>{t('org.dash.condition')}</th><th>{t('org.dash.cases')}</th><th>{t('org.dash.farmers')}</th></tr></thead>
                <tbody>{d.health.diseases_30d.map((x) => <tr key={x.name}><td>{x.name}</td><td>{x.cases}</td><td>{x.farmers}</td></tr>)}</tbody>
              </table>
            ) : <div className="empty-state"><h3>{t('org.dash.noDiseases')}</h3></div>}
          </div>
        </div>
      </div>
      <p className="hp-note">{t('org.dash.updated', { time: d.stats_updated_at ? new Date(d.stats_updated_at).toLocaleString(i18n.language) : '—' })}</p>
    </div>
  );
}
