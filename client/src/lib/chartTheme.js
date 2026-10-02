import { useTheme } from '../theme/ThemeProvider.jsx';
import { chartPalette, CHART_STATUS, fmtMoney } from '../../../shared/chartPalette';

/* Palette + status colors live in shared/chartPalette.js (the mobile app
   draws its charts from the same values). They're keyed off the theme
   scheme rather than read from CSS variables, because the data-theme
   attribute flips in an effect *after* React renders, so reading CSS
   variables at render time would lag one theme behind. */
export const STATUS = CHART_STATUS;
export { fmtMoney };

export function useChartTheme() {
  const { scheme } = useTheme();
  return chartPalette(scheme);
}

/* Shared Chart.js options for bar/line charts: recessive hairline grid, no
   axis clutter, index-mode tooltips (a hover anywhere in a column shows
   every series at that point). */
export function cartesianOptions(ct, { horizontal = false, stacked = false, legend = false, money = false, integer = false } = {}) {
  const valueTicks = { color: ct.text, font: { size: 11 }, padding: 6 };
  if (money) valueTicks.callback = (v) => fmtMoney(v);
  if (integer) valueTicks.precision = 0;
  const valueAxis = { beginAtZero: true, stacked, grid: { color: ct.grid, drawTicks: false }, border: { display: false }, ticks: valueTicks };
  const categoryAxis = { stacked, grid: { display: false }, border: { color: ct.grid }, ticks: { color: ct.text, font: { size: 11 } } };

  const tooltip = {};
  if (money) {
    tooltip.callbacks = { label: (c) => `${c.dataset.label ? c.dataset.label + ': ' : ''}${fmtMoney(horizontal ? c.parsed.x : c.parsed.y)}` };
  }

  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: horizontal ? 'y' : 'x',
    interaction: { mode: 'index', intersect: false, axis: horizontal ? 'y' : 'x' },
    scales: horizontal ? { x: valueAxis, y: categoryAxis } : { x: categoryAxis, y: valueAxis },
    plugins: {
      legend: { display: legend, position: 'bottom', labels: { color: ct.text, usePointStyle: true, pointStyleWidth: 10, padding: 14, font: { size: 12 } } },
      valueLabels: { money, color: ct.text, surface: ct.surface },
      tooltip
    }
  };
}

export function doughnutOptions(ct, { money = false } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '65%',
    plugins: { legend: { position: 'bottom', labels: { color: ct.text, usePointStyle: true, pointStyleWidth: 10, padding: 14, font: { size: 12 } } }, valueLabels: { money, color: ct.text } }
  };
}

/* Thin bars, rounded only at the data end; stacked segments get a 2px
   surface-colored gap instead of an outline. */
export function barDataset(ct, label, data, color, { stacked = false } = {}) {
  return {
    label,
    data,
    backgroundColor: color,
    borderColor: ct.surface,
    borderWidth: stacked ? 2 : 0,
    borderRadius: stacked ? 2 : 4,
    borderSkipped: 'start',
    maxBarThickness: 30
  };
}

export function lineDataset(label, data, color, { fill = false } = {}) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: color + '22',
    fill,
    borderWidth: 2,
    tension: 0.3,
    cubicInterpolationMode: 'monotone', // no overshoot below zero between sparse points
    pointRadius: 3, // a visible dot for each labelled value
    pointHoverRadius: 5,
    pointHitRadius: 14,
    pointBackgroundColor: color
  };
}
