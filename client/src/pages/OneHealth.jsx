import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useApi } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { useCanvasChart } from '../lib/useChart.js';
import { fmtDate } from '../lib/badges.jsx';
import OneHealthMap from '../components/OneHealthMap.jsx';

const SEVERITY_BADGE = { critical: 'badge-red', high: 'badge-orange', medium: 'badge-blue', low: 'badge-gray' };
const SEVERITY_COLOR = { critical: '#D32F2F', high: '#F9A825', medium: '#1976D2', low: '#90A4AE' };
const TYPE_LABEL_KEY = { watchlist: 'oneHealth.watchlistDisease', mortality_cluster: 'oneHealth.mortalityCluster', critical_cluster: 'oneHealth.criticalCluster', outbreak_cluster: 'oneHealth.outbreakCluster' };
const TYPE_ICON = { watchlist: 'fa-skull-crossbones', mortality_cluster: 'fa-cross', critical_cluster: 'fa-heart-crack', outbreak_cluster: 'fa-diagram-project' };
const CONFIDENCE_BADGE = { confirmed: 'badge-red', suspected: 'badge-orange', reported: 'badge-gray' };
const CONFIDENCE_LABEL_KEY = { confirmed: 'oneHealth.confirmed', suspected: 'oneHealth.suspected', reported: 'oneHealth.reported' };

function StatCard({ icon, color, label, value }) {
  return (
    <div className="summary-card">
      <div className={`summary-icon ${color}`}><i className={`fas ${icon}`}></i></div>
      <div className="summary-info"><h4>{value}</h4><p>{label}</p></div>
    </div>
  );
}

function SeverityChart({ bySeverity }) {
  const { t } = useTranslation();
  const entries = [[t('enums.animalHealthStatus.Critical'), bySeverity?.critical || 0, SEVERITY_COLOR.critical], [t('enums.taskPriority.High'), bySeverity?.high || 0, SEVERITY_COLOR.high], [t('enums.taskPriority.Medium'), bySeverity?.medium || 0, SEVERITY_COLOR.medium], [t('enums.taskPriority.Low'), bySeverity?.low || 0, SEVERITY_COLOR.low]];
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const canvasRef = useCanvasChart(() => {
    if (total === 0) return null;
    return {
      type: 'doughnut',
      data: { labels: entries.map(([k]) => k), datasets: [{ data: entries.map(([, v]) => v), backgroundColor: entries.map(([, , c]) => c), borderWidth: 0, spacing: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, pointStyleWidth: 10, font: { size: 12 } } } } }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(bySeverity), t]);

  if (total === 0) return <div className="empty-state" style={{ padding: '30px 10px' }}><i className="fas fa-chart-pie"></i><h3>{t('oneHealth.noRiskSignals')}</h3></div>;
  return <div className="chart-container"><canvas ref={canvasRef}></canvas></div>;
}

function TypeChart({ alerts }) {
  const { t } = useTranslation();
  const counts = { watchlist: 0, mortality_cluster: 0, critical_cluster: 0, outbreak_cluster: 0 };
  alerts.forEach((a) => { if (counts[a.type] !== undefined) counts[a.type]++; });
  const entries = Object.entries(counts);
  const total = alerts.length;
  const canvasRef = useCanvasChart(() => {
    if (total === 0) return null;
    return {
      type: 'bar',
      data: { labels: entries.map(([k]) => t(TYPE_LABEL_KEY[k])), datasets: [{ data: entries.map(([, v]) => v), backgroundColor: ['#7B1FA2', '#424242', '#D32F2F', '#F9A825'], borderRadius: 6 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } }, grid: { color: '#F0F0F0' } }, y: { grid: { display: false }, ticks: { font: { size: 11 } } } }, plugins: { legend: { display: false } } }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(counts), t]);

  if (total === 0) return <div className="empty-state" style={{ padding: '30px 10px' }}><i className="fas fa-diagram-project"></i><h3>{t('oneHealth.noRiskSignals')}</h3></div>;
  return <div className="chart-container"><canvas ref={canvasRef}></canvas></div>;
}

export default function OneHealth() {
  const { t } = useTranslation();
  const { role } = useOutletContext();
  const navigate = useNavigate();
  const api = useApi();
  const showToast = useToast();

  const [alerts, setAlerts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [severityFilter, setSeverityFilter] = useState('');
  const [zoonoticOnly, setZoonoticOnly] = useState(false);
  const [showAbout, setShowAbout] = useState(true);

  useEffect(() => {
    if (role === 'user') navigate('/dashboard', { replace: true });
  }, [role, navigate]);

  async function load(isRefresh) {
    if (isRefresh) setRefreshing(true);
    const { data, error } = await api.adminOneHealth();
    if (error) showToast(t('oneHealth.failedLoad', { message: error.message }), 'error');
    else if (!data) showToast(t('oneHealth.failedLoadEmpty'), 'error');
    else { setAlerts(data.alerts || []); setSummary(data.summary); }
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    if (role === 'admin' || role === 'super_admin') load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const filtered = useMemo(() => alerts.filter((a) =>
    (!severityFilter || a.severity === severityFilter) && (!zoonoticOnly || a.zoonotic)
  ), [alerts, severityFilter, zoonoticOnly]);

  const farmsAffected = useMemo(() => new Set(alerts.flatMap((a) => a.farms)).size, [alerts]);

  if (role === null || (role !== 'admin' && role !== 'super_admin')) return null;

  const SEVERITY_LABEL_KEY = { critical: 'enums.animalHealthStatus.Critical', high: 'enums.taskPriority.High', medium: 'enums.taskPriority.Medium', low: 'enums.taskPriority.Low' };

  return (
    <>
      <div className="page-header">
        <div>
          <h1><i className="fas fa-shield-virus" style={{ color: 'var(--red)', marginRight: 8 }}></i> {t('oneHealth.title')}</h1>
          <p>{t('oneHealth.subtitle')}</p>
        </div>
        <button className="btn btn-secondary" onClick={() => load(true)} disabled={loading || refreshing}>
          {refreshing ? <><i className="fas fa-spinner fa-spin"></i> {t('oneHealth.analyzing')}</> : <><i className="fas fa-rotate"></i> {t('common.refresh')}</>}
        </button>
      </div>

      {loading ? (
        <div className="empty-state" style={{ padding: '60px 20px' }}><i className="fas fa-spinner fa-spin"></i><h3>{t('oneHealth.scanning')}</h3></div>
      ) : (
        <div className="admin-fade-in">

          <div className="card mb-24">
            <button
              type="button"
              className="card-header"
              style={{ width: '100%', border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
              onClick={() => setShowAbout((v) => !v)}
            >
              <h3><i className="fas fa-circle-info" style={{ color: 'var(--blue)', marginRight: 6 }}></i> {t('oneHealth.aboutTitle')}</h3>
              <i className={`fas ${showAbout ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
            </button>
            {showAbout && (
              <div className="card-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                <div>
                  <p className="fw-600" style={{ marginBottom: 8, color: 'var(--primary)' }}><i className="fas fa-check-circle"></i> {t('oneHealth.canDetectTitle')}</p>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary, #555)' }}>
                    <li>{t('oneHealth.canDetect1')}</li>
                    <li>{t('oneHealth.canDetect2')}</li>
                    <li>{t('oneHealth.canDetect3')}</li>
                    <li>{t('oneHealth.canDetect4')}</li>
                    <li>{t('oneHealth.canDetect5')}</li>
                    <li>{t('oneHealth.canDetect6')}</li>
                  </ul>
                </div>
                <div>
                  <p className="fw-600" style={{ marginBottom: 8, color: 'var(--red)' }}><i className="fas fa-triangle-exclamation"></i> {t('oneHealth.whereWrongTitle')}</p>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary, #555)' }}>
                    <li>{t('oneHealth.whereWrong1')}</li>
                    <li>{t('oneHealth.whereWrong2')}</li>
                    <li>{t('oneHealth.whereWrong3')}</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          <div className="summary-grid mb-24">
            <StatCard icon="fa-shield-virus" color="red" label={t('oneHealth.openAlerts')} value={summary?.total ?? 0} />
            <StatCard icon="fa-skull" color="purple" label={t('oneHealth.zoonoticRisk')} value={summary?.zoonotic ?? 0} />
            <StatCard icon="fa-map-location-dot" color="blue" label={t('oneHealth.farmsAffected')} value={farmsAffected} />
            <StatCard icon="fa-database" color="green" label={t('oneHealth.recordsScanned')} value={summary?.recordsScanned ?? 0} />
          </div>

          <div className="charts-grid mb-24">
            <div className="card">
              <div className="card-header"><h3>{t('oneHealth.chartAlertsBySeverity')}</h3></div>
              <div className="card-body"><SeverityChart bySeverity={summary?.bySeverity} /></div>
            </div>
            <div className="card">
              <div className="card-header"><h3>{t('oneHealth.chartAlertsByDetection')}</h3></div>
              <div className="card-body"><TypeChart alerts={alerts} /></div>
            </div>
          </div>

          <div className="card-header" style={{ padding: '0 0 12px', border: 0 }}>
            <h3><i className="fas fa-map-location-dot" style={{ color: 'var(--red)', marginRight: 6 }}></i> {t('oneHealth.spatialRiskDistribution')}</h3>
          </div>
          <div className="mb-24">
            <OneHealthMap />
          </div>

          <div className="filter-bar">
            <select className="form-control" value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
              <option value="">{t('oneHealthMap.allSeverities')}</option>
              <option value="critical">{t('enums.animalHealthStatus.Critical')}</option>
              <option value="high">{t('enums.taskPriority.High')}</option>
              <option value="medium">{t('enums.taskPriority.Medium')}</option>
              <option value="low">{t('enums.taskPriority.Low')}</option>
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={zoonoticOnly} onChange={(e) => setZoonoticOnly(e.target.checked)} />
              {t('oneHealth.zoonoticOnly')}
            </label>
            {(severityFilter || zoonoticOnly) && (
              <button className="btn btn-secondary btn-sm" onClick={() => { setSeverityFilter(''); setZoonoticOnly(false); }}>
                <i className="fas fa-xmark"></i> {t('common.clearFilters')}
              </button>
            )}
          </div>

          <div className="card">
            <div className="card-header"><h3>{t('oneHealth.riskAlerts')}</h3><span className="badge badge-green">{t('adminDashboard.xOfY', { filtered: filtered.length, total: alerts.length })}</span></div>
            <div className="card-body" style={{ padding: 0 }}>
              {filtered.length === 0 ? (
                <div className="empty-state">
                  <i className="fas fa-shield-heart"></i>
                  <h3>{t('oneHealth.noRiskSignals')}</h3>
                  <p>{alerts.length === 0 ? t('oneHealth.noSignalsFullText') : t('oneHealth.noAlertsMatchFilters')}</p>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>{t('oneHealth.colAlert')}</th>
                        <th>{t('oneHealth.colType')}</th>
                        <th>{t('oneHealth.colSeverity')}</th>
                        <th>{t('oneHealth.colFarms')}</th>
                        <th>{t('oneHealth.colDistrict')}</th>
                        <th>{t('oneHealth.colDetected')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((a, i) => (
                        <tr key={i}>
                          <td>
                            <div className="fw-600"><i className={`fas ${TYPE_ICON[a.type] || 'fa-triangle-exclamation'}`} style={{ marginRight: 6, color: 'var(--red)' }}></i>{a.title}</div>
                            <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>{a.description}</div>
                            {a.zoonotic && <span className="badge badge-purple" style={{ marginTop: 4, marginRight: 4, display: 'inline-block' }}>{t('oneHealth.zoonoticBadge')}</span>}
                            {a.confidence && <span className={`badge ${CONFIDENCE_BADGE[a.confidence]}`} style={{ marginTop: 4, display: 'inline-block' }}>{t(CONFIDENCE_LABEL_KEY[a.confidence])}</span>}
                          </td>
                          <td>{TYPE_LABEL_KEY[a.type] ? t(TYPE_LABEL_KEY[a.type]) : a.type}</td>
                          <td><span className={`badge ${SEVERITY_BADGE[a.severity]}`}>{SEVERITY_LABEL_KEY[a.severity] ? t(SEVERITY_LABEL_KEY[a.severity]) : a.severity}</span></td>
                          <td>{a.farms.join(', ')}</td>
                          <td>{a.district || '—'}</td>
                          <td>{fmtDate(a.detectedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
