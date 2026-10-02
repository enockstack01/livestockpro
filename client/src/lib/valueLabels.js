import { Chart } from 'chart.js';
import { formatCompact, formatMoneyCompact } from '../../../shared/currency';

/* Every chart shows the numbers it draws. Registered once for all Chart.js
   charts (useChart.js):
   - bars: the value at the end of each bar (turned upright when it is wider
     than the bar); stacked bars show each segment that fits plus the total
   - lines: the value above each point
   - doughnuts: the value on each slice that fits, and "label: value (pct%)"
     in the legend
   Options: plugins.valueLabels = { display, money, color }. Values are
   shortened (12.4K) so they fit; tooltips still show the exact figure. */

const FONT = '600 11px Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function textColor(opts) {
  if (opts.color) return opts.color;
  const css = getComputedStyle(document.documentElement).getPropertyValue('--text-light').trim();
  return css || '#546E7A';
}

function formatter(opts) {
  return opts.money ? (v) => formatMoneyCompact(v) : (v) => formatCompact(v);
}

function drawText(ctx, text, x, y, { color, align = 'center', baseline = 'middle', rotate = false, halo = null }) {
  ctx.save();
  if (halo) { ctx.strokeStyle = halo; ctx.lineWidth = 3; ctx.lineJoin = 'round'; }
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (rotate) {
    ctx.translate(x, y);
    ctx.rotate(-Math.PI / 2);
    if (halo) ctx.strokeText(text, 0, 0);
    ctx.fillText(text, 0, 0);
  } else {
    if (halo) ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
  }
  ctx.restore();
}

export const valueLabelsPlugin = {
  id: 'valueLabels',
  defaults: { display: true, money: false, color: null, surface: null },
  afterDatasetsDraw(chart, _args, opts) {
    if (opts.display === false) return;
    const { ctx } = chart;
    const fmt = formatter(opts);
    const ink = textColor(opts);
    const surface = opts.surface || getComputedStyle(document.documentElement).getPropertyValue('--card').trim() || '#FFFFFF';
    ctx.save();
    ctx.font = FONT;

    if (chart.config.type === 'doughnut' || chart.config.type === 'pie') {
      chart.data.datasets.forEach((ds, di) => {
        if (!chart.isDatasetVisible(di)) return;
        const meta = chart.getDatasetMeta(di);
        meta.data.forEach((arc, i) => {
          const v = Number(ds.data[i]) || 0;
          if (!v || arc.hidden || chart.getDataVisibility?.(i) === false) return;
          const { startAngle, endAngle, innerRadius, outerRadius, x, y } = arc.getProps(['startAngle', 'endAngle', 'innerRadius', 'outerRadius', 'x', 'y']);
          if (endAngle - startAngle < 0.3) return; // too thin to hold a number; the legend lists it
          const mid = (startAngle + endAngle) / 2;
          const r = (innerRadius + outerRadius) / 2;
          drawText(ctx, fmt(v), x + Math.cos(mid) * r, y + Math.sin(mid) * r, { color: '#FFFFFF' });
        });
      });
      ctx.restore();
      return;
    }

    const horizontal = chart.options.indexAxis === 'y';
    const valueScale = chart.scales[horizontal ? 'x' : 'y'];
    const stacked = !!(valueScale && valueScale.options.stacked);
    const totals = new Map(); // index -> { sum, end (pixel), center }

    chart.data.datasets.forEach((ds, di) => {
      if (!chart.isDatasetVisible(di)) return;
      const meta = chart.getDatasetMeta(di);
      meta.data.forEach((el, i) => {
        const raw = ds.data[i];
        const v = Number(raw && typeof raw === 'object' ? (horizontal ? raw.x : raw.y) : raw) || 0;
        const text = fmt(v);
        const w = ctx.measureText(text).width;

        if (meta.type === 'line') {
          const { x, y } = el.getProps(['x', 'y']);
          drawText(ctx, text, x, y - 9, { color: ink, baseline: 'bottom', halo: surface });
          return;
        }

        const { x, y, base, width, height } = el.getProps(['x', 'y', 'base', 'width', 'height']);
        if (stacked) {
          if (v > 0) {
            const t = totals.get(i) || { sum: 0, end: horizontal ? -Infinity : Infinity, center: horizontal ? y : x };
            t.sum += v;
            t.end = horizontal ? Math.max(t.end, x) : Math.min(t.end, y);
            totals.set(i, t);
            const segLen = Math.abs(horizontal ? x - base : base - y);
            const thickness = horizontal ? height : width;
            if (segLen >= (horizontal ? w + 6 : 14) && thickness >= (horizontal ? 12 : w + 4)) {
              drawText(ctx, text, horizontal ? (x + base) / 2 : x, horizontal ? y : (y + base) / 2, { color: '#FFFFFF' });
            }
          }
          return;
        }

        if (horizontal) {
          const neg = v < 0;
          drawText(ctx, text, neg ? x - 5 : x + 5, y, { color: ink, align: neg ? 'right' : 'left' });
        } else {
          const neg = v < 0;
          const rotate = w > width + 6;
          if (rotate) drawText(ctx, text, x, neg ? y + 5 : y - 5, { color: ink, align: neg ? 'right' : 'left', rotate: true });
          else drawText(ctx, text, x, neg ? y + 5 : y - 5, { color: ink, baseline: neg ? 'top' : 'bottom' });
        }
      });
    });

    totals.forEach((t) => {
      const text = fmt(t.sum);
      if (horizontal) drawText(ctx, text, t.end + 5, t.center, { color: ink, align: 'left' });
      else drawText(ctx, text, t.center, t.end - 5, { color: ink, baseline: 'bottom' });
    });
    ctx.restore();
  }
};

let registered = false;

export function registerValueLabels() {
  if (registered) return;
  registered = true;
  Chart.register(valueLabelsPlugin);

  /* Headroom on value axes so labels at the end of the longest bar or the
     highest point stay inside the canvas. */
  Chart.defaults.scales.linear.grace = '18%';
  Chart.defaults.layout.padding = { top: 6, right: 12, left: 0, bottom: 0 };

  /* Doughnut legends read "Label: value (pct%)". */
  const base = Chart.overrides.doughnut.plugins.legend.labels.generateLabels;
  Chart.overrides.doughnut.plugins.legend.labels.generateLabels = (chart) => {
    const items = base(chart);
    const data = (chart.data.datasets[0] && chart.data.datasets[0].data) || [];
    const total = data.reduce((s, v) => s + (Number(v) || 0), 0);
    const fmt = formatter((chart.options.plugins && chart.options.plugins.valueLabels) || {});
    return items.map((it) => {
      const v = Number(data[it.index]) || 0;
      return { ...it, text: `${it.text}: ${fmt(v)} (${total ? Math.round((v / total) * 100) : 0}%)` };
    });
  };
}
