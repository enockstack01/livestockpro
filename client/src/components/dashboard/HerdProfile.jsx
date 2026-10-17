import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { computeHerdProfile } from '../../../../shared/dashboardFeed';
import GlanceTiles from './GlanceTiles.jsx';

/* Herd profile overview, the first section of the dashboard and the twin of
   the mobile app's (mobile/src/screens/dashboard/HerdProfileCard.js). Pine
   farm banner and species chips, then five charts that show what is
   happening on the farm, every one labelled with its numbers:
   herd health (ring), herd size over 12 months with the animals added, born
   and lost each month, this month's movement, the herd by species (or breed)
   split female and male, and the age structure. Brand colours only: Leaf
   main series, Amber comparison, Alert Red for losses and critical. */

const LEAF = '#2E7D32';
const AMBER = '#F9A825';
const RED = '#C62828';
const STONE = '#8A948B';

function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

function Card({ icon, title, aside, className = '', children }) {
  return (
    <div className={`hp-card ${className}`}>
      <div className="hp-card-head">
        <h3><span className="hp-card-icon"><i className={`fas fa-${icon}`} /></span>{title}</h3>
        {aside}
      </div>
      {children}
    </div>
  );
}

function HealthRing({ segments, total, pct, label, size = 150 }) {
  const stroke = 16;
  const r = (size - stroke) / 2 - 1;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const visible = segments.filter((s) => s.value > 0 && total > 0);
  const gap = visible.length > 1 ? 3 : 0;
  let offset = 0;
  const arcs = visible.map((s) => {
    const len = Math.max(0, (s.value / total) * circ - gap);
    const arc = { ...s, dash: `${len} ${circ - len}`, offset: -offset };
    offset += (s.value / total) * circ;
    return arc;
  });
  return (
    <div className="hp-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx={c} cy={c} r={r} stroke="var(--border)" strokeWidth={stroke} fill="none" />
        {arcs.map((a) => <circle key={a.key} cx={c} cy={c} r={r} stroke={a.color} strokeWidth={stroke} strokeDasharray={a.dash} strokeDashoffset={a.offset} fill="none" />)}
      </svg>
      <div className="hp-ring-label"><strong>{pct}%</strong><span>{label}</span></div>
    </div>
  );
}

/* Herd size line over 12 months (value on every point), and below it the
   month's movement: added and born above the line in Leaf and Amber, lost
   below it in Alert Red, each with its count. */
function TrendChart({ trend, t }) {
  const [ref, width] = useWidth();
  const w = Math.max(width, 280);
  const padL = 10;
  const padR = 10;
  const lineTop = 22;
  const lineH = 104;
  const moveTop = lineTop + lineH + 26;
  const moveH = 46;
  const labelY = moveTop + moveH + 16;
  const h = labelY + 6;
  const n = trend.length;
  const step = (w - padL - padR) / Math.max(1, n - 1);
  const x = (i) => padL + i * step;
  const max = Math.max(1, ...trend.map((m) => m.herd));
  const min = Math.min(...trend.map((m) => m.herd));
  const lo = Math.max(0, min - Math.ceil((max - min) * 0.25) - 1);
  const y = (v) => lineTop + lineH - ((v - lo) / Math.max(1, max - lo)) * lineH;
  const pts = trend.map((m, i) => [x(i), y(m.herd)]);
  const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  const area = `${line} L${x(n - 1).toFixed(1)},${lineTop + lineH} L${x(0).toFixed(1)},${lineTop + lineH} Z`;
  const moveMax = Math.max(1, ...trend.map((m) => Math.max(m.added + m.born, m.lost)));
  const mid = moveTop + moveH * 0.62;
  const barW = Math.min(18, step * 0.5);
  const small = step < 34;

  return (
    <div ref={ref} className="hp-trend">
      <svg width={w} height={h} role="img" aria-label={t('herdProfile.trendTitle')}>
        <path d={area} fill={LEAF} opacity="0.1" />
        <path d={line} fill="none" stroke={LEAF} strokeWidth="2.5" strokeLinejoin="round" />
        {pts.map(([px, py], i) => (
          <g key={trend[i].key}>
            <circle cx={px} cy={py} r={i === n - 1 ? 5 : 3.2} fill={i === n - 1 ? LEAF : 'var(--card)'} stroke={LEAF} strokeWidth="2" />
            {(!small || i === n - 1 || i % 2 === 1) && (
              <text x={px} y={py - 9} textAnchor="middle" className={`hp-val${i === n - 1 ? ' strong' : ''}`}>{trend[i].herd}</text>
            )}
          </g>
        ))}
        <line x1={padL - 4} x2={w - padR + 4} y1={mid} y2={mid} stroke="var(--border)" />
        {trend.map((m, i) => {
          const upA = (m.added / moveMax) * (moveH * 0.6);
          const upB = (m.born / moveMax) * (moveH * 0.6);
          const down = (m.lost / moveMax) * (moveH * 0.36);
          const cx = x(i);
          const up = m.added + m.born;
          return (
            <g key={m.key}>
              {m.added > 0 && <rect x={cx - barW / 2} y={mid - upA} width={barW} height={upA} rx="2" fill={LEAF} />}
              {m.born > 0 && <rect x={cx - barW / 2} y={mid - upA - upB} width={barW} height={upB} rx="2" fill={AMBER} />}
              {up > 0 && <text x={cx} y={mid - upA - upB - 3} textAnchor="middle" className="hp-val tiny">+{up}</text>}
              {m.lost > 0 && <rect x={cx - barW / 2} y={mid + 1} width={barW} height={down} rx="2" fill={RED} />}
              {m.lost > 0 && <text x={cx} y={mid + down + 10} textAnchor="middle" className="hp-val tiny red">-{m.lost}</text>}
              {(!small || i % 2 === 1 || i === n - 1) && <text x={cx} y={labelY} textAnchor="middle" className="hp-axis">{m.label}</text>}
            </g>
          );
        })}
      </svg>
      <div className="hp-legend">
        <span><i style={{ background: LEAF }} />{t('herdProfile.added')}</span>
        <span><i style={{ background: AMBER }} />{t('herdProfile.born')}</span>
        <span><i style={{ background: RED }} />{t('herdProfile.lost')}</span>
      </div>
    </div>
  );
}

function Movement({ month, t }) {
  const rows = [
    { key: 'added', icon: 'plus', value: month.added, tone: 'leaf' },
    { key: 'born', icon: 'baby', value: month.born, tone: 'amber' },
    { key: 'lost', icon: 'minus', value: month.lost, tone: 'red' }
  ];
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="hp-move">
      {rows.map((r) => (
        <div key={r.key} className="hp-move-row">
          <span className={`hp-move-icon ${r.tone}`}><i className={`fas fa-${r.icon}`} /></span>
          <span className="hp-move-label">{t(`herdProfile.${r.key}`)}</span>
          <span className="hp-move-bar"><span className={r.tone} style={{ width: `${r.value ? Math.max(6, (r.value / max) * 100) : 0}%` }} /></span>
          <b>{r.value}</b>
        </div>
      ))}
      <div className="hp-move-net">
        <span>{t('herdProfile.net')}</span>
        <span className={`badge ${month.net < 0 ? 'badge-red' : 'badge-green'}`}>{month.net > 0 ? '+' : ''}{month.net}</span>
      </div>
      <p className="hp-note">{t('herdProfile.bornNote')}</p>
    </div>
  );
}

function Composition({ groups, groupLabel, t }) {
  const shown = groups.slice(0, 7);
  const max = Math.max(1, ...shown.map((g) => g.count));
  return (
    <div className="hp-comp">
      {shown.map((g) => (
        <div key={g.name} className="hp-comp-row">
          <div className="hp-comp-top">
            <span className="name">{groupLabel(g.name)}</span>
            <span className="sub">{t('herdProfile.healthyOf', { healthy: g.healthy, count: g.count })}</span>
            <b>{g.count}</b>
          </div>
          <div className="hp-stack" style={{ width: `${Math.max(12, (g.count / max) * 100)}%` }}>
            {[['female', LEAF], ['male', AMBER], ['unknown', STONE]].map(([k, color]) => (g[k] > 0 ? (
              <span key={k} style={{ flex: g[k], background: color, color: k === 'male' ? '#1C2B1E' : '#FFFFFF' }} title={`${t(`herdProfile.${k}`)}: ${g[k]}`}>{g[k]}</span>
            ) : null))}
          </div>
        </div>
      ))}
      {groups.length > shown.length && <div className="hp-note">{t('herdProfile.more', { count: groups.length - shown.length })}</div>}
      <div className="hp-legend">
        <span><i style={{ background: LEAF }} />{t('herdProfile.female')}</span>
        <span><i style={{ background: AMBER }} />{t('herdProfile.male')}</span>
        <span><i style={{ background: STONE }} />{t('herdProfile.unknown')}</span>
      </div>
    </div>
  );
}

function Ages({ ages, unknown, max, t }) {
  return (
    <div className="hp-ages">
      <div className="hp-ages-cols">
        {ages.map((a) => (
          <div key={a.key} className="hp-ages-col">
            <b>{a.value}</b>
            <span className="hp-ages-track"><span style={{ height: `${a.value ? Math.max(6, (a.value / max) * 100) : 0}%` }} /></span>
            <small>{t(`analytics.${a.key}`)}</small>
          </div>
        ))}
      </div>
      {unknown > 0 && <p className="hp-note">{t('herdProfile.ageUnknown', { count: unknown })}</p>}
    </div>
  );
}

export default function HerdProfile({ animals, health, breeding, profile, glance, onOpen }) {
  const { t, i18n } = useTranslation();
  const [species, setSpecies] = useState('');
  const p = useMemo(() => computeHerdProfile(animals, species, { health, breeding, lang: i18n.language }), [animals, species, health, breeding, i18n.language]);
  const enumLabel = (group, v) => t(`enums.${group}.${v}`, { defaultValue: v });
  const groupLabel = (name) => (p.groupBy === 'species' ? enumLabel('species', name) : name);
  const ringTotal = p.segments.reduce((s, x) => s + x.value, 0);

  return (
    <section className="herd-profile" aria-label={t('herdProfile.eyebrow')}>
      <div className="herd-profile-banner">
        <div className="herd-profile-eyebrow"><i className="fas fa-cow" /> {t('herdProfile.eyebrow')}</div>
        <div className="herd-profile-head">
          <div className="herd-profile-title">
            <h2>{profile?.farm_name || t('herdProfile.myFarm')}</h2>
            <p>{profile?.location || t('herdProfile.noLocation')}</p>
          </div>
          <div className="herd-profile-count">
            <strong>{p.living.toLocaleString()}</strong>
            <span>{species ? `${enumLabel('species', species)} · ` : ''}{t('herdProfile.livingHerd')}</span>
          </div>
        </div>
      </div>

      {p.speciesList.length > 1 && (
        <div className="herd-profile-chips" role="tablist" aria-label={t('tables.animals.fields.species')}>
          {['', ...p.speciesList].map((s) => (
            <button key={s || 'all'} type="button" role="tab" aria-selected={s === species} className={`herd-profile-chip${s === species ? ' active' : ''}`} onClick={() => setSpecies(s)}>
              {s ? enumLabel('species', s) : t('herdProfile.allSpecies')}
            </button>
          ))}
        </div>
      )}

      <div className="herd-profile-body">
        {p.living > 0 || p.deceased > 0 ? (
          <div className="hp-grid">
            <Card icon="heart-pulse" title={t('herdProfile.healthTitle')} className="hp-a-health">
              <div className="hp-health-body">
                <HealthRing segments={p.segments} total={ringTotal} pct={p.healthyPct} label={t('herdProfile.healthy')} />
                <ul className="hp-status">
                  {p.segments.map((s) => (
                    <li key={s.key} className={s.value > 0 ? '' : 'muted'}>
                      <span className="dot" style={{ background: s.color }} />
                      <span className="label">{enumLabel('animalHealthStatus', s.key)}</span>
                      <b>{s.value}</b>
                    </li>
                  ))}
                  {p.deceased > 0 && (
                    <li className="muted">
                      <span className="dot" style={{ background: STONE }} />
                      <span className="label">{enumLabel('animalHealthStatus', 'Deceased')}</span>
                      <b>{p.deceased}</b>
                    </li>
                  )}
                </ul>
              </div>
              <p className="hp-note">{t('herdProfile.cases30', { total: p.cases.total, recovered: p.cases.recovered })}</p>
            </Card>

            <Card icon="chart-line" title={t('herdProfile.trendTitle')} className="hp-a-trend"
              aside={<span className={`badge ${p.yearChange < 0 ? 'badge-red' : 'badge-green'}`}>{t('herdProfile.inYear', { value: `${p.yearChange > 0 ? '+' : ''}${p.yearChange}` })}</span>}>
              <TrendChart trend={p.trend} t={t} />
            </Card>

            <Card icon="arrow-right-arrow-left" title={t('herdProfile.movementTitle')} className="hp-a-move" aside={<span className="hp-aside">{p.month.label}</span>}>
              <Movement month={p.month} t={t} />
            </Card>

            <Card icon="layer-group" title={p.groupBy === 'species' ? t('herdProfile.bySpecies') : t('herdProfile.byBreed')} className="hp-a-comp">
              <Composition groups={p.byGroup} groupLabel={groupLabel} t={t} />
            </Card>

            <Card icon="hourglass-half" title={t('herdProfile.ageTitle')} className="hp-a-ages">
              <Ages ages={p.ages} unknown={p.ageUnknown} max={p.maxAge} t={t} />
            </Card>
          </div>
        ) : (
          <p className="herd-profile-empty">{t('herdProfile.empty')}</p>
        )}

        <div>
          <div className="herd-profile-section">{t('herdProfile.atAGlance')}</div>
          <GlanceTiles g={glance} onOpen={onOpen} />
        </div>
      </div>
    </section>
  );
}
