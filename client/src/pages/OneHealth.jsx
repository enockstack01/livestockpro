import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useApi } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { useCanvasChart } from '../lib/useChart.js';
import { fmtDate } from '../lib/badges.jsx';

const SEVERITY_BADGE = { critical: 'badge-red', high: 'badge-orange', medium: 'badge-blue', low: 'badge-gray' };
const SEVERITY_COLOR = { critical: '#D32F2F', high: '#F9A825', medium: '#1976D2', low: '#90A4AE' };
const TYPE_LABEL = { watchlist: 'Watchlist disease', critical_cluster: 'Critical health cluster', outbreak_cluster: 'Outbreak cluster' };
const TYPE_ICON = { watchlist: 'fa-skull-crossbones', critical_cluster: 'fa-heart-crack', outbreak_cluster: 'fa-diagram-project' };

function StatCard({ icon, color, label, value }) {
  return (
    <div className="summary-card">
      <div className={`summary-icon ${color}`}><i className={`fas ${icon}`}></i></div>
      <div className="summary-info"><h4>{value}</h4><p>{label}</p></div>
    </div>
  );
}

function SeverityChart({ bySeverity }) {
  const entries = [['Critical', bySeverity?.critical || 0, SEVERITY_COLOR.critical], ['High', bySeverity?.high || 0, SEVERITY_COLOR.high], ['Medium', bySeverity?.medium || 0, SEVERITY_COLOR.medium], ['Low', bySeverity?.low || 0, SEVERITY_COLOR.low]];
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const canvasRef = useCanvasChart(() => {
    if (total === 0) return null;
    return {
      type: 'doughnut',
      data: { labels: entries.map(([k]) => k), datasets: [{ data: entries.map(([, v]) => v), backgroundColor: entries.map(([, , c]) => c), borderWidth: 0, spacing: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, pointStyleWidth: 10, font: { size: 12 } } } } }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(bySeverity)]);

  if (total === 0) return <div className="empty-state" style={{ padding: '30px 10px' }}><i className="fas fa-chart-pie"></i><h3>No alerts yet</h3></div>;
  return <div className="chart-container"><canvas ref={canvasRef}></canvas></div>;
}

function TypeChart({ alerts }) {
  const counts = { watchlist: 0, critical_cluster: 0, outbreak_cluster: 0 };
  alerts.forEach((a) => { if (counts[a.type] !== undefined) counts[a.type]++; });
  const entries = Object.entries(counts);
  const total = alerts.length;
  const canvasRef = useCanvasChart(() => {
    if (total === 0) return null;
    return {
      type: 'bar',
      data: { labels: entries.map(([k]) => TYPE_LABEL[k]), datasets: [{ data: entries.map(([, v]) => v), backgroundColor: ['#7B1FA2', '#D32F2F', '#F9A825'], borderRadius: 6 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } }, grid: { color: '#F0F0F0' } }, y: { grid: { display: false }, ticks: { font: { size: 11 } } } }, plugins: { legend: { display: false } } }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(counts)]);

  if (total === 0) return <div className="empty-state" style={{ padding: '30px 10px' }}><i className="fas fa-diagram-project"></i><h3>No alerts yet</h3></div>;
  return <div className="chart-container"><canvas ref={canvasRef}></canvas></div>;
}

export default function OneHealth() {
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
    if (error) showToast('Failed to load One Health data: ' + error.message, 'error');
    else { setAlerts(data.alerts); setSummary(data.summary); }
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

  return (
    <>
      <div className="page-header">
        <div>
          <h1><i className="fas fa-shield-virus" style={{ color: 'var(--red)', marginRight: 8 }}></i> One Health Intelligence</h1>
          <p>Disease risk signals computed live from health records across every farm on the platform</p>
        </div>
        <button className="btn btn-secondary" onClick={() => load(true)} disabled={loading || refreshing}>
          {refreshing ? <><i className="fas fa-spinner fa-spin"></i> Analyzing...</> : <><i className="fas fa-rotate"></i> Refresh</>}
        </button>
      </div>

      {loading ? (
        <div className="empty-state" style={{ padding: '60px 20px' }}><i className="fas fa-spinner fa-spin"></i><h3>Scanning health records for risk signals...</h3></div>
      ) : (
        <div className="admin-fade-in">

          <div className="card mb-24">
            <button
              type="button"
              className="card-header"
              style={{ width: '100%', border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
              onClick={() => setShowAbout((v) => !v)}
            >
              <h3><i className="fas fa-circle-info" style={{ color: 'var(--blue)', marginRight: 6 }}></i> What this dashboard can and can&apos;t tell you</h3>
              <i className={`fas ${showAbout ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
            </button>
            {showAbout && (
              <div className="card-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                <div>
                  <p className="fw-600" style={{ marginBottom: 8, color: 'var(--primary)' }}><i className="fas fa-check-circle"></i> It can detect</p>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary, #555)' }}>
                    <li>Health records naming a disease on a 15-entry zoonotic / major-transboundary watchlist (e.g. Anthrax, Rabies, Avian Influenza, Brucellosis, FMD, ASF).</li>
                    <li>The same unnamed symptom reported across 3+ different farms in one district within 14 days — an early outbreak signal that needs no diagnosis at all.</li>
                    <li>A burst of 3+ Critical-status animals or records at one farm within 7 days.</li>
                  </ul>
                </div>
                <div>
                  <p className="fw-600" style={{ marginBottom: 8, color: 'var(--red)' }}><i className="fas fa-triangle-exclamation"></i> It cannot (yet) detect</p>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary, #555)' }}>
                    <li>Diseases described in local/colloquial terms not on the watchlist — text matching only catches known phrasing.</li>
                    <li>The difference between a preventive vaccination mention and an actual diagnosis — both currently match the same keywords.</li>
                    <li>Mortality directly — this schema has no death field, so Critical status is used as the closest available proxy.</li>
                    <li>Anything outside the last 30 days of records, or any unconfirmed/lab-pending case.</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          <div className="summary-grid mb-24">
            <StatCard icon="fa-shield-virus" color="red" label="Open alerts" value={summary?.total ?? 0} />
            <StatCard icon="fa-skull" color="purple" label="Zoonotic risk" value={summary?.zoonotic ?? 0} />
            <StatCard icon="fa-map-location-dot" color="blue" label="Farms affected" value={farmsAffected} />
            <StatCard icon="fa-database" color="green" label="Records scanned (30d)" value={summary?.recordsScanned ?? 0} />
          </div>

          <div className="charts-grid mb-24">
            <div className="card">
              <div className="card-header"><h3>Alerts by Severity</h3></div>
              <div className="card-body"><SeverityChart bySeverity={summary?.bySeverity} /></div>
            </div>
            <div className="card">
              <div className="card-header"><h3>Alerts by Detection Method</h3></div>
              <div className="card-body"><TypeChart alerts={alerts} /></div>
            </div>
          </div>

          <div className="filter-bar">
            <select className="form-control" value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
              <option value="">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={zoonoticOnly} onChange={(e) => setZoonoticOnly(e.target.checked)} />
              Zoonotic only
            </label>
            {(severityFilter || zoonoticOnly) && (
              <button className="btn btn-secondary btn-sm" onClick={() => { setSeverityFilter(''); setZoonoticOnly(false); }}>
                <i className="fas fa-xmark"></i> Clear filters
              </button>
            )}
          </div>

          <div className="card">
            <div className="card-header"><h3>Risk Alerts</h3><span className="badge badge-green">{filtered.length} of {alerts.length}</span></div>
            <div className="card-body" style={{ padding: 0 }}>
              {filtered.length === 0 ? (
                <div className="empty-state">
                  <i className="fas fa-shield-heart"></i>
                  <h3>No risk signals detected</h3>
                  <p>{alerts.length === 0 ? 'No watchlist diseases, critical clusters, or cross-farm outbreak patterns found in the last 30 days.' : 'No alerts match the current filters.'}</p>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Alert</th>
                        <th>Type</th>
                        <th>Severity</th>
                        <th>Farms</th>
                        <th>District</th>
                        <th>Detected</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((a, i) => (
                        <tr key={i}>
                          <td>
                            <div className="fw-600"><i className={`fas ${TYPE_ICON[a.type] || 'fa-triangle-exclamation'}`} style={{ marginRight: 6, color: 'var(--red)' }}></i>{a.title}</div>
                            <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>{a.description}</div>
                            {a.zoonotic && <span className="badge badge-purple" style={{ marginTop: 4, display: 'inline-block' }}>Zoonotic</span>}
                          </td>
                          <td>{TYPE_LABEL[a.type] || a.type}</td>
                          <td><span className={`badge ${SEVERITY_BADGE[a.severity]}`}>{a.severity}</span></td>
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
