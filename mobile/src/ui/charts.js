import { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import { chartPalette, fmtMoney } from '../../../shared/chartPalette';

/* Native counterparts of the web dashboard's Chart.js charts (see
   client/src/lib/chartTheme.js), drawn with react-native-svg from the same
   shared palette: thin bars rounded at the data end, 2px surface gaps
   between stacked segments, hairline grid, no axis lines, smoothed lines
   that never overshoot, donuts with surface-colored separators, and a
   tap-to-inspect tooltip showing every series at that point (the web's
   index-mode hover). */

export function useChartColors() {
  const { scheme } = useTheme();
  return useMemo(() => chartPalette(scheme), [scheme]);
}

const FONT = 11;
// SVG text defaults to a serif face in browsers; match the app's UI font.
const FONT_FAMILY = Platform.select({ web: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif', default: undefined });
const fmtNum = (v) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : String(Math.round(v * 10) / 10));

function niceStep(range, target = 4) {
  const raw = range / target || 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
}

function scale(min, max, integer) {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max, integer ? 1 : 0);
  let step = niceStep(hi - lo || 1);
  if (integer) step = Math.max(1, Math.ceil(step));
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step || step;
  const ticks = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { min: start, max: end, ticks };
}

/* Rectangle with only the data-end corners rounded. */
function barPath(x, y, w, h, r, end) {
  if (w <= 0 || h <= 0) return '';
  r = Math.min(r, w / 2, h);
  if (end === 'top') return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  if (end === 'bottom') return `M${x},${y}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w - r}Q${x + w},${y + h} ${x + w},${y + h - r}V${y}Z`;
  if (end === 'right') return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
  return `M${x},${y}H${x + w}V${y + h}H${x}Z`;
}

/* Monotone cubic interpolation (Fritsch–Carlson) — Chart.js's
   cubicInterpolationMode: 'monotone'. */
function monotonePath(pts) {
  const n = pts.length;
  if (n < 2) return n ? `M${pts[0][0]},${pts[0][1]}` : '';
  const dx = [], dy = [], m = [], t = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; dy[i] = pts[i + 1][1] - pts[i][1]; m[i] = dy[i] / dx[i]; }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], h = a * a + b * b;
    if (h > 9) { const k = 3 / Math.sqrt(h); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${pts[i][0] + h},${pts[i][1] + t[i] * h} ${pts[i + 1][0] - h},${pts[i + 1][1] - t[i + 1] * h} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
}

function Legend({ items, cc }) {
  return (
    <View style={styles.legend}>
      {items.map((it) => (
        <View key={it.label} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: it.color }]} />
          <Text style={[styles.legendText, { color: cc.text }]}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

function Tooltip({ title, lines, x, y, width }) {
  const boxW = 170;
  const left = Math.max(0, Math.min(width - boxW, x - boxW / 2));
  return (
    <View pointerEvents="none" style={[styles.tooltip, { left, top: Math.max(0, y) }]}>
      <Text style={styles.tooltipTitle} numberOfLines={1}>{title}</Text>
      {lines.map((l) => (
        <View key={l.label} style={styles.tooltipRow}>
          <View style={[styles.tooltipDot, { backgroundColor: l.color }]} />
          <Text style={styles.tooltipText} numberOfLines={1}>{l.label ? `${l.label}: ` : ''}{l.value}</Text>
        </View>
      ))}
    </View>
  );
}

function useWidth() {
  const [w, setW] = useState(0);
  return [w, (e) => setW(e.nativeEvent.layout.width)];
}

/* Bar chart — vertical or horizontal, grouped or stacked. A dataset may
   carry `colors` (one per bar) instead of `color`. */
export function BarChart({ labels, datasets, horizontal, stacked, money, integer, legend, height = 280 }) {
  const cc = useChartColors();
  const [w, onLayout] = useWidth();
  const [sel, setSel] = useState(null);
  const fmt = money ? fmtMoney : fmtNum;
  const n = labels.length;

  const sums = labels.map((_, i) => datasets.reduce((s, d) => s + Math.max(0, d.data[i] || 0), 0));
  const allValues = stacked ? sums : datasets.flatMap((d) => d.data);
  const sc = scale(Math.min(0, ...allValues), Math.max(0, ...allValues), integer);
  const plotH = height - (legend ? 34 : 0);

  let chart = null;
  if (w > 0 && n > 0) {
    if (!horizontal) {
      const yLabelW = Math.max(...sc.ticks.map((v) => fmt(v).length)) * 6.4 + 10;
      const left = yLabelW, top = 8, bottom = 26, right = 4;
      const pw = w - left - right, ph = plotH - top - bottom;
      const y = (v) => top + ph - ((v - sc.min) / (sc.max - sc.min)) * ph;
      const band = pw / n;
      const groups = stacked ? 1 : datasets.length;
      const barW = Math.min(30, (band * 0.72) / groups);
      const every = Math.max(1, Math.ceil((n * 44) / pw));
      chart = (
        <Svg width={w} height={plotH}>
          {sc.ticks.map((v) => (
            <G key={v}>
              <Line x1={left} x2={w - right} y1={y(v)} y2={y(v)} stroke={cc.grid} strokeWidth={1} />
              <SvgText x={left - 6} y={y(v) + 4} fontSize={FONT} fontFamily={FONT_FAMILY} fill={cc.text} textAnchor="end">{fmt(v)}</SvgText>
            </G>
          ))}
          {labels.map((lab, i) => {
            const cx = left + band * i + band / 2;
            let acc = 0;
            return (
              <G key={i}>
                {datasets.map((d, di) => {
                  const v = d.data[i] || 0;
                  const color = d.colors ? d.colors[i] : d.color;
                  if (stacked) {
                    if (v <= 0) return null;
                    const y0 = y(acc), y1 = y(acc + v);
                    acc += v;
                    const isTop = datasets.slice(di + 1).every((dd) => !(dd.data[i] > 0));
                    return <Path key={di} d={barPath(cx - barW / 2, y1 + 1, barW, Math.max(0, y0 - y1 - 2), 2, isTop ? 'top' : 'none')} fill={color} />;
                  }
                  const x = cx - (barW * groups) / 2 + barW * di;
                  const y0 = y(0), y1 = y(v);
                  return v >= 0
                    ? <Path key={di} d={barPath(x + 1, y1, barW - 2, y0 - y1, 4, 'top')} fill={color} />
                    : <Path key={di} d={barPath(x + 1, y0, barW - 2, y1 - y0, 4, 'bottom')} fill={color} />;
                })}
                {i % every === 0 ? <SvgText x={cx} y={plotH - 8} fontSize={FONT} fontFamily={FONT_FAMILY} fill={cc.text} textAnchor="middle">{lab}</SvgText> : null}
                <Rect x={left + band * i} y={top} width={band} height={ph} fill="transparent" onPress={() => setSel(sel === i ? null : i)} />
              </G>
            );
          })}
        </Svg>
      );
      if (sel !== null && sel < n) {
        chart = (
          <View>
            {chart}
            <Tooltip width={w} x={left + band * sel + band / 2} y={top} title={labels[sel]} lines={datasets.map((d) => ({ label: d.label, value: fmt(d.data[sel] || 0), color: d.colors ? d.colors[sel] : d.color }))} />
          </View>
        );
      }
    } else {
      const labelW = Math.min(w * 0.36, Math.max(...labels.map((l) => String(l).length)) * 6.6 + 12);
      const left = labelW, top = 4, bottom = 24, right = 10;
      const pw = w - left - right, ph = plotH - top - bottom;
      const x = (v) => left + ((v - sc.min) / (sc.max - sc.min)) * pw;
      const band = ph / n;
      const barH = Math.min(30, band * 0.72);
      const maxChars = Math.floor((labelW - 12) / 6.4);
      const tickEvery = Math.max(1, Math.ceil((sc.ticks.length * 52) / pw));
      chart = (
        <Svg width={w} height={plotH}>
          {sc.ticks.map((v, ti) => (
            <G key={v}>
              <Line x1={x(v)} x2={x(v)} y1={top} y2={top + ph} stroke={cc.grid} strokeWidth={1} />
              {ti % tickEvery === 0 ? <SvgText x={x(v)} y={plotH - 6} fontSize={FONT} fontFamily={FONT_FAMILY} fill={cc.text} textAnchor="middle">{fmt(v)}</SvgText> : null}
            </G>
          ))}
          {labels.map((lab, i) => {
            const cy = top + band * i + band / 2;
            const text = String(lab).length > maxChars ? String(lab).slice(0, Math.max(1, maxChars - 1)) + '…' : String(lab);
            let acc = 0;
            return (
              <G key={i}>
                <SvgText x={left - 8} y={cy + 4} fontSize={FONT} fontFamily={FONT_FAMILY} fill={cc.text} textAnchor="end">{text}</SvgText>
                {datasets.map((d, di) => {
                  const v = Math.max(0, d.data[i] || 0);
                  const color = d.colors ? d.colors[i] : d.color;
                  if (stacked) {
                    if (!v) return null;
                    const x0 = x(acc), x1 = x(acc + v);
                    acc += v;
                    const isEnd = datasets.slice(di + 1).every((dd) => !(dd.data[i] > 0));
                    return <Path key={di} d={barPath(x0 + 1, cy - barH / 2, Math.max(0, x1 - x0 - 2), barH, 2, isEnd ? 'right' : 'none')} fill={color} />;
                  }
                  return <Path key={di} d={barPath(x(0), cy - barH / 2, x(v) - x(0), barH, 4, 'right')} fill={color} />;
                })}
                <Rect x={0} y={top + band * i} width={w} height={band} fill="transparent" onPress={() => setSel(sel === i ? null : i)} />
              </G>
            );
          })}
        </Svg>
      );
      if (sel !== null && sel < n) {
        chart = (
          <View>
            {chart}
            <Tooltip width={w} x={w * 0.62} y={top + band * sel + band} title={String(labels[sel])} lines={datasets.map((d) => ({ label: datasets.length > 1 ? d.label : '', value: fmt(d.data[sel] || 0), color: d.colors ? d.colors[sel] : d.color }))} />
          </View>
        );
      }
    }
  }

  return (
    <View onLayout={onLayout} style={{ minHeight: height }}>
      {chart}
      {legend ? <Legend cc={cc} items={datasets.map((d) => ({ label: d.label, color: d.color }))} /> : null}
    </View>
  );
}

/* Line chart with optional soft area fill. */
export function LineChart({ labels, datasets, money, integer, legend, height = 280 }) {
  const cc = useChartColors();
  const [w, onLayout] = useWidth();
  const [sel, setSel] = useState(null);
  const fmt = money ? fmtMoney : fmtNum;
  const n = labels.length;
  const all = datasets.flatMap((d) => d.data);
  const sc = scale(Math.min(0, ...all), Math.max(0, ...all), integer);
  const plotH = height - (legend ? 34 : 0);

  let chart = null;
  if (w > 0 && n > 0) {
    const yLabelW = Math.max(...sc.ticks.map((v) => fmt(v).length)) * 6.4 + 10;
    const left = yLabelW, top = 8, bottom = 26, right = 8;
    const pw = w - left - right, ph = plotH - top - bottom;
    const x = (i) => left + (n === 1 ? pw / 2 : (pw * i) / (n - 1));
    const y = (v) => top + ph - ((v - sc.min) / (sc.max - sc.min)) * ph;
    const every = Math.max(1, Math.ceil((n * 44) / pw));
    const band = pw / Math.max(1, n - 1);
    chart = (
      <Svg width={w} height={plotH}>
        {sc.ticks.map((v) => (
          <G key={v}>
            <Line x1={left} x2={w - right} y1={y(v)} y2={y(v)} stroke={cc.grid} strokeWidth={1} />
            <SvgText x={left - 6} y={y(v) + 4} fontSize={FONT} fontFamily={FONT_FAMILY} fill={cc.text} textAnchor="end">{fmt(v)}</SvgText>
          </G>
        ))}
        {labels.map((lab, i) => (i % every === 0 ? <SvgText key={i} x={x(i)} y={plotH - 8} fontSize={FONT} fontFamily={FONT_FAMILY} fill={cc.text} textAnchor="middle">{lab}</SvgText> : null))}
        {datasets.map((d, di) => {
          const pts = d.data.map((v, i) => [x(i), y(v || 0)]);
          const line = monotonePath(pts);
          return (
            <G key={di}>
              {d.fill ? <Path d={`${line}L${pts[pts.length - 1][0]},${y(Math.max(0, sc.min))}L${pts[0][0]},${y(Math.max(0, sc.min))}Z`} fill={d.color} fillOpacity={0.13} /> : null}
              <Path d={line} stroke={d.color} strokeWidth={2} fill="none" />
            </G>
          );
        })}
        {sel !== null ? (
          <G>
            <Line x1={x(sel)} x2={x(sel)} y1={top} y2={top + ph} stroke={cc.text} strokeOpacity={0.35} strokeWidth={1} />
            {datasets.map((d, di) => <Circle key={di} cx={x(sel)} cy={y(d.data[sel] || 0)} r={5} fill={d.color} stroke={cc.surface} strokeWidth={2} />)}
          </G>
        ) : null}
        {labels.map((_, i) => (
          <Rect key={`hit${i}`} x={x(i) - band / 2} y={top} width={band} height={ph} fill="transparent" onPress={() => setSel(sel === i ? null : i)} />
        ))}
      </Svg>
    );
    if (sel !== null && sel < n) {
      chart = (
        <View>
          {chart}
          <Tooltip width={w} x={x(sel)} y={top} title={labels[sel]} lines={datasets.map((d) => ({ label: d.label, value: fmt(d.data[sel] || 0), color: d.color }))} />
        </View>
      );
    }
  }

  return (
    <View onLayout={onLayout} style={{ minHeight: height }}>
      {chart}
      {legend ? <Legend cc={cc} items={datasets.map((d) => ({ label: d.label, color: d.color }))} /> : null}
    </View>
  );
}

/* Doughnut (65% cutout) with the legend underneath. */
export function DonutChart({ labels, data, colors, height = 280 }) {
  const cc = useChartColors();
  const [w, onLayout] = useWidth();
  const [sel, setSel] = useState(null);
  const total = data.reduce((s, v) => s + v, 0);
  const size = Math.min(w, height - 70);
  const r = size / 2, ir = r * 0.65, c = w / 2;

  const arcs = [];
  let a0 = -Math.PI / 2;
  data.forEach((v, i) => {
    if (!v) return;
    const a1 = a0 + (v / total) * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (rad, a) => `${c + rad * Math.cos(a)},${r + rad * Math.sin(a)}`;
    const full = v === total;
    const d = `M${p(r, a0)}A${r},${r} 0 ${large} 1 ${p(r, a1)}L${p(ir, a1)}A${ir},${ir} 0 ${large} 0 ${p(ir, a0)}Z`;
    arcs.push({ d, color: colors[i], i, full });
    a0 = a1;
  });

  return (
    <View onLayout={onLayout}>
      {w > 0 && total > 0 ? (
        <View style={{ alignItems: 'center' }}>
          <Svg width={w} height={size}>
            {arcs.map((a) => (a.full
              // A single 100% slice: an SVG arc can't start and end at the same point, so draw a ring.
              ? <Circle key={a.i} cx={c} cy={r} r={(r + ir) / 2} stroke={a.color} strokeWidth={r - ir} fill="none" onPress={() => setSel(sel === a.i ? null : a.i)} />
              : <Path key={a.i} d={a.d} fill={a.color} stroke={cc.surface} strokeWidth={2} onPress={() => setSel(sel === a.i ? null : a.i)} />))}
          </Svg>
          {sel !== null ? (
            <View pointerEvents="none" style={[styles.donutCenter, { top: size / 2 - 22 }]}>
              <Text style={[styles.donutValue, { color: colors[sel] }]}>{data[sel]}</Text>
              <Text style={[styles.donutLabel, { color: cc.text }]} numberOfLines={1}>{labels[sel]}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      <Legend cc={cc} items={labels.map((l, i) => ({ label: l, color: colors[i] }))} />
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12 },
  tooltip: { position: 'absolute', width: 170, backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: 6, paddingVertical: 7, paddingHorizontal: 9, gap: 3 },
  tooltipTitle: { color: '#fff', fontSize: 12, fontWeight: '700' },
  tooltipRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tooltipDot: { width: 9, height: 9, borderRadius: 2, borderWidth: 1, borderColor: '#fff' },
  tooltipText: { color: '#fff', fontSize: 12, flexShrink: 1 },
  donutCenter: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  donutValue: { fontSize: 22, fontWeight: '800' },
  donutLabel: { fontSize: 12, maxWidth: 120 },
});

