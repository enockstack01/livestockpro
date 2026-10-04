import { useTranslation } from 'react-i18next';
import { useChartTheme } from '../../lib/chartTheme.js';
import { Meter, Ring, SplitBar } from './MicroViz.jsx';
import TileGrid from './TileGrid.jsx';

/* Key insights as tiles — a figure, a 2–4 word label and a small chart —
   instead of sentences. The full sentence stays as the tile's hover text
   and accessible name. Same tiles as the mobile app
   (mobile/src/screens/dashboard/InsightTiles.js); data from
   shared/analytics.js (insight.viz). */

const TONE_ICON = { good: 'circle-check', warn: 'triangle-exclamation', bad: 'circle-exclamation', info: 'circle-info' };
const PART_ICON = { recovered: 'heart-pulse', died: 'skull', female: 'venus', male: 'mars' };

export function useInsightColors() {
  const ct = useChartTheme();
  return {
    tone: { good: ct.status.good, warn: ct.status.warning, bad: ct.status.critical, info: ct.series[0] },
    parts: { recovered: ct.status.good, died: ct.neutral, female: ct.series[4], male: ct.series[0] }
  };
}

function Viz({ ins, color, colors, t }) {
  const v = ins.viz;
  if (v.kind === 'ring') {
    return <Ring pct={v.pct} color={color} size={68} stroke={7}><b>{v.figure}</b></Ring>;
  }
  if (v.kind === 'meter') {
    return (
      <div className="insight-tile-stack">
        <div className="insight-figure">{v.figure}{v.sub && <small>{v.sub}</small>}</div>
        <Meter value={v.value} max={v.max} color={color} />
      </div>
    );
  }
  if (v.kind === 'split') {
    const parts = v.parts.map((p) => ({ ...p, color: colors.parts[p.key], label: t(`analytics.part.${p.key}`) }));
    return (
      <div className="insight-tile-stack">
        <div className="insight-figure">{v.figure}</div>
        <SplitBar parts={parts} />
        <div className="insight-parts">
          {parts.map((p) => <span key={p.key} title={p.label}><i className={`fas fa-${PART_ICON[p.key]}`} style={{ color: p.color }} /> {p.value}</span>)}
        </div>
      </div>
    );
  }
  if (v.kind === 'trend') {
    return (
      <div className="insight-tile-stack">
        <div className="insight-figure"><i className={`fas fa-arrow-${v.dir === 'up' ? 'trend-up' : 'trend-down'}`} style={{ color, marginRight: 6 }} />{v.figure}</div>
        {v.sub && <div className="insight-sub">{v.sub}</div>}
      </div>
    );
  }
  return (
    <div className="insight-tile-stack">
      <div className="insight-figure">{v.icon && <i className={`fas fa-${v.icon}`} style={{ color, marginRight: 8, fontSize: '0.8em' }} />}{v.figure}</div>
    </div>
  );
}

export default function InsightTiles({ insights }) {
  const { t } = useTranslation();
  const colors = useInsightColors();
  return (
    <TileGrid className="insight-tiles" minTile={155}>
      {insights.map((ins) => {
        const color = colors.tone[ins.tone];
        const sentence = t(`analytics.insight.${ins.key}`, ins.vars);
        const v = ins.viz;
        return (
          <div key={ins.id} className={`insight-tile${v.kind === 'ring' ? ' with-ring' : ''}`} title={sentence} aria-label={sentence} role="group" style={{ '--tile-accent': color }}>
            <div className="insight-tile-label">
              <i className={`fas fa-${TONE_ICON[ins.tone]}`} style={{ color }} />
              <span>{t(`analytics.insightLabel.${ins.key}`, ins.vars)}</span>
            </div>
            <div className="insight-tile-body">
              <Viz ins={ins} color={color} colors={colors} t={t} />
              {v.kind === 'ring' && (
                <div className="insight-tile-side">
                  {v.sub && <span className="insight-sub">{v.sub}</span>}
                  {v.overdue > 0 && <span className="glance-badge tone-red"><i className="fas fa-clock" />{v.overdue}</span>}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </TileGrid>
  );
}
