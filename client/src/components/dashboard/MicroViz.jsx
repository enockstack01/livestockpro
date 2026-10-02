import { useId } from 'react';

/* Small inline-SVG charts for dashboard tiles: sparkline, mini columns
   (optionally diverging around zero), meter, ring gauge and two-part split
   bar. Mirrored for the mobile app in mobile/src/ui/microViz.js. Marks
   follow the chart rules used across the app: 2px lines, a dot on the
   latest point, 2px gaps between fills, rounded data-ends on the baseline,
   and a <title> on every mark so hovering shows its value. Every chart also
   prints its numbers: columns carry their value on top, and a sparkline is
   paired with SeriesValues (each point's value, and optionally its month). */

export function Sparkline({ values, color, labels = [], fmt = String, height = 40 }) {
  const gid = useId().replace(/:/g, '');
  const w = 120;
  const n = values.length;
  if (!n) return null;
  const max = Math.max(...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const x = (i) => ((i + 0.5) * w) / n; // centred in equal slots, like SeriesValues
  const y = (v) => 4 + (1 - (v - min) / span) * (height - 8);
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const area = `${line}L${x(n - 1).toFixed(1)},${height}L${x(0).toFixed(1)},${height}Z`;
  return (
    <svg className="micro-viz" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ height }} role="img">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {values.map((v, i) => (
        <rect key={i} x={x(i) - w / n / 2} y="0" width={w / n} height={height} fill="transparent">
          <title>{`${labels[i] ?? ''}: ${fmt(v)}`}</title>
        </rect>
      ))}
    </svg>
  );
}

/* The latest-point dot sits outside the stretched SVG so it stays round. */
export function SparkDot({ values, color, height = 40 }) {
  const n = values.length;
  if (!n) return null;
  const max = Math.max(...values);
  const min = Math.min(0, ...values);
  const top = 4 + (1 - (values[n - 1] - min) / (max - min || 1)) * (height - 8);
  return <span className="spark-dot" style={{ top: top - 4, background: color, '--n': n }} />;
}

/* The value of each sparkline point, in the same equal slots as the points
   (so each number sits under its point); optional month names beneath. */
export function SeriesValues({ values, fmt = String, months }) {
  return (
    <span className="series-values">
      <span className="series-row">{values.map((v, i) => <b key={i}>{fmt(v)}</b>)}</span>
      {months && <span className="series-row muted">{months.map((mo, i) => <span key={i}>{mo}</span>)}</span>}
    </span>
  );
}

/* HTML columns (not a stretched SVG) so the rounded data-ends stay round
   at any tile width. Negative values hang below a zero line. Each column
   shows its value (valueFmt) just beyond its end. */
export function MiniColumns({ values, color, negColor, labels = [], fmt = String, valueFmt = fmt, height = 40 }) {
  if (!values.length) return null;
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const zeroFromTop = (max / span) * 100;
  return (
    <div className={`micro-cols${min < 0 ? ' has-neg' : ''}`} style={{ height }} role="img">
      {min < 0 && <span className="micro-cols-zero" style={{ top: `${zeroFromTop}%` }} />}
      {values.map((v, i) => {
        const h = (Math.abs(v) / span) * 100;
        const neg = v < 0;
        const pos = neg ? { top: `${zeroFromTop}%` } : { bottom: `${100 - zeroFromTop}%` };
        const labelPos = neg ? { top: `calc(${zeroFromTop + h}% + 2px)` } : { bottom: `calc(${100 - zeroFromTop + h}% + 2px)` };
        return (
          <span key={i} className="micro-col" title={`${labels[i] ?? ''}: ${fmt(v)}`}>
            <span
              className={neg ? 'neg' : 'pos'}
              style={{ height: v === 0 ? 0 : `max(2px, ${h}%)`, background: neg && negColor ? negColor : color, ...pos }}
            />
            <em className="micro-col-val" style={labelPos}>{valueFmt(v)}</em>
          </span>
        );
      })}
    </div>
  );
}

export function Meter({ value, max, color, title }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="micro-meter" title={title} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <span style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Ring({ pct, color, size = 64, stroke = 7, children, title }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const len = (Math.max(0, Math.min(100, pct)) / 100) * circ;
  return (
    <div className="micro-ring" style={{ width: size, height: size }} title={title}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--bg)" strokeWidth={stroke} fill="none" />
        {len > 0 && <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${len} ${circ}`} />}
      </svg>
      <div className="micro-ring-label">{children}</div>
    </div>
  );
}

/* parts: [{ value, color, label }] — a 2px surface gap between segments. */
export function SplitBar({ parts }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div className="micro-split">
      {parts.filter((p) => p.value > 0).map((p) => (
        <span key={p.label} style={{ flexGrow: p.value / total, background: p.color }} title={`${p.label}: ${p.value}`} />
      ))}
    </div>
  );
}
